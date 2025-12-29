import { test, expect, beforeAll, beforeEach, afterAll, afterEach } from "bun:test";
import { getDb, resetDb } from "../src/db/schema";
import { createRunner, getRunner } from "../src/db/queries";
import { handleUpdateRunnerMaxConcurrency } from "../src/api/runner";
import { existsSync, rmSync } from "fs";

const TEST_DATA_DIR = "./test-data-runner-api";

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
  getDb();
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

test("handleUpdateRunnerMaxConcurrency updates max_concurrency", async () => {
  const runner = createRunner("test-runner", [], 2);
  expect(runner.max_concurrency).toBe(2);

  const req = new Request("http://localhost/api/runners/1/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: 8 }),
  });

  const response = await handleUpdateRunnerMaxConcurrency(runner.id, req);
  expect(response.status).toBe(200);

  const updated = getRunner(runner.id);
  expect(updated?.max_concurrency).toBe(8);
});

test("handleUpdateRunnerMaxConcurrency rejects invalid values", async () => {
  const runner = createRunner("test-runner-2", [], 2);

  // Test negative value
  const req1 = new Request("http://localhost/api/runners/1/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: -1 }),
  });

  const response1 = await handleUpdateRunnerMaxConcurrency(runner.id, req1);
  expect(response1.status).toBe(400);

  // Test zero value
  const req2 = new Request("http://localhost/api/runners/1/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: 0 }),
  });

  const response2 = await handleUpdateRunnerMaxConcurrency(runner.id, req2);
  expect(response2.status).toBe(400);

  // Verify runner wasn't changed
  const updated = getRunner(runner.id);
  expect(updated?.max_concurrency).toBe(2);
});

test("handleUpdateRunnerMaxConcurrency returns 404 for non-existent runner", async () => {
  const req = new Request("http://localhost/api/runners/999/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: 8 }),
  });

  const response = await handleUpdateRunnerMaxConcurrency(999, req);
  expect(response.status).toBe(404);
});

test("handleUpdateRunnerMaxConcurrency can scale up and down", async () => {
  const runner = createRunner("test-runner-3", [], 1);

  // Scale up to 16
  const req1 = new Request("http://localhost/api/runners/1/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: 16 }),
  });

  await handleUpdateRunnerMaxConcurrency(runner.id, req1);
  let updated = getRunner(runner.id);
  expect(updated?.max_concurrency).toBe(16);

  // Scale down to 4
  const req2 = new Request("http://localhost/api/runners/1/concurrency", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ max_concurrency: 4 }),
  });

  await handleUpdateRunnerMaxConcurrency(runner.id, req2);
  updated = getRunner(runner.id);
  expect(updated?.max_concurrency).toBe(4);
});
