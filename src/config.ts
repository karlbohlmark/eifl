// Runtime configuration that can be overridden by environment variables or tests

export function getDataDir(): string {
  return process.env.DATA_DIR || "./data";
}

export function getReposDir(): string {
  return process.env.REPOS_DIR || "./data/repos";
}
