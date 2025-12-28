export interface PipelineStep {
  name: string;
  run: string;
  capture_sizes?: string[];
  if?: string;
}

export interface PipelineTriggers {
  push?: {
    branches?: string[];
  };
  manual?: boolean;
}

export interface PipelineConfig {
  name: string;
  triggers?: PipelineTriggers;
  runner_tags?: string[]; // Tags that runners must have to execute this pipeline
  steps: PipelineStep[];
}

export class PipelineParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineParseError";
  }
}

export function parsePipelineConfig(content: string): PipelineConfig {
  let config: unknown;

  try {
    config = JSON.parse(content);
  } catch (e) {
    throw new PipelineParseError("Invalid JSON");
  }

  return validatePipelineConfig(config);
}

export function validatePipelineConfig(config: unknown): PipelineConfig {
  if (!config || typeof config !== "object") {
    throw new PipelineParseError("Pipeline config must be an object");
  }

  const c = config as Record<string, unknown>;

  // Validate name
  if (typeof c.name !== "string" || c.name.trim() === "") {
    throw new PipelineParseError("Pipeline must have a non-empty 'name' field");
  }

  // Validate steps
  if (!Array.isArray(c.steps) || c.steps.length === 0) {
    throw new PipelineParseError("Pipeline must have at least one step");
  }

  const steps: PipelineStep[] = [];
  for (let i = 0; i < c.steps.length; i++) {
    const step = c.steps[i];
    if (!step || typeof step !== "object") {
      throw new PipelineParseError(`Step ${i} must be an object`);
    }

    const s = step as Record<string, unknown>;

    if (typeof s.name !== "string" || s.name.trim() === "") {
      throw new PipelineParseError(`Step ${i} must have a non-empty 'name' field`);
    }

    if (typeof s.run !== "string" || s.run.trim() === "") {
      throw new PipelineParseError(`Step ${i} must have a non-empty 'run' field`);
    }

    const parsedStep: PipelineStep = {
      name: s.name,
      run: s.run,
    };

    if (s.capture_sizes !== undefined) {
      if (!Array.isArray(s.capture_sizes)) {
        throw new PipelineParseError(`Step ${i} 'capture_sizes' must be an array`);
      }
      parsedStep.capture_sizes = s.capture_sizes as string[];
    }

    if (s.if !== undefined) {
      if (typeof s.if !== "string") {
        throw new PipelineParseError(`Step ${i} 'if' must be a string`);
      }
      parsedStep.if = s.if;
    }

    steps.push(parsedStep);
  }

  // Validate runner_tags (optional)
  let runner_tags: string[] | undefined;
  if (c.runner_tags !== undefined) {
    if (!Array.isArray(c.runner_tags)) {
      throw new PipelineParseError("'runner_tags' must be an array");
    }
    for (let i = 0; i < c.runner_tags.length; i++) {
      if (typeof c.runner_tags[i] !== "string") {
        throw new PipelineParseError(`'runner_tags[${i}]' must be a string`);
      }
    }
    runner_tags = c.runner_tags as string[];
  }

  // Validate triggers (optional)
  let triggers: PipelineTriggers | undefined;
  if (c.triggers !== undefined) {
    if (typeof c.triggers !== "object" || c.triggers === null) {
      throw new PipelineParseError("'triggers' must be an object");
    }

    const t = c.triggers as Record<string, unknown>;
    triggers = {};

    if (t.push !== undefined) {
      if (typeof t.push !== "object" || t.push === null) {
        throw new PipelineParseError("'triggers.push' must be an object");
      }

      const push = t.push as Record<string, unknown>;
      triggers.push = {};

      if (push.branches !== undefined) {
        if (!Array.isArray(push.branches)) {
          throw new PipelineParseError("'triggers.push.branches' must be an array");
        }
        triggers.push.branches = push.branches as string[];
      }
    }

    if (t.manual !== undefined) {
      if (typeof t.manual !== "boolean") {
        throw new PipelineParseError("'triggers.manual' must be a boolean");
      }
      triggers.manual = t.manual;
    }
  }

  return {
    name: c.name as string,
    triggers,
    runner_tags,
    steps,
  };
}

export function shouldTriggerOnPush(
  config: PipelineConfig,
  branch: string
): boolean {
  // Default: trigger on all branches if no triggers specified
  if (!config.triggers) {
    return true;
  }

  // No push trigger defined
  if (!config.triggers.push) {
    return false;
  }

  // No branch filter: trigger on all branches
  if (!config.triggers.push.branches || config.triggers.push.branches.length === 0) {
    return true;
  }

  // Check if branch matches any pattern
  for (const pattern of config.triggers.push.branches) {
    if (matchBranch(pattern, branch)) {
      return true;
    }
  }

  return false;
}

function matchBranch(pattern: string, branch: string): boolean {
  // Simple wildcard matching
  if (pattern === "*") {
    return true;
  }

  if (pattern.endsWith("*")) {
    return branch.startsWith(pattern.slice(0, -1));
  }

  if (pattern.startsWith("*")) {
    return branch.endsWith(pattern.slice(1));
  }

  return pattern === branch;
}
