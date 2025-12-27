import type { Repo } from "../db/schema";

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
      owner = match[1];
      repoName = match[2];
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
