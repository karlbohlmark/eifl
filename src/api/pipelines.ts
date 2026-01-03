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
  getBaselines,
  getBaseline,
  upsertBaseline,
  deleteBaseline,
  compareMetricsToBaselines,
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

  // Include baseline comparisons for completed runs
  const baselineComparisons = run.status === "success" || run.status === "failed"
    ? compareMetricsToBaselines(id)
    : [];

  return Response.json({ ...run, steps, metrics, pipeline, baselineComparisons });
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

// Baselines
export function handleGetBaselines(pipelineId: number): Response {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const baselines = getBaselines(pipelineId);
  return Response.json(baselines);
}

export function handleGetBaseline(pipelineId: number, key: string): Response {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const baseline = getBaseline(pipelineId, key);
  if (!baseline) {
    return Response.json({ error: "Baseline not found" }, { status: 404 });
  }

  return Response.json(baseline);
}

export async function handleUpsertBaseline(pipelineId: number, req: Request): Promise<Response> {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const body = await req.json() as { key: string; baseline_value: number; tolerance_pct?: number };

  if (!body.key || typeof body.key !== "string") {
    return Response.json({ error: "Key is required" }, { status: 400 });
  }

  if (typeof body.baseline_value !== "number") {
    return Response.json({ error: "Baseline value is required and must be a number" }, { status: 400 });
  }

  const tolerancePct = body.tolerance_pct ?? 10.0;
  if (typeof tolerancePct !== "number" || tolerancePct < 0) {
    return Response.json({ error: "Tolerance must be a non-negative number" }, { status: 400 });
  }

  const baseline = upsertBaseline(pipelineId, body.key, body.baseline_value, tolerancePct);
  return Response.json(baseline, { status: 201 });
}

export function handleDeleteBaseline(pipelineId: number, key: string): Response {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) {
    return Response.json({ error: "Pipeline not found" }, { status: 404 });
  }

  const success = deleteBaseline(pipelineId, key);
  if (!success) {
    return Response.json({ error: "Baseline not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

// Update baselines from a successful run's metrics
export function handleUpdateBaselinesFromRun(runId: number): Response {
  const run = getRun(runId);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  if (run.status !== "success") {
    return Response.json({ error: "Can only update baselines from successful runs" }, { status: 400 });
  }

  const metrics = getMetrics(runId);
  const updated: string[] = [];

  for (const metric of metrics) {
    // Get existing baseline to preserve tolerance, or use default
    const existing = getBaseline(run.pipeline_id, metric.key);
    const tolerance = existing?.tolerance_pct ?? 10.0;

    upsertBaseline(run.pipeline_id, metric.key, metric.value, tolerance);
    updated.push(metric.key);
  }

  return Response.json({ updated, count: updated.length });
}

// Compare a run's metrics against baselines
export function handleCompareRunToBaselines(runId: number): Response {
  const run = getRun(runId);
  if (!run) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const comparisons = compareMetricsToBaselines(runId);

  // Calculate summary
  const regressions = comparisons.filter(c => !c.withinTolerance);
  const hasRegressions = regressions.length > 0;

  return Response.json({
    comparisons,
    summary: {
      total: comparisons.length,
      withinTolerance: comparisons.filter(c => c.withinTolerance).length,
      regressions: regressions.length,
      hasRegressions,
    },
    regressions: regressions.map(r => ({
      key: r.key,
      current: r.currentValue,
      baseline: r.baselineValue,
      deviation: `${r.deviationPct.toFixed(2)}%`,
      tolerance: `${r.tolerancePct}%`,
    })),
  });
}
