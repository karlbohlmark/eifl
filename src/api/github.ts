import { getRepoByRemoteUrl, upsertPipeline, createRun, createStep } from "../db/queries";
import { parsePipelineConfig } from "../pipeline/parser";

export async function handleGithubWebhook(req: Request): Promise<Response> {
  const event = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  let payload: any;

  if (webhookSecret) {
    if (!signature) {
      return new Response("Missing signature", { status: 401 });
    }

    const payloadText = await req.text();
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signatureParts = signature.split("=");
    if (signatureParts.length !== 2 || signatureParts[0] !== "sha256") {
      return new Response("Invalid signature format", { status: 401 });
    }

    const sigHex = signatureParts[1];
    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );

    const verified = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      encoder.encode(payloadText)
    );

    if (!verified) {
      return new Response("Invalid signature", { status: 401 });
    }

    // Parse JSON after verification since we needed raw text for signature
    payload = JSON.parse(payloadText);
  } else {
    // Fail fast when webhook secret is not configured to avoid accepting unsigned requests.
    console.error(
      "GITHUB_WEBHOOK_SECRET is not set. Refusing to process insecure GitHub webhook requests."
    );
    return new Response("Server misconfiguration: GITHUB_WEBHOOK_SECRET is not set", {
      status: 500,
    });
  }

  if (event !== "push") {
    return new Response("Ignored event", { status: 200 });
  }

  // Validate payload structure
  if (!payload.repository || typeof payload.repository !== "object") {
    return new Response("Invalid payload: missing repository", { status: 400 });
  }

  const repoUrl = payload.repository.clone_url;
  const repoName = payload.repository.name;
  const fullName = payload.repository.full_name;
  const ref = payload.ref; // refs/heads/main
  const after = payload.after; // commit sha

  // Validate all required fields are present
  const missingFields = [];
  if (!repoUrl) missingFields.push("repository.clone_url");
  if (!fullName) missingFields.push("repository.full_name");
  if (!ref) missingFields.push("ref");
  if (!after) missingFields.push("after");

  if (missingFields.length > 0) {
    return new Response(
      `Invalid payload: missing required field(s): ${missingFields.join(", ")}`,
      { status: 400 }
    );
  }

  // Find repo by remote URL
  let repo = getRepoByRemoteUrl(repoUrl);

  // Fallback: match by name if not found by URL
  if (!repo && repoName) {
      // We might need a way to find repo by name across all projects, or assume unique names?
      // Schema says unique(project_id, name). So names are not globally unique.
      // But let's assume the user has configured the remote_url correctly.
  }

  if (!repo) {
    console.log(`Repo not found for URL: ${repoUrl}`);
    return new Response("Repository not configured in Eifl", { status: 404 });
  }

  const branch = ref.replace("refs/heads/", "");

  console.log(`Received GitHub push for ${repo.name} (${branch}@${after})`);

  // Fetch .eifl.json from GitHub
  // Construct raw URL: https://raw.githubusercontent.com/{owner}/{repo}/{sha}/.eifl.json
  const configUrl = `https://raw.githubusercontent.com/${fullName}/${after}/.eifl.json`;

  // Support private repos via GITHUB_TOKEN
  const headers: HeadersInit = {};
  if (process.env.GITHUB_TOKEN) {
    // For raw content API, we might need a token if it's private.
    // However, raw.githubusercontent.com usually works with token in Authorization header.
    // Or we use the API: https://api.github.com/repos/{owner}/{repo}/contents/.eifl.json?ref={sha}
    // But then we need to decode base64.
    // Let's try raw with Authorization header first.
    headers["Authorization"] = `token ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const configRes = await fetch(configUrl, { headers });
    if (!configRes.ok) {
        if (configRes.status === 404) {
            console.log("No .eifl.json found");
            return new Response("No pipeline config found", { status: 200 });
        }
        throw new Error(`Failed to fetch config: ${configRes.status}`);
    }

    const configJson = await configRes.json();
    const config = parsePipelineConfig(JSON.stringify(configJson));

    // Upsert pipeline
    const pipeline = upsertPipeline(repo.id, config.name, configJson);

    // Create run
    const run = createRun(pipeline.id, after, branch, "github-push");

    // Create steps
    for (const step of config.steps) {
      createStep(run.id, step.name, step.run);
    }

    return new Response(`Triggered run ${run.id}`, { status: 201 });

  } catch (error) {
    console.error("Error processing GitHub webhook:", error);
    return new Response("Internal Error", { status: 500 });
  }
}
