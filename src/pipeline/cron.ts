import parser from "cron-parser";
import { getPipelinesDueForRun, updatePipelineNextRun, createRun, createStep, getRepo } from "../db/queries";
import { parsePipelineConfig } from "./parser";
import { $ } from "bun";

export function getNextRun(cron: string): Date {
  try {
    const interval = parser.parse(cron);
    return interval.next().toDate();
  } catch (err) {
    console.error(`Error parsing cron expression ${cron}:`, err);
    // Return a date far in the future to avoid infinite loop of failures
    const future = new Date();
    future.setFullYear(future.getFullYear() + 10);
    return future;
  }
}

async function getLatestCommitSha(repoPath: string, branch: string): Promise<string | null> {
  const fullPath = `./data/repos/${repoPath}`;
  try {
    const result = await $`git -C ${fullPath} rev-parse ${branch}`.quiet();
    if (result.exitCode !== 0) {
      console.error(`git rev-parse failed for ${fullPath} ${branch}: ${result.stderr.toString()}`);
      return null;
    }
    return result.stdout.toString().trim();
  } catch (e) {
    console.error(`git rev-parse exception for ${fullPath} ${branch}:`, e);
    return null;
  }
}

export async function processScheduledPipelines() {
  const duePipelines = getPipelinesDueForRun();

  for (const pipeline of duePipelines) {
    // console.log(`Processing scheduled run for pipeline ${pipeline.name} (id: ${pipeline.id})`);

    let config;
    try {
      config = parsePipelineConfig(pipeline.config);
    } catch (e) {
      console.error(`Failed to parse pipeline config for ${pipeline.name}:`, e);
      continue;
    }

    // Find the next run time
    if (config.triggers?.schedule && config.triggers.schedule.length > 0) {
      let nextRun: Date | null = null;
      for (const schedule of config.triggers.schedule) {
        const next = getNextRun(schedule.cron);
        if (!nextRun || next < nextRun) {
          nextRun = next;
        }
      }

      if (nextRun) {
        updatePipelineNextRun(pipeline.id, nextRun);
      }
    } else {
        continue;
    }

    // Create run
    const repo = getRepo(pipeline.repo_id);
    if (!repo) {
      console.error(`Repo not found for pipeline ${pipeline.id}`);
      continue;
    }

    const commitSha = await getLatestCommitSha(repo.path, repo.default_branch);
    if (!commitSha) {
      console.error(`Could not get latest commit for repo ${repo.path} (default branch: ${repo.default_branch})`);
      continue;
    }

    try {
        const run = createRun(pipeline.id, commitSha, repo.default_branch, "schedule");
        // console.log(`Created scheduled run: ${run.id} for pipeline ${pipeline.name}`);

        for (const step of config.steps) {
          createStep(run.id, step.name, step.run);
        }
    } catch (e) {
        console.error("Error creating run:", e);
    }
  }
}
