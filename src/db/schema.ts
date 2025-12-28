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
      created_at TEXT DEFAULT (datetime('now') || 'Z')
    );

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      remote_url TEXT,
      default_branch TEXT DEFAULT 'main',
      created_at TEXT DEFAULT (datetime('now') || 'Z'),
      UNIQUE(project_id, name)
    );

    CREATE TABLE IF NOT EXISTS pipelines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      repo_id INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      config TEXT NOT NULL,
      next_run_at TEXT,
      created_at TEXT DEFAULT (datetime('now') || 'Z'),
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
      created_at TEXT DEFAULT (datetime('now') || 'Z')
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
      created_at TEXT DEFAULT (datetime('now') || 'Z')
    );

    CREATE TABLE IF NOT EXISTS runners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'offline',
      tags TEXT DEFAULT '[]',
      last_seen TEXT,
      created_at TEXT DEFAULT (datetime('now') || 'Z')
    );

    CREATE TABLE IF NOT EXISTS secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      scope_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      iv TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now') || 'Z'),
      updated_at TEXT DEFAULT (datetime('now') || 'Z'),
      UNIQUE(scope, scope_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_repos_project ON repos(project_id);
    CREATE INDEX IF NOT EXISTS idx_repos_remote_url ON repos(remote_url);
    CREATE INDEX IF NOT EXISTS idx_pipelines_repo ON pipelines(repo_id);
    CREATE INDEX IF NOT EXISTS idx_pipelines_next_run ON pipelines(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_runs_pipeline ON runs(pipeline_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_runs_pipeline_status ON runs(pipeline_id, status);
    CREATE INDEX IF NOT EXISTS idx_steps_run ON steps(run_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics(run_id);
    CREATE INDEX IF NOT EXISTS idx_metrics_key ON metrics(key);
    CREATE INDEX IF NOT EXISTS idx_secrets_scope ON secrets(scope, scope_id);
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

    // Check if tags column exists on runners table
    const runnerTableInfo = db.prepare("PRAGMA table_info(runners);").all() as { name: string }[];
    const hasTagsColumn = runnerTableInfo.some((column) => column.name === "tags");

    if (!hasTagsColumn) {
      console.log("Migrating database: adding tags to runners table");
      db.exec("ALTER TABLE runners ADD COLUMN tags TEXT DEFAULT '[]'");
    }

    const pipelineTableInfo = db.prepare("PRAGMA table_info(pipelines);").all() as { name: string }[];
    const hasNextRunAtColumn = pipelineTableInfo.some((column) => column.name === "next_run_at");

    if (!hasNextRunAtColumn) {
      console.log("Migrating database: adding next_run_at to pipelines table");
      db.exec("ALTER TABLE pipelines ADD COLUMN next_run_at TEXT");
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
  next_run_at: string | null;
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
  tags: string; // JSON array of tag strings
  last_seen: string | null;
  created_at: string;
}

// Parsed runner with tags as array
export interface RunnerWithParsedTags extends Omit<Runner, 'tags'> {
  tags: string[];
}

export type SecretScope = "project" | "repo";

export interface Secret {
  id: number;
  scope: SecretScope;
  scope_id: number;
  name: string;
  encrypted_value: string;
  iv: string;
  created_at: string;
  updated_at: string;
}
