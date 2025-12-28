import parser from "cron-parser";
import { getPipelinesDueForRun, updatePipelineNextRun, createRun, createStep, getRepo, hasPendingOrRunningRun } from "../db/queries";
import { parsePipelineConfig } from "./parser";
import { $ } from "bun";
import { getReposDir } from "../config";

export function getNextRun(cron: string): Date {
  try {
    // Use UTC timezone to match database timestamps
    const interval = parser.parse(cron, {
      currentDate: new Date(),
      tz: 'UTC'
    });
    return interval.next().toDate();
  } catch (err) {
    console.error(`Error parsing cron expression "${cron}":`, err);
    throw new Error(`Invalid cron expression: ${cron}`);
  }
}

async function getLatestCommitSha(repoPath: string, branch: string): Promise<string | null> {
  const fullPath = `${getReposDir()}/${repoPath}`;
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
    let config;
    try {
      config = parsePipelineConfig(pipeline.config);
    } catch (e) {
      console.error(`Failed to parse pipeline config for ${pipeline.name}:`, e);
      continue;
    }

    // Find the next run time and update it BEFORE creating the run to prevent race conditions
    if (config.triggers?.schedule && config.triggers.schedule.length > 0) {
      let nextRun: Date | null = null;
      for (const schedule of config.triggers.schedule) {
        try {
          const next = getNextRun(schedule.cron);
          if (!nextRun || next < nextRun) {
            nextRun = next;
          }
        } catch (e) {
          console.error(`Failed to calculate next run for cron "${schedule.cron}":`, e);
        }
      }

      if (nextRun) {
        // Update next_run_at BEFORE creating the run to prevent duplicate runs
        updatePipelineNextRun(pipeline.id, nextRun);
      } else {
        console.warn(`No valid cron schedule found for pipeline ${pipeline.name}`);
        continue;
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

    // Check if there's already a pending or running run to prevent duplicate runs
    if (hasPendingOrRunningRun(pipeline.id)) {
      console.log(`Skipping scheduled run for pipeline "${config.name}" (${pipeline.id}) - already has a pending/running run`);
      continue;
    }

    try {
      const run = createRun(pipeline.id, commitSha, repo.default_branch, "schedule");
      console.log(`Created scheduled run ${run.id} for pipeline "${config.name}" (${pipeline.id})`);

      for (const step of config.steps) {
        createStep(run.id, step.name, step.run);
      }
    } catch (e) {
      console.error(`Error creating run for pipeline ${pipeline.name}:`, e);
    }
  }
}
