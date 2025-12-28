import { $ } from "bun";
import { getReposDir } from "../config";

export interface TreeEntry {
  mode: string;
  type: "blob" | "tree";
  hash: string;
  name: string;
}

export interface Commit {
  sha: string;
  author: string;
  authorEmail: string;
  date: string;
  message: string;
}

export interface FileContent {
  content: string;
  size: number;
  binary: boolean;
}

// List files in a directory
export async function listTree(
  repoPath: string,
  ref: string,
  path = ""
): Promise<TreeEntry[]> {
  const fullPath = `${getReposDir()}/${repoPath}`;
  const treePath = path ? `${ref}:${path}` : ref;

  try {
    const result = await $`git -C ${fullPath} ls-tree ${treePath}`.quiet();
    if (result.exitCode !== 0) {
      return [];
    }

    const entries: TreeEntry[] = [];
    const lines = result.stdout.toString().split("\n").filter(Boolean);

    for (const line of lines) {
      // Format: mode type hash\tname
      const match = line.match(/^(\d+) (blob|tree) ([0-9a-f]+)\t(.+)$/);
      if (match) {
        entries.push({
          mode: match[1]!,
          type: match[2]! as "blob" | "tree",
          hash: match[3]!,
          name: match[4]!,
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    return entries.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "tree" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

// Get file content
export async function getFileContent(
  repoPath: string,
  ref: string,
  filePath: string
): Promise<FileContent | null> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  try {
    const result = await $`git -C ${fullPath} show ${ref}:${filePath}`.quiet();
    if (result.exitCode !== 0) {
      return null;
    }

    const content = result.stdout.toString();
    const buffer = result.stdout;

    // Check if binary (contains null bytes or high ratio of non-printable chars)
    const bytes = new Uint8Array(buffer);
    let nonPrintable = 0;
    for (let i = 0; i < Math.min(bytes.length, 8000); i++) {
      const byte = bytes[i]!;
      if (byte === 0) {
        return { content: "", size: bytes.length, binary: true };
      }
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable++;
      }
    }

    const binary = nonPrintable / Math.min(bytes.length, 8000) > 0.3;
    return { content: binary ? "" : content, size: bytes.length, binary };
  } catch {
    return null;
  }
}

// Get commit log
export async function getCommits(
  repoPath: string,
  ref: string,
  limit = 50,
  path?: string
): Promise<Commit[]> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  try {
    const format = "%H%n%an%n%ae%n%aI%n%s%n---";
    const args = [
      "-C",
      fullPath,
      "log",
      `--format=${format}`,
      `-n`,
      `${limit}`,
      ref,
    ];
    if (path) {
      args.push("--", path);
    }

    const result = await $`git ${args}`.quiet();
    if (result.exitCode !== 0) {
      return [];
    }

    const commits: Commit[] = [];
    const blocks = result.stdout.toString().split("---\n").filter(Boolean);

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      if (lines.length >= 5) {
        commits.push({
          sha: lines[0]!,
          author: lines[1]!,
          authorEmail: lines[2]!,
          date: lines[3]!,
          message: lines[4]!,
        });
      }
    }

    return commits;
  } catch {
    return [];
  }
}

// Get single commit details
export async function getCommit(
  repoPath: string,
  sha: string
): Promise<Commit | null> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  try {
    const format = "%H%n%an%n%ae%n%aI%n%B";
    const result = await $`git -C ${fullPath} show --format=${format} -s ${sha}`.quiet();
    if (result.exitCode !== 0) {
      return null;
    }

    const lines = result.stdout.toString().trim().split("\n");
    if (lines.length >= 5) {
      return {
        sha: lines[0]!,
        author: lines[1]!,
        authorEmail: lines[2]!,
        date: lines[3]!,
        message: lines.slice(4).join("\n"),
      };
    }
    return null;
  } catch {
    return null;
  }
}

// Get diff for a commit
export async function getCommitDiff(
  repoPath: string,
  sha: string
): Promise<string> {
  const fullPath = `${getReposDir()}/${repoPath}`;

  try {
    const result = await $`git -C ${fullPath} show --format="" ${sha}`.quiet();
    if (result.exitCode === 0) {
      return result.stdout.toString();
    }
  } catch {
    // Ignore
  }
  return "";
}

// Check if a file exists and is a .eifl.json
export async function getPipelineConfig(
  repoPath: string,
  ref: string
): Promise<object | null> {
  const content = await getFileContent(repoPath, ref, ".eifl.json");
  if (!content || content.binary) {
    return null;
  }

  try {
    return JSON.parse(content.content);
  } catch {
    return null;
  }
}
