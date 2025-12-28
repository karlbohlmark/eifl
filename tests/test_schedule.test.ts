import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb, resetDb } from "../src/db/schema";
import { createProject, createRepo, upsertPipeline, getRuns } from "../src/db/queries";
import { processScheduledPipelines } from "../src/pipeline/cron";
import { $ } from "bun";
import { existsSync } from "fs";
import { rmSync, mkdirSync } from "fs";

// Setup isolated test environment
const TEST_DATA_DIR = "./test-data";
const TEST_REPOS_DIR = `${TEST_DATA_DIR}/repos`;
const TEST_REPO_PATH = "test-scheduler/test-repo.git";
const TEST_REPO_FULL_PATH = `${TEST_REPOS_DIR}/${TEST_REPO_PATH}`;

beforeAll(async () => {
  // Set environment variables for test isolation
  process.env.DATA_DIR = TEST_DATA_DIR;
  process.env.REPOS_DIR = TEST_REPOS_DIR;

  // Reset database connection to pick up new environment variables
  resetDb();

  // Clean up any existing test data
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }

  // Create test directories
  mkdirSync(TEST_REPO_FULL_PATH, { recursive: true });

  // Create test git repository
  await $`git -C ${TEST_REPO_FULL_PATH} init --initial-branch=main`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} config user.email "test@example.com"`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} config user.name "Test User"`.quiet();

  // Create an initial commit
  await Bun.write(`${TEST_REPO_FULL_PATH}/README.md`, "# Test Repo");
  await $`git -C ${TEST_REPO_FULL_PATH} add .`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} commit -m "Initial commit"`.quiet();
});

afterAll(() => {
  // Clean up test database connection
  resetDb();

  // Clean up test data directory
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }

  // Reset environment variables
  delete process.env.DATA_DIR;
  delete process.env.REPOS_DIR;
});

test("Scheduled pipeline runs", async () => {
  // 1. Setup Data
  const timestamp = Date.now();
  const project = createProject(`Test Project ${timestamp}`);

  // Get or create repo (handle case where repo already exists from previous test)
  const db = getDb();
  let repo = db.query("SELECT * FROM repos WHERE path = ?").get(TEST_REPO_PATH) as any;
  if (!repo) {
    repo = createRepo(project.id, "test-repo", TEST_REPO_PATH);
  }

  // 2. Setup Pipeline Config
  const config = {
    name: `Test Pipeline ${timestamp}`,
    triggers: {
      schedule: [{ cron: "* * * * *" }] // Run every minute
    },
    steps: [{ name: "Test Step", run: "echo Hello" }]
  };

  // 3. Upsert Pipeline with a past next_run_at to force immediate run
  const past = new Date();
  past.setMinutes(past.getMinutes() - 10);
  upsertPipeline(repo.id, config.name, config, past);

  // 4. Run Scheduler
  await processScheduledPipelines();

  // 5. Verify Run Created
  const pipeline = db.query("SELECT * FROM pipelines WHERE name = ?").get(config.name) as any;
  expect(pipeline).toBeDefined();

  const runs = getRuns(pipeline.id);
  expect(runs.length).toBeGreaterThan(0);
  expect(runs[0]!.triggered_by).toBe("schedule");
});
