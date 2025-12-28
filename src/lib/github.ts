import type { Repo } from "../db/schema";

// Types for GitHub repo verification
export interface GitHubRepoInfo {
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
}

export interface VerifyRepoResult {
  valid: boolean;
  error?: string;
  repoInfo?: GitHubRepoInfo;
}

// Check if GITHUB_TOKEN is configured
export function isGitHubTokenConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN;
}

// Verify a GitHub repository exists and is accessible
export async function verifyGitHubRepo(url: string): Promise<VerifyRepoResult> {
  // Parse URL using existing regex pattern
  const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) {
    return { valid: false, error: "Invalid GitHub URL format" };
  }

  const [, owner, repoName] = match;
  const token = process.env.GITHUB_TOKEN;

  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Eifl-CI",
  };
  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      { headers }
    );

    if (response.status === 404) {
      return {
        valid: false,
        error: token
          ? "Repository not found"
          : "Repository not found (may be private - configure GITHUB_TOKEN)",
      };
    }

    if (response.status === 403) {
      const rateLimit = response.headers.get("X-RateLimit-Remaining");
      if (rateLimit === "0") {
        return { valid: false, error: "GitHub API rate limit exceeded" };
      }
      return { valid: false, error: "Access denied - check GITHUB_TOKEN permissions" };
    }

    if (!response.ok) {
      return { valid: false, error: `GitHub API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      valid: true,
      repoInfo: {
        name: data.name,
        fullName: data.full_name,
        private: data.private,
        defaultBranch: data.default_branch,
        cloneUrl: data.clone_url,
      },
    };
  } catch (error) {
    return { valid: false, error: "Failed to connect to GitHub API" };
  }
}

export async function updateCommitStatus(
  repo: Repo,
  commitSha: string,
  state: "pending" | "success" | "failure" | "error",
  targetUrl: string,
  description: string
): Promise<void> {
  // Only update status for GitHub repos
  if (!repo.remote_url || !repo.remote_url.includes("github.com")) {
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("GITHUB_TOKEN not set. Cannot update commit status.");
    return;
  }

  // Parse owner and repo from remote_url
  // Formats: https://github.com/owner/repo.git or git@github.com:owner/repo.git
  let owner = "";
  let repoName = "";

  try {
    // Regex to match github.com/owner/repo or github.com:owner/repo
    // Handle optional .git suffix
    const match = repo.remote_url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (match) {
      owner = match[1]!;
      repoName = match[2]!;
    } else {
      console.warn(`Could not parse GitHub URL: ${repo.remote_url}`);
      return;
    }
  } catch (e) {
    console.error("Error parsing GitHub URL:", e);
    return;
  }

  const url = `https://api.github.com/repos/${owner}/${repoName}/statuses/${commitSha}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `token ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Eifl-CI",
      },
      body: JSON.stringify({
        state,
        target_url: targetUrl,
        description,
        context: "Eifl CI",
      }),
    });

    if (!response.ok) {
      console.error(`Failed to update GitHub commit status: ${response.status} ${await response.text()}`);
    } else {
      console.log(`Updated GitHub commit status to ${state} for ${owner}/${repoName}@${commitSha.slice(0, 8)}`);
    }
  } catch (error) {
    console.error("Error updating GitHub commit status:", error);
  }
}
