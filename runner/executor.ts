import { $ } from "bun";
import { collectMetrics } from "./metrics";
import type { Run, Step } from "../src/db/schema";

export interface JobPayload {
  run: Run;
  steps: Step[];
  repoUrl: string;
  commitSha: string | null;
  branch: string | null;
  pipelineConfig: {
    name: string;
    steps: Array<{
      name: string;
      run: string;
      capture_sizes?: string[];
    }>;
  };
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

    // Mask token in logs
    const maskedUrl = gitUrl.replace(/oauth2:[^@]+@/, "oauth2:***@");
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

    // Execute steps
    let allSuccess = true;
    const allMetrics: Array<{ key: string; value: number; unit?: string }> = [];
    const stepStartTime = Date.now();

    for (let i = 0; i < job.steps.length; i++) {
      const step = job.steps[i];
      const configStep = job.pipelineConfig.steps[i];

      console.log(`\n🔄 Step ${i + 1}/${job.steps.length}: ${step.name}`);
      await callbacks.onStepStart(step.id);

      const stepStart = Date.now();
      let output = "";
      let exitCode = 0;

      try {
        // Execute the command
        const result = await executeCommand(step.command, workDir, (chunk) => {
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
  onOutput: (chunk: string) => void
): Promise<{ exitCode: number; output: string }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
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
