import { test, expect, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
import { getDb, resetDb } from "../src/db/schema";
import {
  createRunner,
  getRunner,
  incrementRunnerActiveJobs,
  decrementRunnerActiveJobs,
} from "../src/db/queries";
import { existsSync, rmSync } from "fs";

const TEST_DATA_DIR = "./test-data-runner-concurrency";

beforeAll(() => {
  // Set environment variables for test isolation
  process.env.DATA_DIR = TEST_DATA_DIR;

  // Reset database connection to pick up new environment variables
  resetDb();

  // Clean up any existing test data
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

beforeEach(() => {
  resetDb();
  getDb(); // Initialize fresh DB
});

afterEach(() => {
  resetDb();
});

afterAll(() => {
  // Clean up test data
  if (existsSync(TEST_DATA_DIR)) {
    rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
});

test("createRunner creates runner with default max_concurrency", () => {
  const runner = createRunner("test-runner-1");
  expect(runner.max_concurrency).toBe(1);
  expect(runner.active_jobs).toBe(0);
});

test("createRunner creates runner with custom max_concurrency", () => {
  const runner = createRunner("test-runner-2", [], 8);
  expect(runner.max_concurrency).toBe(8);
  expect(runner.active_jobs).toBe(0);
});

test("incrementRunnerActiveJobs increments active_jobs", () => {
  const runner = createRunner("test-runner-3", [], 4);
  expect(runner.active_jobs).toBe(0);

  incrementRunnerActiveJobs(runner.id);
  const updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(1);

  incrementRunnerActiveJobs(runner.id);
  const updated2 = getRunner(runner.id);
  expect(updated2?.active_jobs).toBe(2);
});

test("decrementRunnerActiveJobs decrements active_jobs", () => {
  const runner = createRunner("test-runner-4", [], 4);

  // Increment twice
  incrementRunnerActiveJobs(runner.id);
  incrementRunnerActiveJobs(runner.id);

  let updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(2);

  // Decrement once
  decrementRunnerActiveJobs(runner.id);
  updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(1);

  // Decrement again
  decrementRunnerActiveJobs(runner.id);
  updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(0);
});

test("decrementRunnerActiveJobs does not go below 0", () => {
  const runner = createRunner("test-runner-5");
  expect(runner.active_jobs).toBe(0);

  // Try to decrement when already at 0
  decrementRunnerActiveJobs(runner.id);
  const updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(0);
});

test("runner can have multiple active jobs up to max_concurrency", () => {
  const runner = createRunner("test-runner-6", [], 3);

  for (let i = 1; i <= 3; i++) {
    incrementRunnerActiveJobs(runner.id);
    const updated = getRunner(runner.id);
    expect(updated?.active_jobs).toBe(i);
  }

  // Verify it can exceed max (the application logic should prevent this, not the DB)
  incrementRunnerActiveJobs(runner.id);
  const updated = getRunner(runner.id);
  expect(updated?.active_jobs).toBe(4);
});
