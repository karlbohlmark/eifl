import { $ } from "bun";
import { collectMetrics } from "./metrics";
import { restoreCache, saveCache, type CachePresets, type CacheResult } from "./cache";
import type { Run, Step } from "../src/db/schema";

/**
 * Evaluate a conditional expression for step execution.
 * Supports simple expressions like:
 * - trigger == 'schedule'
 * - trigger == 'push'
 * - trigger == 'manual'
 *
 * @param condition - The condition string to evaluate
 * @param context - Context object containing variables like 'trigger'
 * @returns true if condition passes, false otherwise
 */
function evaluateCondition(condition: string, context: Record<string, any>): boolean {
  // Simple expression parser for equality checks
  // Format: "variable == 'value'" or "variable != 'value'"
  const eqMatch = condition.match(/^\s*(\w+)\s*==\s*'([^']+)'\s*$/);
  if (eqMatch) {
    const [, varName, expectedValue] = eqMatch;
    return context[varName!] === expectedValue;
  }

  const neqMatch = condition.match(/^\s*(\w+)\s*!=\s*'([^']+)'\s*$/);
  if (neqMatch) {
    const [, varName, expectedValue] = neqMatch;
    return context[varName!] !== expectedValue;
  }

  // If we can't parse the condition, log a warning and skip the step
  console.warn(`Unable to parse condition: "${condition}". Step will be skipped.`);
  return false;
}

export interface JobPayload {
  run: Run;
  steps: Step[];
  repoUrl: string;
  commitSha: string | null;
  branch: string | null;
  pipelineConfig: {
    name: string;
    cache?: CachePresets;
    steps: Array<{
      name: string;
      run: string;
      capture_sizes?: string[];
      if?: string;
    }>;
  };
  secrets: Record<string, string>;
}

export interface ExecutorCallbacks {
  onStepStart: (stepId: number) => Promise<void>;
  onStepOutput: (stepId: number, output: string) => Promise<void>;
  onStepComplete: (stepId: number, exitCode: number, output: string) => Promise<void>;
  onRunComplete: (
    runId: number,
    status: "success" | "failed",
    metrics?: Array<{ key: string; value: number; unit?: string }>
  ) => Promise<void>;
}

export async function executeJob(
  job: JobPayload,
  serverUrl: string,
  callbacks: ExecutorCallbacks
): Promise<void> {
  const workDir = `/tmp/eifl-run-${job.run.id}`;

  try {
    // Clean up any existing work directory
    await $`rm -rf ${workDir}`.quiet();
    await $`mkdir -p ${workDir}`.quiet();

    // Clone the repository
    // Check if repoUrl is absolute (starts with http://, https:// or git@), otherwise append serverUrl
    const isAbsolute =
      job.repoUrl.startsWith("http://") ||
      job.repoUrl.startsWith("https://") ||
      job.repoUrl.startsWith("git@");
    const gitUrl = isAbsolute ? job.repoUrl : `${serverUrl}${job.repoUrl}`;

    // Mask token in logs - handles various HTTP(S) auth formats: oauth2:token@, username:password@, token@
    // Note: SSH URLs (git@) don't use embedded credentials in the same way and are not masked
    const maskedUrl = gitUrl.replace(
      /https?:\/\/([^@/]+@)/,
      (match, credentials) => {
        // If it's in oauth2:token format, replace with oauth2:***@
        if (credentials.startsWith("oauth2:")) {
          return match.replace(credentials, "oauth2:***@");
        }
        // If it's username:password format, replace with username:***@
        else if (credentials.includes(":")) {
          const username = credentials.split(":")[0];
          return match.replace(credentials, `${username}:***@`);
        }
        // For other formats (like token@), replace with ***@
        else {
          return match.replace(credentials, "***@");
        }
      }
    );
    console.log(`Cloning ${maskedUrl}...`);

    const cloneResult = await $`git clone ${gitUrl} ${workDir}`.quiet();
    if (cloneResult.exitCode !== 0) {
      throw new Error(`Failed to clone repository: ${cloneResult.stderr}`);
    }

    // Checkout the specific commit
    if (job.commitSha) {
      await $`git -C ${workDir} checkout ${job.commitSha}`.quiet();
    } else if (job.branch) {
      await $`git -C ${workDir} checkout ${job.branch}`.quiet();
    }

    // Restore cache if configured
    let cacheResults: CacheResult[] = [];
    if (job.pipelineConfig.cache) {
      console.log("\n📦 Restoring cache...");
      cacheResults = await restoreCache(workDir, job.pipelineConfig.cache);
      for (const result of cacheResults) {
        const status = result.hit ? "✅ HIT" : "❌ MISS";
        const keyInfo = result.key ? ` (${result.key.slice(0, 8)})` : "";
        console.log(`   ${result.preset}: ${status}${keyInfo}`);
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        }
      }
    }

    // Execute steps
    let allSuccess = true;
    const allMetrics: Array<{ key: string; value: number; unit?: string }> = [];
    const stepStartTime = Date.now();

    // Create context for conditional evaluation
    const context = {
      trigger: job.run.triggered_by || 'unknown',
      branch: job.branch || '',
    };

    for (let i = 0; i < job.steps.length; i++) {
      const step = job.steps[i]!;
      const configStep = job.pipelineConfig.steps[i];

      // Check if step should be skipped based on condition
      if (configStep?.if) {
        const shouldRun = evaluateCondition(configStep.if, context);
        if (!shouldRun) {
          console.log(`\n⏭️  Step ${i + 1}/${job.steps.length}: ${step.name} (skipped - condition not met: ${configStep.if})`);
          continue;
        }
      }

      console.log(`\n🔄 Step ${i + 1}/${job.steps.length}: ${step.name}`);
      await callbacks.onStepStart(step.id);

      const stepStart = Date.now();
      let output = "";
      let exitCode = 0;

      try {
        // Execute the command with secrets injected as env vars
        const result = await executeCommand(step.command, workDir, job.secrets, (chunk) => {
          output += chunk;
          process.stdout.write(chunk);
          // Stream output in chunks
          callbacks.onStepOutput(step.id, chunk);
        });

        exitCode = result.exitCode;
        output = result.output;

        // Capture file sizes if configured
        if (exitCode === 0 && configStep?.capture_sizes) {
          for (const pattern of configStep.capture_sizes) {
            const sizeMetrics = await collectMetrics.captureFileSizes(
              workDir,
              pattern
            );
            allMetrics.push(...sizeMetrics);
          }
        }
      } catch (error) {
        exitCode = 1;
        output = String(error);
      }

      const stepDuration = Date.now() - stepStart;
      allMetrics.push({
        key: `step.${step.name}.duration_ms`,
        value: stepDuration,
        unit: "ms",
      });

      await callbacks.onStepComplete(step.id, exitCode, output);

      if (exitCode !== 0) {
        console.log(`❌ Step failed with exit code ${exitCode}`);
        allSuccess = false;
        break;
      }

      console.log(`✅ Step completed`);

      // Parse any metrics from output
      const outputMetrics = collectMetrics.parseOutputMetrics(output);
      allMetrics.push(...outputMetrics);
    }

    // Save cache if configured and build succeeded
    if (job.pipelineConfig.cache && allSuccess) {
      console.log("\n📦 Saving cache...");
      const saveResults = await saveCache(workDir, job.pipelineConfig.cache);
      for (const result of saveResults) {
        if (result.key) {
          const status = result.hit ? "already cached" : "saved";
          console.log(`   ${result.preset}: ${status} (${result.durationMs}ms)`);
        }
        if (result.error) {
          console.log(`      Error: ${result.error}`);
        }
      }
    }

    // Add cache metrics
    for (const result of cacheResults) {
      allMetrics.push({
        key: `cache.${result.preset}.hit`,
        value: result.hit ? 1 : 0,
      });
      allMetrics.push({
        key: `cache.${result.preset}.restore_ms`,
        value: result.durationMs,
        unit: "ms",
      });
    }

    // Calculate total duration
    const totalDuration = Date.now() - stepStartTime;
    allMetrics.push({
      key: "total_duration_ms",
      value: totalDuration,
      unit: "ms",
    });

    // Report completion
    await callbacks.onRunComplete(
      job.run.id,
      allSuccess ? "success" : "failed",
      allMetrics
    );
  } finally {
    // Clean up work directory
    await $`rm -rf ${workDir}`.quiet();
  }
}

async function executeCommand(
  command: string,
  cwd: string,
  secrets: Record<string, string>,
  onOutput: (chunk: string) => void
): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      ...secrets, // Inject secrets as environment variables
      CI: "true",
      EIFL: "true",
    },
  });

  let output = "";

  // Read stdout
  const stdoutReader = proc.stdout.getReader();
  const stderrReader = proc.stderr.getReader();

  const readStream = async (
    reader: ReadableStreamDefaultReader<Uint8Array>
  ) => {
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      output += chunk;
      onOutput(chunk);
    }
  };

  await Promise.all([readStream(stdoutReader), readStream(stderrReader)]);

  const exitCode = await proc.exited;
  return { exitCode, output };
}
