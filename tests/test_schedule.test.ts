import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb } from "../src/db/schema";
import { createProject, createRepo, upsertPipeline, getRuns } from "../src/db/queries";
import { processScheduledPipelines } from "../src/pipeline/cron";
import { $ } from "bun";
import { existsSync } from "fs";
import { rmSync, mkdirSync } from "fs";

const TEST_REPO_PATH = "test-scheduler/test-repo.git";
const TEST_REPO_FULL_PATH = `./data/repos/${TEST_REPO_PATH}`;

beforeAll(async () => {
  // Clean up any existing test repo
  if (existsSync(TEST_REPO_FULL_PATH)) {
    rmSync(TEST_REPO_FULL_PATH, { recursive: true, force: true });
  }

  // Create test git repository
  mkdirSync(TEST_REPO_FULL_PATH, { recursive: true });
  await $`git -C ${TEST_REPO_FULL_PATH} init --initial-branch=main`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} config user.email "test@example.com"`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} config user.name "Test User"`.quiet();

  // Create an initial commit
  await Bun.write(`${TEST_REPO_FULL_PATH}/README.md`, "# Test Repo");
  await $`git -C ${TEST_REPO_FULL_PATH} add .`.quiet();
  await $`git -C ${TEST_REPO_FULL_PATH} commit -m "Initial commit"`.quiet();
});

afterAll(() => {
  // Clean up test repo
  if (existsSync(TEST_REPO_FULL_PATH)) {
    rmSync(TEST_REPO_FULL_PATH, { recursive: true, force: true });
  }
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
  expect(runs[0].triggered_by).toBe("schedule");
});
