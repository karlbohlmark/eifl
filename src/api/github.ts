import { getRepoByRemoteUrl, upsertPipeline, createRun, createStep } from "../db/queries";
import { validatePipelineConfig, PipelineParseError, shouldTriggerOnPush } from "../pipeline/parser";
import { updateCommitStatus } from "../lib/github";
import { getPipelineUrl } from "../lib/utils";

// GitHub webhook payload types
interface GitHubRepository {
  clone_url: string;
  name: string;
  full_name: string;
}

interface GitHubPushPayload {
  repository: GitHubRepository;
  ref: string;
  after: string;
}

function isValidPushPayload(payload: unknown): payload is GitHubPushPayload {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;

  if (!p.repository || typeof p.repository !== "object") return false;
  const repo = p.repository as Record<string, unknown>;

  return (
    typeof repo.clone_url === "string" &&
    typeof repo.name === "string" &&
    typeof repo.full_name === "string" &&
    typeof p.ref === "string" &&
    typeof p.after === "string"
  );
}

async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const signatureParts = signature.split("=");
  if (signatureParts.length !== 2 || signatureParts[0] !== "sha256") {
    return false;
  }

  const sigHex = signatureParts[1];
  const sigBytes = new Uint8Array(
    sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
  );

  return crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payload));
}

export async function handleGithubWebhook(req: Request): Promise<Response> {
  const event = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

  // Read payload as text first (needed for signature verification)
  const payloadText = await req.text();

  // Verify signature if secret is configured
  if (webhookSecret) {
    if (!signature) {
      return Response.json({ error: "Missing signature" }, { status: 401 });
    }

    const verified = await verifySignature(payloadText, signature, webhookSecret);
    if (!verified) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }
  } else {
    console.warn("GITHUB_WEBHOOK_SECRET not set. Webhook signature verification disabled.");
  }

  // Parse payload
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  // Only handle push events
  if (event !== "push") {
    return Response.json({ message: `Ignored event: ${event}` }, { status: 200 });
  }

  // Validate payload structure
  if (!isValidPushPayload(payload)) {
    return Response.json(
      { error: "Invalid payload: missing required fields (repository.clone_url, repository.name, repository.full_name, ref, after)" },
      { status: 400 }
    );
  }

  const { repository, ref, after } = payload;

  // Find repo by remote URL
  const repo = getRepoByRemoteUrl(repository.clone_url);
  if (!repo) {
    console.log(`Repo not found for URL: ${repository.clone_url}`);
    return Response.json(
      { error: "Repository not configured in EIFL" },
      { status: 404 }
    );
  }

  const branch = ref.replace("refs/heads/", "");
  console.log(`GitHub push: ${repo.name} (${branch}@${after.slice(0, 8)})`);

  // Fetch .eifl.json from GitHub
  const configUrl = `https://raw.githubusercontent.com/${repository.full_name}/${after}/.eifl.json`;
  const headers: HeadersInit = {};
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const configRes = await fetch(configUrl, { headers });

    if (configRes.status === 404) {
      console.log(`No .eifl.json found in ${repository.full_name}@${after.slice(0, 8)}`);
      return Response.json({ message: "No .eifl.json found" }, { status: 200 });
    }

    if (!configRes.ok) {
      console.error(`Failed to fetch .eifl.json: ${configRes.status}`);
      return Response.json(
        { error: `Failed to fetch pipeline config: ${configRes.status}` },
        { status: 502 }
      );
    }

    const configText = await configRes.text();
    let configJson: unknown;
    try {
      configJson = JSON.parse(configText);
    } catch {
      return Response.json(
        { error: "Invalid JSON in .eifl.json" },
        { status: 400 }
      );
    }

    let config;
    try {
      config = validatePipelineConfig(configJson);
    } catch (error) {
      const message = error instanceof PipelineParseError
        ? error.message
        : "Invalid pipeline configuration";
      return Response.json({ error: message }, { status: 400 });
    }

    // Check if pipeline should trigger on this branch
    if (!shouldTriggerOnPush(config, branch)) {
      console.log(`Pipeline ${config.name} not configured to run on branch ${branch}`);
      return Response.json({ message: "Skipped: not configured for this branch" }, { status: 200 });
    }

    // Upsert pipeline
    const pipeline = upsertPipeline(repo.id, config.name, configJson as object);

    // Create run
    const run = createRun(pipeline.id, after, branch, "github-push");

    // Create steps
    for (const step of config.steps) {
      createStep(run.id, step.name, step.run);
    }

    console.log(`Triggered run #${run.id} for ${config.name}`);

    // Report pending status to GitHub
    const fallbackUrl = req.url.split("/api")[0]; // Fallback to current host if possible
    const runUrl = getPipelineUrl(pipeline.id, fallbackUrl);

    // Fire and forget
    updateCommitStatus(
      repo,
      after,
      "pending",
      runUrl,
      "Build queued"
    ).catch(err => console.error("Failed to update status:", err));

    return Response.json(
      { message: `Triggered run ${run.id}`, runId: run.id },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error processing GitHub webhook:", error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
