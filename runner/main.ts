import { executeJob, type JobPayload } from "./executor";

const SERVER_URL = process.env.EIFL_SERVER_URL || "http://localhost:3000";
const RUNNER_TOKEN = process.env.EIFL_RUNNER_TOKEN;
const POLL_INTERVAL = parseInt(process.env.EIFL_POLL_INTERVAL || "5000");

if (!RUNNER_TOKEN) {
  console.error("Error: EIFL_RUNNER_TOKEN environment variable is required");
  console.error("Create a runner via: curl -X POST http://server/api/runners -d '{\"name\":\"my-runner\"}'");
  process.exit(1);
}

console.log(`🏃 EIFL Runner starting...`);
console.log(`   Server: ${SERVER_URL}`);
console.log(`   Poll interval: ${POLL_INTERVAL}ms`);

async function apiRequest(
  path: string,
  method: string = "GET",
  body?: object
): Promise<Response> {
  const url = `${SERVER_URL}/api/${path}`;
  const headers: HeadersInit = {
    Authorization: `Bearer ${RUNNER_TOKEN}`,
    "Content-Type": "application/json",
  };

  const init: RequestInit = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }

  return fetch(url, init);
}

async function pollForJob(): Promise<JobPayload | null> {
  try {
    const res = await apiRequest("runner/poll");
    if (!res.ok) {
      if (res.status === 401) {
        console.error("Authentication failed. Check your runner token.");
        process.exit(1);
      }
      console.error(`Poll failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as { job: JobPayload | null };
    return data.job;
  } catch (error) {
    console.error("Poll error:", error);
    return null;
  }
}

async function reportStepUpdate(
  stepId: number,
  status: string,
  exitCode?: number,
  output?: string
): Promise<void> {
  try {
    await apiRequest("runner/step", "POST", { stepId, status, exitCode, output });
  } catch (error) {
    console.error("Failed to report step update:", error);
  }
}

async function reportStepOutput(stepId: number, output: string): Promise<void> {
  try {
    await apiRequest("runner/output", "POST", { stepId, output });
  } catch (error) {
    console.error("Failed to report step output:", error);
  }
}

async function reportRunComplete(
  runId: number,
  status: "success" | "failed",
  metrics?: Array<{ key: string; value: number; unit?: string }>
): Promise<void> {
  try {
    await apiRequest("runner/complete", "POST", { runId, status, metrics });
  } catch (error) {
    console.error("Failed to report run complete:", error);
  }
}

async function sendHeartbeat(): Promise<void> {
  try {
    await apiRequest("runner/heartbeat", "POST", {});
  } catch {
    // Ignore heartbeat errors
  }
}

async function runMainLoop(): Promise<void> {
  console.log("Polling for jobs...");

  while (true) {
    const job = await pollForJob();

    if (job) {
      console.log(`\n📦 Received job: Run #${job.run.id}`);
      console.log(`   Branch: ${job.branch}`);
      console.log(`   Commit: ${job.commitSha?.slice(0, 8) || "unknown"}`);
      console.log(`   Steps: ${job.steps.length}`);

      try {
        await executeJob(job, SERVER_URL, {
          onStepStart: (stepId) => reportStepUpdate(stepId, "running"),
          onStepOutput: reportStepOutput,
          onStepComplete: (stepId, exitCode, output) =>
            reportStepUpdate(
              stepId,
              exitCode === 0 ? "success" : "failed",
              exitCode,
              output
            ),
          onRunComplete: reportRunComplete,
        });
      } catch (error) {
        console.error("Job execution error:", error);
        await reportRunComplete(job.run.id, "failed");
      }

      console.log(`\n✅ Job completed`);
    }

    // Send heartbeat and wait before next poll
    await sendHeartbeat();
    await Bun.sleep(POLL_INTERVAL);
  }
}

// Start the runner
runMainLoop().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
