import {
  createRunner,
  getRunners,
  getRunner,
  getRunnerByToken,
  updateRunnerStatus,
  updateRunnerHeartbeat,
  updateRunnerTags,
  updateRunnerMaxConcurrency,
  getRunnerTags,
  deleteRunner,
  incrementRunnerActiveJobs,
  decrementRunnerActiveJobs,
  getPendingRuns,
  getRun,
  updateRunStatus,
  getSteps,
  updateStepStatus,
  appendStepOutput,
  createMetric,
  getPipeline,
  getRepo,
  getSecretsForRepo,
  compareMetricsToBaselines,
} from "../db/queries";
import { updateCommitStatus } from "../lib/github";
import { getPipelineUrl } from "../lib/utils";
import { decryptSecret, isEncryptionConfigured } from "../lib/crypto";
import type { Run, Step, Runner } from "../db/schema";

// Runner management
export async function handleCreateRunner(req: Request): Promise<Response> {
  const body = await req.json() as { name: string; tags?: string[]; max_concurrency?: number };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  // Validate tags if provided
  const tags = body.tags ?? [];
  if (!Array.isArray(tags) || !tags.every(t => typeof t === "string")) {
    return Response.json({ error: "Tags must be an array of strings" }, { status: 400 });
  }

  // Validate max_concurrency if provided
  const maxConcurrency = body.max_concurrency ?? 1;
  if (typeof maxConcurrency !== "number" || maxConcurrency < 1) {
    return Response.json({ error: "max_concurrency must be a positive number" }, { status: 400 });
  }

  const runner = createRunner(body.name, tags, maxConcurrency);
  return Response.json(runner, { status: 201 });
}

export async function handleUpdateRunnerTags(id: number, req: Request): Promise<Response> {
  const body = await req.json() as { tags: string[] };

  if (!Array.isArray(body.tags) || !body.tags.every(t => typeof t === "string")) {
    return Response.json({ error: "Tags must be an array of strings" }, { status: 400 });
  }

  const success = updateRunnerTags(id, body.tags);
  if (!success) {
    return Response.json({ error: "Runner not found" }, { status: 404 });
  }

  const runner = getRunner(id);
  return Response.json(runner);
}

export async function handleUpdateRunnerMaxConcurrency(id: number, req: Request): Promise<Response> {
  const body = await req.json() as { max_concurrency: number };

  if (typeof body.max_concurrency !== "number" || body.max_concurrency < 1) {
    return Response.json({ error: "max_concurrency must be a positive number" }, { status: 400 });
  }

  const success = updateRunnerMaxConcurrency(id, body.max_concurrency);
  if (!success) {
    return Response.json({ error: "Runner not found" }, { status: 404 });
  }

  const runner = getRunner(id);
  return Response.json(runner);
}

export function handleGetRunners(): Response {
  const runners = getRunners();
  // Don't expose tokens in list, parse tags to array
  const safeRunners = runners.map(({ token, tags, ...r }) => ({
    ...r,
    tags: getRunnerTags({ token, tags, ...r } as Runner),
  }));
  return Response.json(safeRunners);
}

export function handleDeleteRunner(id: number): Response {
  const success = deleteRunner(id);
  if (!success) {
    return Response.json({ error: "Runner not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

// Runner auth middleware
export function authenticateRunner(req: Request): Runner | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7);
  return getRunnerByToken(token);
}

// Runner job polling
export interface JobPayload {
  run: Run;
  steps: Step[];
  repoUrl: string;
  commitSha: string | null;
  branch: string | null;
  pipelineConfig: object;
  secrets: Record<string, string>;
}

// Check if runner has all required tags for a pipeline
function runnerMatchesTags(runnerTags: string[], requiredTags?: string[]): boolean {
  if (!requiredTags || requiredTags.length === 0) {
    return true; // No tags required, any runner can run this
  }
  // Runner must have ALL required tags
  return requiredTags.every(tag => runnerTags.includes(tag));
}

export async function handlePollForJob(runner: Runner): Promise<Response> {
  // Update heartbeat
  updateRunnerHeartbeat(runner.id);

  // Check if runner has capacity for more jobs
  if (runner.active_jobs >= runner.max_concurrency) {
    return Response.json({ job: null });
  }

  // Get runner's tags
  const runnerTags = getRunnerTags(runner);

  // Find pending runs
  const pendingRuns = getPendingRuns();
  if (pendingRuns.length === 0) {
    return Response.json({ job: null });
  }

  // Find the first pending run that matches this runner's tags
  let matchedRun: Run | null = null;
  let matchedPipeline: ReturnType<typeof getPipeline> = null;
  let matchedRepo: ReturnType<typeof getRepo> = null;

  for (const run of pendingRuns) {
    const pipeline = getPipeline(run.pipeline_id);
    if (!pipeline) continue;

    const pipelineConfig = JSON.parse(pipeline.config);
    const requiredTags = pipelineConfig.runner_tags as string[] | undefined;

    if (runnerMatchesTags(runnerTags, requiredTags)) {
      const repo = getRepo(pipeline.repo_id);
      if (repo) {
        matchedRun = run;
        matchedPipeline = pipeline;
        matchedRepo = repo;
        break;
      }
    }
  }

  if (!matchedRun || !matchedPipeline || !matchedRepo) {
    return Response.json({ job: null });
  }

  const run = matchedRun;
  const pipeline = matchedPipeline;
  const repo = matchedRepo;

  // Increment active jobs
  incrementRunnerActiveJobs(runner.id);

  // Mark runner as busy if at capacity, otherwise keep it online
  const newActiveJobs = runner.active_jobs + 1;
  if (newActiveJobs >= runner.max_concurrency) {
    updateRunnerStatus(runner.id, "busy");
  } else {
    updateRunnerStatus(runner.id, "online");
  }

  // Mark run as running
  updateRunStatus(run.id, "running");

  // Update GitHub status to pending/running
  if (run.commit_sha) {
      // We already fetched pipeline and repo above
      const runUrl = getPipelineUrl(pipeline.id);
      updateCommitStatus(repo, run.commit_sha, "pending", runUrl, "Build running...")
        .catch(e => console.error("Failed to set running status:", e));
  }

  const steps = getSteps(run.id);
  const pipelineConfig = JSON.parse(pipeline.config);

  // Construct repo URL (assumes server URL is known by runner)
  // If remote_url is present, use that instead of local git server
  let repoUrl = repo.remote_url || `/git/${repo.path}`;

  // If using GitHub and token is available, inject it into the URL for authentication
  if (repoUrl.startsWith("https://github.com/") && process.env.GITHUB_TOKEN) {
    try {
      const githubUrl = new URL(repoUrl);
      githubUrl.username = "oauth2";
      githubUrl.password = process.env.GITHUB_TOKEN;
      repoUrl = githubUrl.toString();
    } catch (e) {
      console.error("Failed to construct GitHub URL with token:", e);
      // Fallback: leave repoUrl unchanged if URL construction fails
    }
  }

  // Decrypt secrets for this repo
  const secrets: Record<string, string> = {};
  if (isEncryptionConfigured()) {
    const encryptedSecrets = getSecretsForRepo(repo.id);
    for (const secret of encryptedSecrets) {
      try {
        secrets[secret.name] = await decryptSecret(secret.encrypted_value, secret.iv);
      } catch (e) {
        console.error(`Failed to decrypt secret ${secret.name}:`, e);
      }
    }
  }

  const job: JobPayload = {
    run,
    steps,
    repoUrl,
    commitSha: run.commit_sha,
    branch: run.branch,
    pipelineConfig,
    secrets,
  };

  return Response.json({ job });
}

// Runner reporting
export interface StepUpdatePayload {
  stepId: number;
  status: "running" | "success" | "failed" | "skipped";
  exitCode?: number;
  output?: string;
}

export interface RunCompletePayload {
  runId: number;
  status: "success" | "failed";
  metrics?: Array<{ key: string; value: number; unit?: string }>;
}

export async function handleStepUpdate(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as StepUpdatePayload;

  if (!body.stepId || !body.status) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  updateStepStatus(body.stepId, body.status, body.exitCode);

  if (body.output) {
    appendStepOutput(body.stepId, body.output);
  }

  updateRunnerHeartbeat(runner.id);
  return Response.json({ success: true });
}

export async function handleStepOutput(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as { stepId: number; output: string };

  if (!body.stepId || !body.output) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  appendStepOutput(body.stepId, body.output);
  updateRunnerHeartbeat(runner.id);
  return Response.json({ success: true });
}

export async function handleRunComplete(runner: Runner, req: Request): Promise<Response> {
  const body = await req.json() as RunCompletePayload;

  if (!body.runId || !body.status) {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  updateRunStatus(body.runId, body.status);

  // Update GitHub status
  try {
    const run = getRun(body.runId);
    if (run && run.commit_sha) {
      const pipeline = getPipeline(run.pipeline_id);
      if (pipeline) {
        const repo = getRepo(pipeline.repo_id);
        if (repo) {
            const runUrl = getPipelineUrl(pipeline.id);
            const description = body.status === "success" ? "Build passed" : "Build failed";
            const state = body.status === "success" ? "success" : "failure";

            // Fire and forget
            updateCommitStatus(repo, run.commit_sha, state, runUrl, description)
                .catch(err => console.error("Failed to update status on complete:", err));
        }
      }
    }
  } catch (error) {
    console.error("Error updating status:", error);
  }

  // Record metrics
  if (body.metrics) {
    for (const metric of body.metrics) {
      createMetric(body.runId, metric.key, metric.value, metric.unit);
    }
  }

  // Check for baseline regressions after recording metrics
  const baselineComparisons = compareMetricsToBaselines(body.runId);
  const regressions = baselineComparisons.filter(c => !c.withinTolerance);
  const hasRegressions = regressions.length > 0;

  // Log regressions for visibility
  if (hasRegressions) {
    console.log(`[Run ${body.runId}] Performance regressions detected:`);
    for (const r of regressions) {
      console.log(`  - ${r.key}: ${r.currentValue} (baseline: ${r.baselineValue}, deviation: ${r.deviationPct.toFixed(2)}%, tolerance: ${r.tolerancePct}%)`);
    }
  }

  // Decrement active jobs
  decrementRunnerActiveJobs(runner.id);

  // Mark runner as available (always online after completing a job)
  updateRunnerStatus(runner.id, "online");

  return Response.json({
    success: true,
    baselineCheck: {
      checked: baselineComparisons.length,
      regressions: regressions.length,
      hasRegressions,
    },
  });
}

export function handleRunnerHeartbeat(runner: Runner): Response {
  updateRunnerHeartbeat(runner.id);
  updateRunnerStatus(runner.id, "online");
  return Response.json({ success: true });
}
