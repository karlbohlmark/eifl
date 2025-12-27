import { Database } from "bun:sqlite";

const DATA_DIR = "./data";
const DB_PATH = `${DATA_DIR}/eifl.db`;

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    // Ensure data directory exists
    Bun.spawnSync(["mkdir", "-p", DATA_DIR]);

    db = new Database(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      remote_url TEXT,
      default_branch TEXT DEFAULT 'main',
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(repo_id, name)
    );

    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pipeline_id INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending',
      commit_sha TEXT,
      branch TEXT,
      triggered_by TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      exit_code INTEGER,
      output TEXT,
      started_at TEXT,
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS runners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'offline',
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_repos_project ON repos(project_id);
    CREATE INDEX IF NOT EXISTS idx_pipelines_repo ON pipelines(repo_id);
    CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON runs(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics(run_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_key ON metrics(key);
  `);

  // Migrations
  try {
    // Check if remote_url column exists using table schema, not by querying data
    const repoTableInfo = db.prepare("PRAGMA table_info(repos);").all() as { name: string }[];
    const hasRemoteUrlColumn = repoTableInfo.some((column) => column.name === "remote_url");

    if (!hasRemoteUrlColumn) {
      console.log("Migrating database: adding remote_url to repos table");
      db.exec("ALTER TABLE repos ADD COLUMN remote_url TEXT");
    }
  } catch (error) {
    console.error("Migration check failed:", error);
  }
}

// Types
export interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Repo {
  id: number;
  project_id: number;
  name: string;
  path: string;
  remote_url: string | null;
  default_branch: string;
  created_at: string;
}

export interface Pipeline {
  id: number;
  repo_id: number;
  name: string;
  config: string;
  created_at: string;
}

export type RunStatus = "pending" | "running" | "success" | "failed" | "cancelled";

export interface Run {
  id: number;
  pipeline_id: number;
  status: RunStatus;
  commit_sha: string | null;
  branch: string | null;
  triggered_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export type StepStatus = "pending" | "running" | "success" | "failed" | "skipped";

export interface Step {
  id: number;
  run_id: number;
  name: string;
  command: string;
  status: StepStatus;
  exit_code: number | null;
  output: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface Metric {
  id: number;
  run_id: number;
  key: string;
  value: number;
  unit: string | null;
  created_at: string;
}

export type RunnerStatus = "online" | "offline" | "busy";

export interface Runner {
  id: number;
  name: string;
  token: string;
  status: RunnerStatus;
  last_seen: string | null;
  created_at: string;
}
