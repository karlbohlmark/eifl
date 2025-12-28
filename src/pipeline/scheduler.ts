import { getRepoByPath, upsertPipeline, createRun, createStep } from "../db/queries";
import { getPipelineConfig } from "../git/browse";
import { parsePipelineConfig, shouldTriggerOnPush, type PipelineConfig } from "./parser";
import type { PushInfo } from "../git/http";
import { getNextRun } from "./cron";

export async function handlePushTrigger(
  repoPath: string,
  pushInfo: PushInfo[]
): Promise<void> {
  const repo = getRepoByPath(repoPath);
  if (!repo) {
    console.error(`Repository not found: ${repoPath}`);
    return;
  }

  for (const push of pushInfo) {
    // Skip delete pushes
    if (push.newrev === "0000000000000000000000000000000000000000") {
      continue;
    }

    // Extract branch name from refname (refs/heads/main -> main)
    const branchMatch = push.refname.match(/^refs\/heads\/(.+)$/);
    if (!branchMatch) {
      continue; // Not a branch push (could be tag)
    }
    const branch = branchMatch[1]!;

    console.log(`Processing push to ${branch} (${push.newrev.slice(0, 8)})`);

    // Try to read .eifl.json from the pushed commit
    const configJson = await getPipelineConfig(repoPath, push.newrev);
    if (!configJson) {
      console.log(`No .eifl.json found in ${repoPath}@${push.newrev.slice(0, 8)}`);
      continue;
    }

    let config: PipelineConfig;
    try {
      config = parsePipelineConfig(JSON.stringify(configJson));
    } catch (error) {
      console.error(`Failed to parse .eifl.json: ${error}`);
      continue;
    }

    // Check if pipeline should trigger on this branch
    if (!shouldTriggerOnPush(config, branch)) {
      console.log(`Pipeline ${config.name} not configured to run on branch ${branch}`);
      continue;
    }

    // Calculate next run time if schedule exists
    let nextRunAt: Date | undefined;
    if (config.triggers?.schedule && config.triggers.schedule.length > 0) {
      for (const schedule of config.triggers.schedule) {
        try {
          const next = getNextRun(schedule.cron);
          if (!nextRunAt || next < nextRunAt) {
            nextRunAt = next;
          }
        } catch (error) {
          console.error(`Failed to calculate next run for cron "${schedule.cron}":`, error);
        }
      }
    }

    // Upsert pipeline configuration
    const pipeline = upsertPipeline(repo.id, config.name, configJson, nextRunAt);
    console.log(`Updated pipeline: ${config.name} (id: ${pipeline.id})`);

    // Create a new run
    const run = createRun(pipeline.id, push.newrev, branch, "push");
    console.log(`Created run: ${run.id} for pipeline ${config.name}`);

    // Create steps
    for (const step of config.steps) {
      createStep(run.id, step.name, step.run);
    }

    console.log(`Pipeline ${config.name} triggered for ${branch}@${push.newrev.slice(0, 8)}`);
  }
}
