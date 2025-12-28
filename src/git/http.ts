import { $ } from "bun";
import { getRepoByPath } from "../db/queries";
import { getReposDir } from "../config";

export async function initBareRepo(path: string): Promise<void> {
  const fullPath = `${getReposDir()}/${path}`;
  await $`git init --bare ${fullPath}`.quiet();

  // Create post-receive hook for pipeline triggering
  const hookPath = `${fullPath}/hooks/post-receive`;
  const hookScript = `#!/bin/sh
# EIFL post-receive hook
# This will be called by the server to trigger pipelines
while read oldrev newrev refname; do
  echo "Received push: $refname $oldrev -> $newrev"
done
`;
  await Bun.write(hookPath, hookScript);
  await $`chmod +x ${hookPath}`.quiet();
}

export async function deleteRepoFiles(path: string): Promise<void> {
  const fullPath = `${getReposDir()}/${path}`;
  await $`rm -rf ${fullPath}`.quiet();
}

function pktLine(data: string): string {
  const len = (data.length + 4).toString(16).padStart(4, "0");
  return len + data;
}

function pktFlush(): string {
  return "0000";
}

export async function handleGitInfoRefs(
  repoPath: string,
  service: string
): Promise<Response> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  // Verify repo exists
  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return new Response("Repository not found", { status: 404 });
  }

  // Run git command
  const result = await $`git ${service.replace("git-", "")} --stateless-rpc --advertise-refs ${fullPath}`.quiet();

  if (result.exitCode !== 0) {
    return new Response("Git command failed", { status: 500 });
  }

  // Build response with service announcement
  const body =
    pktLine(`# service=${service}\n`) +
    pktFlush() +
    result.stdout.toString();

  return new Response(body, {
    headers: {
      "Content-Type": `application/x-${service}-advertisement`,
      "Cache-Control": "no-cache",
    },
  });
}

export async function handleGitUploadPack(
  repoPath: string,
  body: ReadableStream<Uint8Array> | null
): Promise<Response> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  // Verify repo exists
  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return new Response("Repository not found", { status: 404 });
  }

  const input = body ? await Bun.readableStreamToArrayBuffer(body) : new ArrayBuffer(0);

  const proc = Bun.spawn(["git", "upload-pack", "--stateless-rpc", fullPath], {
    stdin: new Uint8Array(input),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).arrayBuffer();
  await proc.exited;

  return new Response(output, {
    headers: {
      "Content-Type": "application/x-git-upload-pack-result",
      "Cache-Control": "no-cache",
    },
  });
}

export interface PushInfo {
  oldrev: string;
  newrev: string;
  refname: string;
}

export async function handleGitReceivePack(
  repoPath: string,
  body: ReadableStream<Uint8Array> | null
): Promise<{ response: Response; pushInfo: PushInfo[] }> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  // Verify repo exists
  const repo = getRepoByPath(repoPath);
  if (!repo) {
    return {
      response: new Response("Repository not found", { status: 404 }),
      pushInfo: [],
    };
  }

  const input = body ? await Bun.readableStreamToArrayBuffer(body) : new ArrayBuffer(0);

  // Parse the input to extract push info
  const pushInfo = parsePushInfo(new Uint8Array(input));

  const proc = Bun.spawn(["git", "receive-pack", "--stateless-rpc", fullPath], {
    stdin: new Uint8Array(input),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).arrayBuffer();
  await proc.exited;

  return {
    response: new Response(output, {
      headers: {
        "Content-Type": "application/x-git-receive-pack-result",
        "Cache-Control": "no-cache",
      },
    }),
    pushInfo,
  };
}

function parsePushInfo(data: Uint8Array): PushInfo[] {
  const pushes: PushInfo[] = [];
  const text = new TextDecoder().decode(data);

  // Parse pkt-line format
  let pos = 0;
  while (pos < text.length) {
    // Read 4-byte hex length
    const lenHex = text.slice(pos, pos + 4);
    if (lenHex === "0000") {
      break; // Flush packet
    }

    const len = parseInt(lenHex, 16);
    if (isNaN(len) || len < 4) {
      break;
    }

    const line = text.slice(pos + 4, pos + len);
    pos += len;

    // Parse oldrev newrev refname format
    const match = line.match(/^([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\x00\n]+)/);
    if (match) {
      pushes.push({
        oldrev: match[1]!,
        newrev: match[2]!,
        refname: match[3]!,
      });
    }
  }

  return pushes;
}

// Get latest commit SHA for a branch
export async function getLatestCommit(repoPath: string, branch: string): Promise<string | null> {
  const fullPath = `${getReposDir()}/${repoPath}`;
  try {
    const result = await $`git -C ${fullPath} rev-parse ${branch}`.quiet();
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }
  } catch {
    // Branch doesn't exist
  }
  return null;
}

// List branches
export async function listBranches(repoPath: string): Promise<string[]> {
  const fullPath = `${getReposDir()}/${repoPath}`;
  try {
    const result = await $`git -C ${fullPath} branch --format='%(refname:short)'`.quiet();
    if (result.exitCode === 0) {
      return result.stdout
        .toString()
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean);
    }
  } catch {
    // No branches yet
  }
  return [];
}
