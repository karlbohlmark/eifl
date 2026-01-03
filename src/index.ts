import { serve } from "bun";
import index from "./index.html";
import { getDb } from "./db/schema";
import {
  handleGitInfoRefs,
  handleGitUploadPack,
  handleGitReceivePack,
} from "./git/http";
import { handlePushTrigger } from "./pipeline/scheduler";
import {
  handleCreateProject,
  handleGetProjects,
  handleGetProject,
  handleDeleteProject,
  handleCreateRepo,
  handleGetRepos,
  handleGetRepo,
  handleDeleteRepo,
  handleGetBranches,
  handleGetTree,
  handleGetFile,
  handleGetCommits,
  handleGetCommit,
} from "./api/repos";
import {
  handleCreatePipeline,
  handleGetPipelines,
  handleGetPipeline,
  handleDeletePipeline,
  handleTriggerPipeline,
  handleGetRuns,
  handleGetRun,
  handleCancelRun,
  handleGetMetricHistory,
  handleGetBaselines,
  handleGetBaseline,
  handleUpsertBaseline,
  handleDeleteBaseline,
  handleUpdateBaselinesFromRun,
  handleCompareRunToBaselines,
} from "./api/pipelines";
import {
  handleCreateRunner,
  handleGetRunners,
  handleDeleteRunner,
  handleUpdateRunnerTags,
  handleUpdateRunnerMaxConcurrency,
  authenticateRunner,
  handlePollForJob,
  handleStepUpdate,
  handleStepOutput,
  handleRunComplete,
  handleRunnerHeartbeat,
} from "./api/runner";
import { handleGithubWebhook, handleVerifyGitHubRepo } from "./api/github";
import {
  handleGetProjectSecrets,
  handleCreateProjectSecret,
  handleDeleteProjectSecret,
  handleGetRepoSecrets,
  handleCreateRepoSecret,
  handleDeleteRepoSecret,
} from "./api/secrets";
import { handleGetDocs, handleGetDoc } from "./api/docs";
import { processScheduledPipelines } from "./pipeline/cron";

// Initialize database on startup
getDb();

// Start scheduler loop (every 60 seconds)
setInterval(() => {
  processScheduledPipelines().catch((err) => {
    console.error("Scheduler error:", err);
  });
}, 60 * 1000);

// Run immediately on startup to catch up
processScheduledPipelines().catch((err) => {
  console.error("Scheduler error:", err);
});

const PORT = parseInt(process.env.PORT || "3000");
const HOST = process.env.HOST || "0.0.0.0";

const server = serve({
  port: PORT,
  hostname: HOST,
  routes: {
    // Serve frontend for root and SPA routes
    "/": index,
    "/project/*": index,
    "/repo/*": index,
    "/pipeline/*": index,
    "/runners": index,
    "/docs": index,
    "/docs/*": index,
  },
  async fetch(req): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // Git HTTP protocol
    if (path.startsWith("/git/")) {
      return handleGitRequest(req, path.slice(5));
    }

    // GitHub API
    if (path === "/api/github/verify" && method === "GET") {
      return handleVerifyGitHubRepo(url);
    }

    // GitHub Webhook
    if (path === "/api/webhooks/github" && method === "POST") {
      return handleGithubWebhook(req);
    }

    // API routes
    if (path.startsWith("/api/")) {
      return handleApiRequest(req, path.slice(5), method);
    }

    // Fallback to index for other routes (SPA)
    return index as unknown as Response;
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

async function handleGitRequest(req: Request, path: string): Promise<Response> {
  const url = new URL(req.url);

  // Git info refs (for clone/fetch/push discovery)
  if (path.endsWith("/info/refs")) {
    const repoPath = path.slice(0, -10);
    const service = url.searchParams.get("service");

    if (service === "git-upload-pack" || service === "git-receive-pack") {
      return handleGitInfoRefs(repoPath, service);
    }
    return new Response("Unsupported service", { status: 400 });
  }

  // Git upload-pack (clone/fetch)
  if (path.endsWith("/git-upload-pack")) {
    const repoPath = path.slice(0, -16);
    return handleGitUploadPack(repoPath, req.body);
  }

  // Git receive-pack (push)
  if (path.endsWith("/git-receive-pack")) {
    const repoPath = path.slice(0, -17);
    const { response, pushInfo } = await handleGitReceivePack(repoPath, req.body);

    // Trigger pipelines after successful push
    if (pushInfo.length > 0) {
      // Run async, don't block the git response
      handlePushTrigger(repoPath, pushInfo).catch((err) => {
        console.error("Pipeline trigger error:", err);
      });
    }

    return response;
  }

  return new Response("Not found", { status: 404 });
}

async function handleApiRequest(
  req: Request,
  path: string,
  method: string
): Promise<Response> {
  const url = new URL(req.url);

  // Projects
  if (path === "projects" && method === "GET") {
    return handleGetProjects();
  }
  if (path === "projects" && method === "POST") {
    return handleCreateProject(req);
  }

  const projectMatch = path.match(/^projects\/(\d+)$/);
  if (projectMatch) {
    const id = parseInt(projectMatch[1]!);
    if (method === "GET") return handleGetProject(id);
    if (method === "DELETE") return handleDeleteProject(id);
  }

  const projectReposMatch = path.match(/^projects\/(\d+)\/repos$/);
  if (projectReposMatch) {
    const projectId = parseInt(projectReposMatch[1]!);
    if (method === "GET") return handleGetRepos(projectId);
    if (method === "POST") return handleCreateRepo(projectId, req);
  }

  // Project secrets
  const projectSecretsMatch = path.match(/^projects\/(\d+)\/secrets$/);
  if (projectSecretsMatch) {
    const projectId = parseInt(projectSecretsMatch[1]!);
    if (method === "GET") return handleGetProjectSecrets(projectId);
    if (method === "POST") return handleCreateProjectSecret(projectId, req);
  }

  const projectSecretMatch = path.match(/^projects\/(\d+)\/secrets\/([^/]+)$/);
  if (projectSecretMatch && method === "DELETE") {
    const projectId = parseInt(projectSecretMatch[1]!);
    const name = decodeURIComponent(projectSecretMatch[2]!);
    return handleDeleteProjectSecret(projectId, name);
  }

  // Repos
  const repoMatch = path.match(/^repos\/(\d+)$/);
  if (repoMatch) {
    const id = parseInt(repoMatch[1]!);
    if (method === "GET") return handleGetRepo(id);
    if (method === "DELETE") return handleDeleteRepo(id);
  }

  const repoBranchesMatch = path.match(/^repos\/(\d+)\/branches$/);
  if (repoBranchesMatch && method === "GET") {
    return handleGetBranches(parseInt(repoBranchesMatch[1]!));
  }

  const repoTreeMatch = path.match(/^repos\/(\d+)\/tree\/([^/]+)(?:\/(.*))?$/);
  if (repoTreeMatch && method === "GET") {
    const id = parseInt(repoTreeMatch[1]!);
    const ref = decodeURIComponent(repoTreeMatch[2]!);
    const treePath = repoTreeMatch[3] ? decodeURIComponent(repoTreeMatch[3]) : "";
    return handleGetTree(id, ref, treePath);
  }

  const repoFileMatch = path.match(/^repos\/(\d+)\/file\/([^/]+)\/(.+)$/);
  if (repoFileMatch && method === "GET") {
    const id = parseInt(repoFileMatch[1]!);
    const ref = decodeURIComponent(repoFileMatch[2]!);
    const filePath = decodeURIComponent(repoFileMatch[3]!);
    return handleGetFile(id, ref, filePath);
  }

  const repoCommitsMatch = path.match(/^repos\/(\d+)\/commits\/([^/]+)$/);
  if (repoCommitsMatch && method === "GET") {
    const id = parseInt(repoCommitsMatch[1]!);
    const ref = decodeURIComponent(repoCommitsMatch[2]!);
    const limit = parseInt(url.searchParams.get("limit") || "50");
    return handleGetCommits(id, ref, limit);
  }

  const repoCommitMatch = path.match(/^repos\/(\d+)\/commit\/([^/]+)$/);
  if (repoCommitMatch && method === "GET") {
    const id = parseInt(repoCommitMatch[1]!);
    const sha = decodeURIComponent(repoCommitMatch[2]!);
    return handleGetCommit(id, sha);
  }

  // Repo secrets
  const repoSecretsMatch = path.match(/^repos\/(\d+)\/secrets$/);
  if (repoSecretsMatch) {
    const repoId = parseInt(repoSecretsMatch[1]!);
    if (method === "GET") return handleGetRepoSecrets(repoId);
    if (method === "POST") return handleCreateRepoSecret(repoId, req);
  }

  const repoSecretMatch = path.match(/^repos\/(\d+)\/secrets\/([^/]+)$/);
  if (repoSecretMatch && method === "DELETE") {
    const repoId = parseInt(repoSecretMatch[1]!);
    const name = decodeURIComponent(repoSecretMatch[2]!);
    return handleDeleteRepoSecret(repoId, name);
  }

  // Pipelines
  const repoPipelinesMatch = path.match(/^repos\/(\d+)\/pipelines$/);
  if (repoPipelinesMatch) {
    const repoId = parseInt(repoPipelinesMatch[1]!);
    if (method === "GET") return handleGetPipelines(repoId);
    if (method === "POST") return handleCreatePipeline(repoId, req);
  }

  const pipelineMatch = path.match(/^pipelines\/(\d+)$/);
  if (pipelineMatch) {
    const id = parseInt(pipelineMatch[1]!);
    if (method === "GET") return handleGetPipeline(id);
    if (method === "DELETE") return handleDeletePipeline(id);
  }

  const pipelineTriggerMatch = path.match(/^pipelines\/(\d+)\/trigger$/);
  if (pipelineTriggerMatch && method === "POST") {
    return handleTriggerPipeline(parseInt(pipelineTriggerMatch[1]!), req);
  }

  const pipelineRunsMatch = path.match(/^pipelines\/(\d+)\/runs$/);
  if (pipelineRunsMatch && method === "GET") {
    const limit = parseInt(url.searchParams.get("limit") || "50");
    return handleGetRuns(parseInt(pipelineRunsMatch[1]!), limit);
  }

  const pipelineMetricsMatch = path.match(/^pipelines\/(\d+)\/metrics\/(.+)$/);
  if (pipelineMetricsMatch && method === "GET") {
    const pipelineId = parseInt(pipelineMetricsMatch[1]!);
    const key = decodeURIComponent(pipelineMetricsMatch[2]!);
    const limit = parseInt(url.searchParams.get("limit") || "100");
    return handleGetMetricHistory(pipelineId, key, limit);
  }

  // Baselines
  const pipelineBaselinesMatch = path.match(/^pipelines\/(\d+)\/baselines$/);
  if (pipelineBaselinesMatch) {
    const pipelineId = parseInt(pipelineBaselinesMatch[1]!);
    if (method === "GET") return handleGetBaselines(pipelineId);
    if (method === "POST") return handleUpsertBaseline(pipelineId, req);
  }

  const pipelineBaselineMatch = path.match(/^pipelines\/(\d+)\/baselines\/(.+)$/);
  if (pipelineBaselineMatch) {
    const pipelineId = parseInt(pipelineBaselineMatch[1]!);
    const key = decodeURIComponent(pipelineBaselineMatch[2]!);
    if (method === "GET") return handleGetBaseline(pipelineId, key);
    if (method === "DELETE") return handleDeleteBaseline(pipelineId, key);
  }

  // Runs
  const runMatch = path.match(/^runs\/(\d+)$/);
  if (runMatch && method === "GET") {
    return handleGetRun(parseInt(runMatch[1]!));
  }

  const runCancelMatch = path.match(/^runs\/(\d+)\/cancel$/);
  if (runCancelMatch && method === "POST") {
    return handleCancelRun(parseInt(runCancelMatch[1]!));
  }

  // Run baseline operations
  const runBaselinesMatch = path.match(/^runs\/(\d+)\/baselines$/);
  if (runBaselinesMatch) {
    const runId = parseInt(runBaselinesMatch[1]!);
    if (method === "GET") return handleCompareRunToBaselines(runId);
    if (method === "POST") return handleUpdateBaselinesFromRun(runId);
  }

  // Runners (admin)
  if (path === "runners" && method === "GET") {
    return handleGetRunners();
  }
  if (path === "runners" && method === "POST") {
    return handleCreateRunner(req);
  }

  const runnerMatch = path.match(/^runners\/(\d+)$/);
  if (runnerMatch && method === "DELETE") {
    return handleDeleteRunner(parseInt(runnerMatch[1]!));
  }

  const runnerTagsMatch = path.match(/^runners\/(\d+)\/tags$/);
  if (runnerTagsMatch && (method === "PUT" || method === "PATCH")) {
    return handleUpdateRunnerTags(parseInt(runnerTagsMatch[1]!), req);
  }

  const runnerConcurrencyMatch = path.match(/^runners\/(\d+)\/concurrency$/);
  if (runnerConcurrencyMatch && (method === "PUT" || method === "PATCH")) {
    return handleUpdateRunnerMaxConcurrency(parseInt(runnerConcurrencyMatch[1]!), req);
  }

  // Runner API (authenticated)
  if (path === "runner/poll" && method === "GET") {
    const runner = authenticateRunner(req);
    if (!runner) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handlePollForJob(runner);
  }

  if (path === "runner/step" && method === "POST") {
    const runner = authenticateRunner(req);
    if (!runner) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleStepUpdate(runner, req);
  }

  if (path === "runner/output" && method === "POST") {
    const runner = authenticateRunner(req);
    if (!runner) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleStepOutput(runner, req);
  }

  if (path === "runner/complete" && method === "POST") {
    const runner = authenticateRunner(req);
    if (!runner) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleRunComplete(runner, req);
  }

  if (path === "runner/heartbeat" && method === "POST") {
    const runner = authenticateRunner(req);
    if (!runner) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    return handleRunnerHeartbeat(runner);
  }

  // Documentation
  if (path === "docs" && method === "GET") {
    return handleGetDocs();
  }

  const docMatch = path.match(/^docs\/([^/]+)$/);
  if (docMatch && method === "GET") {
    return handleGetDoc(docMatch[1]!);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

console.log(`🚀 EIFL Server running at ${server.url}`);
console.log(`   Git URL: ${server.url}git/<project>/<repo>.git`);
console.log(`   API: ${server.url}api/`);
if (HOST === "0.0.0.0") {
  console.log(`   Network: Accessible on all interfaces at port ${PORT}`);
}
