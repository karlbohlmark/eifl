import {
  upsertPipeline,
  getPipelines,
  getPipeline,
  deletePipeline,
  createRun,
  getRuns,
  getRun,
  updateRunStatus,
  getSteps,
  createStep,
  getMetrics,
  getMetricHistory,
  getRepo,
} from "../db/queries";
import { getLatestCommit } from "../git/http";

export interface PipelineConfig {
  name: string;
  triggers?: {
    push?: { branches?: string[] };
    manual?: boolean;
  };
  steps: Array<{
    name: string;
    run: string;
    capture_sizes?: string[];
  }>;
}

export function validatePipelineConfig(config: unknown): config is PipelineConfig {
  if (!config || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;

  if (typeof c.name !== "string") return false;
  if (!Array.isArray(c.steps)) return false;

  for (const step of c.steps) {
    if (!step || typeof step !== "object") return false;
    if (typeof step.name !== "string") return false;
    if (typeof step.run !== "string") return false;
  }

  return true;
}

// Pipeline CRUD
export async function handleCreatePipeline(repoId: number, req: Request): Promise<Response> {
  const repo = getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const body = await req.json();

  if (!validatePipelineConfig(body)) {
    return Response.json({ error: "Invalid pipeline configuration" }, { status: 400 });
  }

  const pipeline = upsertPipeline(repoId, body.name, body);
  return Response.json(pipeline, { status: 201 });
}

export function handleGetPipelines(repoId: number): Response {
  const repo = getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const pipelines = getPipelines(repoId);
  return Response.json(pipelines);
}

export function handleGetPipeline(id: number): Response {
  const pipeline = getPipeline(id);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }
  return Response.json(pipeline);
}

export function handleDeletePipeline(id: number): Response {
  const success = deletePipeline(id);
  if (!success) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

// Trigger pipeline
export async function handleTriggerPipeline(
  id: number,
  req: Request
): Promise<Response> {
  const pipeline = getPipeline(id);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const repo = getRepo(pipeline.repo_id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { branch?: string; commit?: string; trigger_type?: string };
  const branch = body.branch || repo.default_branch;
  let commitSha = body.commit;

  if (!commitSha) {
    commitSha = await getLatestCommit(repo.path, branch) ?? undefined;
  }

  // Allow specifying trigger type for testing scheduled/push behavior
  const validTriggerTypes = ["manual", "schedule", "push"];
  const triggerType = body.trigger_type && validTriggerTypes.includes(body.trigger_type)
    ? body.trigger_type
    : "manual";

  const run = createRun(id, commitSha, branch, triggerType);

  // Create steps from pipeline config
  const config = JSON.parse(pipeline.config) as PipelineConfig;
  for (const step of config.steps) {
    createStep(run.id, step.name, step.run);
  }

  return Response.json(run, { status: 201 });
}

// Runs
export function handleGetRuns(pipelineId: number, limit = 50): Response {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const runs = getRuns(pipelineId, limit);
  return Response.json(runs);
}

export function handleGetRun(id: number): Response {
  const run = getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const steps = getSteps(id);
  const metrics = getMetrics(id);
  const pipeline = getPipeline(run.pipeline_id);

  return Response.json({ ...run, steps, metrics, pipeline });
}

export function handleCancelRun(id: number): Response {
  const run = getRun(id);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "pending" && run.status !== "running") {
    return Response.json({ error: "Run cannot be cancelled" }, { status: 400 });
  }

  updateRunStatus(id, "cancelled");
  return Response.json({ success: true });
}

// Metrics
export function handleGetMetricHistory(pipelineId: number, key: string, limit = 100): Response {
  const history = getMetricHistory(pipelineId, key, limit);
  return Response.json(history);
}
