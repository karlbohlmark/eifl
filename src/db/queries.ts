import { getDb, type Project, type Repo, type Pipeline, type Run, type Step, type Metric, type Runner, type RunStatus, type StepStatus, type RunnerStatus } from "./schema";

// Projects
export function createProject(name: string, description?: string): Project {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO projects (name, description) VALUES (?, ?) RETURNING *");
  return stmt.get(name, description ?? null) as Project;
}

export function getProjects(): Project[] {
  const db = getDb();
  return db.query("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
}

export function getProject(id: number): Project | null {
  const db = getDb();
  return db.query("SELECT * FROM projects WHERE id = ?").get(id) as Project | null;
}

export function getProjectByName(name: string): Project | null {
  const db = getDb();
  return db.query("SELECT * FROM projects WHERE name = ?").get(name) as Project | null;
}

export function deleteProject(id: number): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM projects WHERE id = ?", [id]);
  return result.changes > 0;
}

// Repos
export function createRepo(projectId: number, name: string, path: string, remoteUrl?: string): Repo {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO repos (project_id, name, path, remote_url) VALUES (?, ?, ?, ?) RETURNING *");
  return stmt.get(projectId, name, path, remoteUrl || null) as Repo;
}

export function getRepos(projectId: number): Repo[] {
  const db = getDb();
  return db.query("SELECT * FROM repos WHERE project_id = ? ORDER BY name").all(projectId) as Repo[];
}

export function getRepo(id: number): Repo | null {
  const db = getDb();
  return db.query("SELECT * FROM repos WHERE id = ?").get(id) as Repo | null;
}

export function getRepoByPath(path: string): Repo | null {
  const db = getDb();
  return db.query("SELECT * FROM repos WHERE path = ?").get(path) as Repo | null;
}

export function getRepoByRemoteUrl(url: string): Repo | null {
  const db = getDb();
  return db.query("SELECT * FROM repos WHERE remote_url = ?").get(url) as Repo | null;
}

export function deleteRepo(id: number): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM repos WHERE id = ?", [id]);
  return result.changes > 0;
}

// Pipelines
export function createPipeline(repoId: number, name: string, config: object): Pipeline {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO pipelines (repo_id, name, config) VALUES (?, ?, ?) RETURNING *");
  return stmt.get(repoId, name, JSON.stringify(config)) as Pipeline;
}

export function upsertPipeline(repoId: number, name: string, config: object): Pipeline {
  const db = getDb();
  const configJson = JSON.stringify(config);
  const stmt = db.prepare(`
    INSERT INTO pipelines (repo_id, name, config) VALUES (?, ?, ?)
    ON CONFLICT(repo_id, name) DO UPDATE SET config = excluded.config
    RETURNING *
  `);
  return stmt.get(repoId, name, configJson) as Pipeline;
}

export interface PipelineWithLatestRun extends Pipeline {
  latest_run_status: RunStatus | null;
  latest_run_id: number | null;
  latest_run_date: string | null;
}

export function getPipelines(repoId: number): PipelineWithLatestRun[] {
  const db = getDb();
  return db.query(`
    SELECT p.*,
           r.status as latest_run_status,
           r.id as latest_run_id,
           r.created_at as latest_run_date
    FROM pipelines p
    LEFT JOIN runs r ON r.id = (
      SELECT id FROM runs WHERE pipeline_id = p.id ORDER BY created_at DESC LIMIT 1
    )
    WHERE p.repo_id = ?
    ORDER BY p.name
  `).all(repoId) as PipelineWithLatestRun[];
}

export function getPipeline(id: number): Pipeline | null {
  const db = getDb();
  return db.query("SELECT * FROM pipelines WHERE id = ?").get(id) as Pipeline | null;
}

export function deletePipeline(id: number): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM pipelines WHERE id = ?", [id]);
  return result.changes > 0;
}

// Runs
export function createRun(pipelineId: number, commitSha?: string, branch?: string, triggeredBy?: string): Run {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO runs (pipeline_id, commit_sha, branch, triggered_by) VALUES (?, ?, ?, ?) RETURNING *");
  return stmt.get(pipelineId, commitSha ?? null, branch ?? null, triggeredBy ?? null) as Run;
}

export function getRuns(pipelineId: number, limit = 50): Run[] {
  const db = getDb();
  return db.query("SELECT * FROM runs WHERE pipeline_id = ? ORDER BY created_at DESC LIMIT ?").all(pipelineId, limit) as Run[];
}

export function getRecentRuns(limit = 50): Run[] {
  const db = getDb();
  return db.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT ?").all(limit) as Run[];
}

export function getRun(id: number): Run | null {
  const db = getDb();
  return db.query("SELECT * FROM runs WHERE id = ?").get(id) as Run | null;
}

export function updateRunStatus(id: number, status: RunStatus): void {
  const db = getDb();
  if (status === "running") {
    db.run("UPDATE runs SET status = ?, started_at = datetime('now') WHERE id = ?", [status, id]);
  } else if (status === "success" || status === "failed" || status === "cancelled") {
    db.run("UPDATE runs SET status = ?, finished_at = datetime('now') WHERE id = ?", [status, id]);
  } else {
    db.run("UPDATE runs SET status = ? WHERE id = ?", [status, id]);
  }
}

export function getPendingRuns(): Run[] {
  const db = getDb();
  return db.query("SELECT * FROM runs WHERE status = 'pending' ORDER BY created_at ASC").all() as Run[];
}

// Steps
export function createStep(runId: number, name: string, command: string): Step {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO steps (run_id, name, command) VALUES (?, ?, ?) RETURNING *");
  return stmt.get(runId, name, command) as Step;
}

export function getSteps(runId: number): Step[] {
  const db = getDb();
  return db.query("SELECT * FROM steps WHERE run_id = ? ORDER BY id").all(runId) as Step[];
}

export function updateStepStatus(id: number, status: StepStatus, exitCode?: number, output?: string): void {
  const db = getDb();
  if (status === "running") {
    db.run("UPDATE steps SET status = ?, started_at = datetime('now') WHERE id = ?", [status, id]);
  } else if (status === "success" || status === "failed") {
    db.run(
      "UPDATE steps SET status = ?, exit_code = ?, finished_at = datetime('now') WHERE id = ?",
      [status, exitCode ?? null, id]
    );
  } else {
    db.run("UPDATE steps SET status = ? WHERE id = ?", [status, id]);
  }
}

export function appendStepOutput(id: number, output: string): void {
  const db = getDb();
  db.run("UPDATE steps SET output = COALESCE(output, '') || ? WHERE id = ?", [output, id]);
}

// Metrics
export function createMetric(runId: number, key: string, value: number, unit?: string): Metric {
  const db = getDb();
  const stmt = db.prepare("INSERT INTO metrics (run_id, key, value, unit) VALUES (?, ?, ?, ?) RETURNING *");
  return stmt.get(runId, key, value, unit ?? null) as Metric;
}

export function getMetrics(runId: number): Metric[] {
  const db = getDb();
  return db.query("SELECT * FROM metrics WHERE run_id = ? ORDER BY key").all(runId) as Metric[];
}

export function getMetricHistory(pipelineId: number, key: string, limit = 100): Array<{ run_id: number; value: number; created_at: string; commit_sha: string | null }> {
  const db = getDb();
  return db.query(`
    SELECT m.run_id, m.value, m.created_at, r.commit_sha
    FROM metrics m
    JOIN runs r ON m.run_id = r.id
    WHERE r.pipeline_id = ? AND m.key = ? AND r.status = 'success'
    ORDER BY r.created_at ASC
    LIMIT ?
  `).all(pipelineId, key, limit) as Array<{ run_id: number; value: number; created_at: string; commit_sha: string | null }>;
}

// Runners
export function createRunner(name: string): Runner {
  const db = getDb();
  const token = crypto.randomUUID();
  const stmt = db.prepare("INSERT INTO runners (name, token) VALUES (?, ?) RETURNING *");
  return stmt.get(name, token) as Runner;
}

export function getRunners(): Runner[] {
  const db = getDb();
  return db.query("SELECT * FROM runners ORDER BY name").all() as Runner[];
}

export function getRunner(id: number): Runner | null {
  const db = getDb();
  return db.query("SELECT * FROM runners WHERE id = ?").get(id) as Runner | null;
}

export function getRunnerByToken(token: string): Runner | null {
  const db = getDb();
  return db.query("SELECT * FROM runners WHERE token = ?").get(token) as Runner | null;
}

export function updateRunnerStatus(id: number, status: RunnerStatus): void {
  const db = getDb();
  db.run("UPDATE runners SET status = ?, last_seen = datetime('now') WHERE id = ?", [status, id]);
}

export function updateRunnerHeartbeat(id: number): void {
  const db = getDb();
  db.run("UPDATE runners SET last_seen = datetime('now') WHERE id = ?", [id]);
}

export function deleteRunner(id: number): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM runners WHERE id = ?", [id]);
  return result.changes > 0;
}
