import { getDb, type Project, type Repo, type Pipeline, type Run, type Step, type Metric, type Baseline, type Runner, type Secret, type RunStatus, type StepStatus, type RunnerStatus, type SecretScope, type CoordinationSession, type CoordinationParticipant, type CoordinationBarrier, type CoordinationSignal, type CoordinationSessionStatus } from "./schema";

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

export interface RepoWithLatestBuildStatus extends Repo {
  latest_run_status: RunStatus | null;
  latest_run_id: number | null;
  latest_run_date: string | null;
}

export function getReposWithLatestBuildStatus(projectId: number): RepoWithLatestBuildStatus[] {
  const db = getDb();
  return db.query(`
    SELECT r.*,
           latest.status as latest_run_status,
           latest.id as latest_run_id,
           latest.started_at as latest_run_date
    FROM repos r
    LEFT JOIN (
      SELECT runs.*, pipelines.repo_id,
             ROW_NUMBER() OVER (PARTITION BY pipelines.repo_id ORDER BY runs.created_at DESC) as rn
      FROM runs
      JOIN pipelines ON runs.pipeline_id = pipelines.id
    ) latest ON latest.repo_id = r.id AND latest.rn = 1
    WHERE r.project_id = ?
    ORDER BY r.name
  `).all(projectId) as RepoWithLatestBuildStatus[];
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

export function upsertPipeline(repoId: number, name: string, config: object, nextRunAt?: Date): Pipeline {
  const db = getDb();
  const configJson = JSON.stringify(config);
  const nextRunAtStr = nextRunAt ? nextRunAt.toISOString() : null;
  const stmt = db.prepare(`
    INSERT INTO pipelines (repo_id, name, config, next_run_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(repo_id, name) DO UPDATE SET config = excluded.config, next_run_at = excluded.next_run_at
    RETURNING *
  `);
  return stmt.get(repoId, name, configJson, nextRunAtStr) as Pipeline;
}

export function updatePipelineNextRun(id: number, nextRunAt: Date): void {
  const db = getDb();
  db.run("UPDATE pipelines SET next_run_at = ? WHERE id = ?", [nextRunAt.toISOString(), id]);
}

export function getPipelinesDueForRun(): Pipeline[] {
  const db = getDb();
  // We use ISO string for next_run_at (from JS Date.toISOString()), so we need to compare with ISO string from SQLite
  return db.query("SELECT * FROM pipelines WHERE next_run_at IS NOT NULL AND next_run_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')").all() as Pipeline[];
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
           r.started_at as latest_run_date
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
    db.run("UPDATE runs SET status = ?, started_at = datetime('now') || 'Z' WHERE id = ?", [status, id]);
  } else if (status === "success" || status === "failed" || status === "cancelled") {
    db.run("UPDATE runs SET status = ?, finished_at = datetime('now') || 'Z' WHERE id = ?", [status, id]);
  } else {
    db.run("UPDATE runs SET status = ? WHERE id = ?", [status, id]);
  }
}

export function hasPendingOrRunningRun(pipelineId: number): boolean {
  const db = getDb();
  const result = db.query("SELECT COUNT(*) as count FROM runs WHERE pipeline_id = ? AND status IN ('pending', 'running')").get(pipelineId) as { count: number };
  return result.count > 0;
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

export function updateStepStatus(id: number, status: StepStatus, exitCode?: number, _output?: string): void {
  const db = getDb();
  if (status === "running") {
    db.run("UPDATE steps SET status = ?, started_at = datetime('now') || 'Z' WHERE id = ?", [status, id]);
  } else if (status === "success" || status === "failed") {
    db.run(
      "UPDATE steps SET status = ?, exit_code = ?, finished_at = datetime('now') || 'Z' WHERE id = ?",
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

// Baselines
export function upsertBaseline(pipelineId: number, key: string, baselineValue: number, tolerancePct = 10.0): Baseline {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO baselines (pipeline_id, key, baseline_value, tolerance_pct)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(pipeline_id, key) DO UPDATE SET
      baseline_value = excluded.baseline_value,
      tolerance_pct = excluded.tolerance_pct,
      updated_at = datetime('now') || 'Z'
    RETURNING *
  `);
  return stmt.get(pipelineId, key, baselineValue, tolerancePct) as Baseline;
}

export function getBaseline(pipelineId: number, key: string): Baseline | null {
  const db = getDb();
  return db.query("SELECT * FROM baselines WHERE pipeline_id = ? AND key = ?").get(pipelineId, key) as Baseline | null;
}

export function getBaselines(pipelineId: number): Baseline[] {
  const db = getDb();
  return db.query("SELECT * FROM baselines WHERE pipeline_id = ? ORDER BY key").all(pipelineId) as Baseline[];
}

export function deleteBaseline(pipelineId: number, key: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM baselines WHERE pipeline_id = ? AND key = ?", [pipelineId, key]);
  return result.changes > 0;
}

export interface BaselineComparison {
  key: string;
  currentValue: number;
  baselineValue: number;
  tolerancePct: number;
  deviationPct: number;
  withinTolerance: boolean;
}

export function compareMetricsToBaselines(runId: number): BaselineComparison[] {
  const db = getDb();
  // Get the pipeline_id for this run
  const run = db.query("SELECT pipeline_id FROM runs WHERE id = ?").get(runId) as { pipeline_id: number } | null;
  if (!run) return [];

  // Get all metrics for this run that have baselines
  return db.query(`
    SELECT
      m.key,
      m.value as current_value,
      b.baseline_value,
      b.tolerance_pct
    FROM metrics m
    JOIN baselines b ON b.pipeline_id = ? AND b.key = m.key
    WHERE m.run_id = ?
    ORDER BY m.key
  `).all(run.pipeline_id, runId).map((row: any) => {
    // Handle division by zero: if baseline is 0, deviation is 0% if current is also 0, otherwise infinite (use 100%)
    let deviationPct: number;
    if (row.baseline_value === 0) {
      deviationPct = row.current_value === 0 ? 0 : 100;
    } else {
      deviationPct = Math.abs((row.current_value - row.baseline_value) / row.baseline_value) * 100;
    }
    return {
      key: row.key,
      currentValue: row.current_value,
      baselineValue: row.baseline_value,
      tolerancePct: row.tolerance_pct,
      deviationPct,
      withinTolerance: deviationPct <= row.tolerance_pct
    };
  }) as BaselineComparison[];
}

// Runners
export function createRunner(name: string, tags: string[] = [], maxConcurrency: number = 1): Runner {
  const db = getDb();
  const token = crypto.randomUUID();
  const tagsJson = JSON.stringify(tags);
  const stmt = db.prepare("INSERT INTO runners (name, token, tags, max_concurrency) VALUES (?, ?, ?, ?) RETURNING *");
  return stmt.get(name, token, tagsJson, maxConcurrency) as Runner;
}

export function updateRunnerTags(id: number, tags: string[]): boolean {
  const db = getDb();
  const tagsJson = JSON.stringify(tags);
  const result = db.run("UPDATE runners SET tags = ? WHERE id = ?", [tagsJson, id]);
  return result.changes > 0;
}

export function getRunnerTags(runner: Runner): string[] {
  try {
    return JSON.parse(runner.tags || '[]');
  } catch {
    return [];
  }
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
  db.run("UPDATE runners SET status = ?, last_seen = datetime('now') || 'Z' WHERE id = ?", [status, id]);
}

export function updateRunnerHeartbeat(id: number): void {
  const db = getDb();
  db.run("UPDATE runners SET last_seen = datetime('now') || 'Z' WHERE id = ?", [id]);
}

export function updateRunnerMaxConcurrency(id: number, maxConcurrency: number): boolean {
  const db = getDb();
  const result = db.run("UPDATE runners SET max_concurrency = ? WHERE id = ?", [maxConcurrency, id]);
  return result.changes > 0;
}

export function incrementRunnerActiveJobs(id: number): void {
  const db = getDb();
  db.run("UPDATE runners SET active_jobs = active_jobs + 1, last_seen = datetime('now') || 'Z' WHERE id = ?", [id]);
}

export function decrementRunnerActiveJobs(id: number): void {
  const db = getDb();
  db.run("UPDATE runners SET active_jobs = CASE WHEN active_jobs > 0 THEN active_jobs - 1 ELSE 0 END, last_seen = datetime('now') || 'Z' WHERE id = ?", [id]);
}

export function deleteRunner(id: number): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM runners WHERE id = ?", [id]);
  return result.changes > 0;
}

// Secrets
export function createSecret(
  scope: SecretScope,
  scopeId: number,
  name: string,
  encryptedValue: string,
  iv: string
): Secret {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO secrets (scope, scope_id, name, encrypted_value, iv)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(scope, scopeId, name, encryptedValue, iv) as Secret;
}

export function upsertSecret(
  scope: SecretScope,
  scopeId: number,
  name: string,
  encryptedValue: string,
  iv: string
): Secret {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO secrets (scope, scope_id, name, encrypted_value, iv)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(scope, scope_id, name) DO UPDATE SET
      encrypted_value = excluded.encrypted_value,
      iv = excluded.iv,
      updated_at = datetime('now') || 'Z'
    RETURNING *
  `);
  return stmt.get(scope, scopeId, name, encryptedValue, iv) as Secret;
}

export function getSecrets(scope: SecretScope, scopeId: number): Secret[] {
  const db = getDb();
  return db.query(
    "SELECT * FROM secrets WHERE scope = ? AND scope_id = ? ORDER BY name"
  ).all(scope, scopeId) as Secret[];
}

export function getSecret(scope: SecretScope, scopeId: number, name: string): Secret | null {
  const db = getDb();
  return db.query(
    "SELECT * FROM secrets WHERE scope = ? AND scope_id = ? AND name = ?"
  ).get(scope, scopeId, name) as Secret | null;
}

export function deleteSecret(scope: SecretScope, scopeId: number, name: string): boolean {
  const db = getDb();
  const result = db.run(
    "DELETE FROM secrets WHERE scope = ? AND scope_id = ? AND name = ?",
    [scope, scopeId, name]
  );
  return result.changes > 0;
}

// Get merged secrets for a repo (project secrets + repo secrets, repo overrides project)
export function getSecretsForRepo(repoId: number): Secret[] {
  const db = getDb();
  // First get the project_id for this repo
  const repo = db.query("SELECT project_id FROM repos WHERE id = ?").get(repoId) as { project_id: number } | null;
  if (!repo) return [];

  // Get project and repo secrets separately, then merge in code
  const projectSecrets = getSecrets("project", repo.project_id);
  const repoSecrets = getSecrets("repo", repoId);

  // Create a map with project secrets first, then override with repo secrets
  const merged = new Map<string, Secret>();
  for (const secret of projectSecrets) {
    merged.set(secret.name, secret);
  }
  for (const secret of repoSecrets) {
    merged.set(secret.name, secret); // Repo secrets override project secrets
  }

  return Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Coordination - Sessions
export function createCoordinationSession(
  sessionId: string,
  expectedParticipants: number,
  runId?: number,
  expiresInMs: number = 5 * 60 * 1000 // 5 minutes default
): CoordinationSession {
  const db = getDb();
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  const stmt = db.prepare(`
    INSERT INTO coordination_sessions (session_id, run_id, expected_participants, expires_at)
    VALUES (?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(sessionId, runId ?? null, expectedParticipants, expiresAt) as CoordinationSession;
}

export function getCoordinationSession(sessionId: string): CoordinationSession | null {
  const db = getDb();
  return db.query("SELECT * FROM coordination_sessions WHERE session_id = ?").get(sessionId) as CoordinationSession | null;
}

export function updateCoordinationSessionStatus(sessionId: string, status: CoordinationSessionStatus): boolean {
  const db = getDb();
  const result = db.run("UPDATE coordination_sessions SET status = ? WHERE session_id = ?", [status, sessionId]);
  return result.changes > 0;
}

export function expireOldCoordinationSessions(): number {
  const db = getDb();
  const result = db.run(`
    UPDATE coordination_sessions
    SET status = 'expired'
    WHERE status IN ('waiting', 'active')
      AND expires_at IS NOT NULL
      AND expires_at < datetime('now') || 'Z'
  `);
  return result.changes;
}

export function deleteCoordinationSession(sessionId: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM coordination_sessions WHERE session_id = ?", [sessionId]);
  return result.changes > 0;
}

// Coordination - Participants
export function joinCoordinationSession(
  sessionId: string,
  runnerId: number,
  role?: string
): CoordinationParticipant | null {
  const db = getDb();

  // Check if session exists and is joinable
  const session = getCoordinationSession(sessionId);
  if (!session || session.status === 'expired' || session.status === 'completed') {
    return null;
  }

  // Check if session is full
  if (session.current_participants >= session.expected_participants) {
    return null;
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO coordination_participants (session_id, runner_id, role)
      VALUES (?, ?, ?)
      RETURNING *
    `);
    const participant = stmt.get(sessionId, runnerId, role ?? null) as CoordinationParticipant;

    // Update participant count
    db.run(`
      UPDATE coordination_sessions
      SET current_participants = current_participants + 1,
          status = CASE
            WHEN current_participants + 1 >= expected_participants THEN 'active'
            ELSE status
          END
      WHERE session_id = ?
    `, [sessionId]);

    return participant;
  } catch (e: any) {
    // Duplicate participant - runner already joined
    if (e.message?.includes('UNIQUE constraint failed')) {
      return db.query(
        "SELECT * FROM coordination_participants WHERE session_id = ? AND runner_id = ?"
      ).get(sessionId, runnerId) as CoordinationParticipant;
    }
    throw e;
  }
}

export function getCoordinationParticipants(sessionId: string): CoordinationParticipant[] {
  const db = getDb();
  return db.query(
    "SELECT * FROM coordination_participants WHERE session_id = ? ORDER BY joined_at"
  ).all(sessionId) as CoordinationParticipant[];
}

export function isParticipantInSession(sessionId: string, runnerId: number): boolean {
  const db = getDb();
  const result = db.query(
    "SELECT 1 FROM coordination_participants WHERE session_id = ? AND runner_id = ?"
  ).get(sessionId, runnerId);
  return result !== null;
}

// Coordination - Barriers
export function createOrIncrementBarrier(
  sessionId: string,
  barrierName: string,
  expectedCount?: number
): { barrier: CoordinationBarrier; released: boolean } {
  const db = getDb();

  // Get session to determine expected count if not provided
  const session = getCoordinationSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }

  const count = expectedCount ?? session.expected_participants;

  // Try to create or increment the barrier atomically
  const existing = db.query(
    "SELECT * FROM coordination_barriers WHERE session_id = ? AND barrier_name = ?"
  ).get(sessionId, barrierName) as CoordinationBarrier | null;

  if (existing) {
    if (existing.released) {
      // Already released, just return
      return { barrier: existing, released: true };
    }

    // Increment counter
    const newCount = existing.current_count + 1;
    const shouldRelease = newCount >= existing.expected_count;

    if (shouldRelease) {
      db.run(`
        UPDATE coordination_barriers
        SET current_count = ?, released = 1, released_at = datetime('now') || 'Z'
        WHERE session_id = ? AND barrier_name = ?
      `, [newCount, sessionId, barrierName]);
    } else {
      db.run(`
        UPDATE coordination_barriers SET current_count = ?
        WHERE session_id = ? AND barrier_name = ?
      `, [newCount, sessionId, barrierName]);
    }

    const updated = db.query(
      "SELECT * FROM coordination_barriers WHERE session_id = ? AND barrier_name = ?"
    ).get(sessionId, barrierName) as CoordinationBarrier;

    return { barrier: updated, released: shouldRelease };
  } else {
    // Create new barrier
    const shouldRelease = count <= 1;
    const stmt = db.prepare(`
      INSERT INTO coordination_barriers (session_id, barrier_name, expected_count, current_count, released, released_at)
      VALUES (?, ?, ?, 1, ?, CASE WHEN ? THEN datetime('now') || 'Z' ELSE NULL END)
      RETURNING *
    `);
    const barrier = stmt.get(sessionId, barrierName, count, shouldRelease ? 1 : 0, shouldRelease) as CoordinationBarrier;
    return { barrier, released: shouldRelease };
  }
}

export function getBarrier(sessionId: string, barrierName: string): CoordinationBarrier | null {
  const db = getDb();
  return db.query(
    "SELECT * FROM coordination_barriers WHERE session_id = ? AND barrier_name = ?"
  ).get(sessionId, barrierName) as CoordinationBarrier | null;
}

export function getBarriers(sessionId: string): CoordinationBarrier[] {
  const db = getDb();
  return db.query(
    "SELECT * FROM coordination_barriers WHERE session_id = ? ORDER BY created_at"
  ).all(sessionId) as CoordinationBarrier[];
}

// Coordination - Signals
export function sendSignal(
  sessionId: string,
  signalName: string,
  senderRunnerId: number,
  data?: string | object
): CoordinationSignal {
  const db = getDb();
  const dataStr = data ? (typeof data === 'string' ? data : JSON.stringify(data)) : null;
  const stmt = db.prepare(`
    INSERT INTO coordination_signals (session_id, signal_name, sender_runner_id, data)
    VALUES (?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(sessionId, signalName, senderRunnerId, dataStr) as CoordinationSignal;
}

export function getSignals(sessionId: string, signalName?: string, afterId?: number): CoordinationSignal[] {
  const db = getDb();
  if (signalName && afterId) {
    return db.query(
      "SELECT * FROM coordination_signals WHERE session_id = ? AND signal_name = ? AND id > ? ORDER BY id"
    ).all(sessionId, signalName, afterId) as CoordinationSignal[];
  } else if (signalName) {
    return db.query(
      "SELECT * FROM coordination_signals WHERE session_id = ? AND signal_name = ? ORDER BY id"
    ).all(sessionId, signalName) as CoordinationSignal[];
  } else if (afterId) {
    return db.query(
      "SELECT * FROM coordination_signals WHERE session_id = ? AND id > ? ORDER BY id"
    ).all(sessionId, afterId) as CoordinationSignal[];
  } else {
    return db.query(
      "SELECT * FROM coordination_signals WHERE session_id = ? ORDER BY id"
    ).all(sessionId) as CoordinationSignal[];
  }
}

export function waitForSignal(
  sessionId: string,
  signalName: string,
  timeoutMs: number = 30000
): Promise<CoordinationSignal | null> {
  const startTime = Date.now();
  const pollInterval = 100; // 100ms

  return new Promise((resolve) => {
    const poll = () => {
      const signals = getSignals(sessionId, signalName);
      if (signals.length > 0) {
        resolve(signals[0] ?? null);
        return;
      }

      if (Date.now() - startTime > timeoutMs) {
        resolve(null);
        return;
      }

      setTimeout(poll, pollInterval);
    };

    poll();
  });
}
