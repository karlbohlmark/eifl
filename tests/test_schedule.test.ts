import { expect, test, beforeAll, afterAll } from "bun:test";
import { getDb } from "../src/db/schema";
import { createProject, createRepo, upsertPipeline, getRuns } from "../src/db/queries";
import { processScheduledPipelines } from "../src/pipeline/cron";
import { $ } from "bun";

const DB_PATH = ":memory:"; // Use in-memory DB for testing

test("Scheduled pipeline runs", async () => {
    // 1. Setup Data
    // Use random project name to avoid conflict
    const project = createProject(`Test Project ${Date.now()}`);
    const repoPath = "test-project/test-repo.git";
    // Ensure repo exists in DB
    const db = getDb();
    let repo = db.query("SELECT * FROM repos WHERE path = ?").get(repoPath) as any;
    if (!repo) {
        repo = createRepo(project.id, "test-repo", repoPath);
    }

    // 2. Setup Pipeline Config
    const config = {
        name: "Test Pipeline",
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
    const pipeline = getDb().query("SELECT * FROM pipelines WHERE name = ?").get(config.name) as any;
    expect(pipeline).toBeDefined();

    const runs = getRuns(pipeline.id);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].triggered_by).toBe("schedule");
});
