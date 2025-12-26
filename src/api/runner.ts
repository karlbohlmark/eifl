import {
  createRunner,
  getRunners,
  getRunner,
  getRunnerByToken,
  updateRunnerStatus,
  updateRunnerHeartbeat,
  deleteRunner,
  getPendingRuns,
  getRun,
  updateRunStatus,
  getSteps,
  updateStepStatus,
  appendStepOutput,
  createMetric,
  getPipeline,
  getRepo,
} from "../db/queries";
import type { Run, Step, Runner } from "../db/schema";

// Runner management
export async function handleCreateRunner(req: Request): Promise<Response> {
  const body = await req.json() as { name: string };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  const runner = createRunner(body.name);
  return Response.json(runner, { status: 201 });
}

export function handleGetRunners(): Response {
  const runners = getRunners();
  // Don't expose tokens in list
  const safeRunners = runners.map(({ token, ...r }) => r);
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
}

export function handlePollForJob(runner: Runner): Response {
  // Update heartbeat
  updateRunnerHeartbeat(runner.id);

  // Find pending runs
  const pendingRuns = getPendingRuns();
  if (pendingRuns.length === 0) {
    return Response.json({ job: null });
  }

  // Pick the first pending run
  const run = pendingRuns[0];
  const pipeline = getPipeline(run.pipeline_id);
  if (!pipeline) {
    return Response.json({ job: null });
  }

  const repo = getRepo(pipeline.repo_id);
  if (!repo) {
    return Response.json({ job: null });
  }

  // Mark runner as busy and run as running
  updateRunnerStatus(runner.id, "busy");
  updateRunStatus(run.id, "running");

  const steps = getSteps(run.id);
  const pipelineConfig = JSON.parse(pipeline.config);

  // Construct repo URL (assumes server URL is known by runner)
  const repoUrl = `/git/${repo.path}`;

  const job: JobPayload = {
    run,
    steps,
    repoUrl,
    commitSha: run.commit_sha,
    branch: run.branch,
    pipelineConfig,
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

  // Record metrics
  if (body.metrics) {
    for (const metric of body.metrics) {
      createMetric(body.runId, metric.key, metric.value, metric.unit);
    }
  }

  // Mark runner as available
  updateRunnerStatus(runner.id, "online");

  return Response.json({ success: true });
}

export function handleRunnerHeartbeat(runner: Runner): Response {
  updateRunnerHeartbeat(runner.id);
  updateRunnerStatus(runner.id, "online");
  return Response.json({ success: true });
}
