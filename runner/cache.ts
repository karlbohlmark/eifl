import { $ } from "bun";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

export interface CachePresets {
  bun?: boolean;
  node?: boolean;
  zig?: boolean;
  rust?: boolean;
}

export interface CacheResult {
  preset: string;
  hit: boolean;
  key: string | null;
  durationMs: number;
  error?: string;
}

interface PresetConfig {
  keyFiles: string[];
  fallbackKeyFiles?: string[];
  cachePaths: string[];
  globalPaths?: string[];
}

const PRESET_CONFIGS: Record<string, PresetConfig> = {
  bun: {
    keyFiles: ["bun.lockb"],
    fallbackKeyFiles: ["package.json"],
    cachePaths: ["node_modules"],
  },
  node: {
    keyFiles: ["package-lock.json"],
    fallbackKeyFiles: ["yarn.lock", "pnpm-lock.yaml", "package.json"],
    cachePaths: ["node_modules"],
  },
  zig: {
    keyFiles: ["build.zig.zon"],
    fallbackKeyFiles: ["build.zig"],
    cachePaths: ["zig-cache", ".zig-cache"],
    globalPaths: ["~/.cache/zig"],
  },
  rust: {
    keyFiles: ["Cargo.lock"],
    cachePaths: ["target"],
    globalPaths: ["~/.cargo/registry", "~/.cargo/git"],
  },
};

function getCacheDir(): string {
  return process.env.EIFL_CACHE_DIR || join(homedir(), ".eifl", "cache");
}

function expandPath(path: string): string {
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

async function computeCacheKey(
  workDir: string,
  keyFiles: string[],
  fallbackKeyFiles?: string[]
): Promise<string | null> {
  const hash = createHash("sha256");
  let foundAnyFile = false;

  // Try primary key files first
  for (const file of keyFiles) {
    const filePath = join(workDir, file);
    try {
      const content = await Bun.file(filePath).arrayBuffer();
      hash.update(new Uint8Array(content));
      foundAnyFile = true;
    } catch {
      // File doesn't exist, continue
    }
  }

  // If no primary files found, try fallbacks
  if (!foundAnyFile && fallbackKeyFiles) {
    for (const file of fallbackKeyFiles) {
      const filePath = join(workDir, file);
      try {
        const content = await Bun.file(filePath).arrayBuffer();
        hash.update(new Uint8Array(content));
        foundAnyFile = true;
        break; // Use first fallback found
      } catch {
        // File doesn't exist, continue
      }
    }
  }

  if (!foundAnyFile) {
    return null;
  }

  return hash.digest("hex").slice(0, 16);
}

async function restorePreset(
  workDir: string,
  preset: string,
  config: PresetConfig
): Promise<CacheResult> {
  const startTime = Date.now();

  const key = await computeCacheKey(
    workDir,
    config.keyFiles,
    config.fallbackKeyFiles
  );

  if (!key) {
    return {
      preset,
      hit: false,
      key: null,
      durationMs: Date.now() - startTime,
      error: "No key files found",
    };
  }

  const cacheDir = getCacheDir();
  const presetCacheDir = join(cacheDir, preset, key);

  if (!existsSync(presetCacheDir)) {
    return {
      preset,
      hit: false,
      key,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Restore local cache paths
    for (const cachePath of config.cachePaths) {
      const cachedPath = join(presetCacheDir, cachePath);
      const targetPath = join(workDir, cachePath);

      if (existsSync(cachedPath)) {
        await $`cp -r ${cachedPath} ${targetPath}`.quiet();
      }
    }

    // Restore global paths
    if (config.globalPaths) {
      for (const globalPath of config.globalPaths) {
        const expandedPath = expandPath(globalPath);
        const cachedPath = join(
          presetCacheDir,
          "_global",
          globalPath.replace(/^~\//, "")
        );

        if (existsSync(cachedPath)) {
          await $`mkdir -p ${join(expandedPath, "..")}`.quiet();
          await $`cp -r ${cachedPath} ${expandedPath}`.quiet();
        }
      }
    }

    return {
      preset,
      hit: true,
      key,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      preset,
      hit: false,
      key,
      durationMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

async function savePreset(
  workDir: string,
  preset: string,
  config: PresetConfig
): Promise<CacheResult> {
  const startTime = Date.now();

  const key = await computeCacheKey(
    workDir,
    config.keyFiles,
    config.fallbackKeyFiles
  );

  if (!key) {
    return {
      preset,
      hit: false,
      key: null,
      durationMs: Date.now() - startTime,
      error: "No key files found",
    };
  }

  const cacheDir = getCacheDir();
  const presetCacheDir = join(cacheDir, preset, key);

  // Skip if cache already exists (same key = same content)
  if (existsSync(presetCacheDir)) {
    return {
      preset,
      hit: true,
      key,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    // Create cache directory
    await $`mkdir -p ${presetCacheDir}`.quiet();

    let savedAny = false;

    // Save local cache paths
    for (const cachePath of config.cachePaths) {
      const sourcePath = join(workDir, cachePath);

      if (existsSync(sourcePath)) {
        const targetPath = join(presetCacheDir, cachePath);
        await $`cp -r ${sourcePath} ${targetPath}`.quiet();
        savedAny = true;
      }
    }

    // Save global paths
    if (config.globalPaths) {
      const globalDir = join(presetCacheDir, "_global");
      await $`mkdir -p ${globalDir}`.quiet();

      for (const globalPath of config.globalPaths) {
        const expandedPath = expandPath(globalPath);

        if (existsSync(expandedPath)) {
          const targetPath = join(globalDir, globalPath.replace(/^~\//, ""));
          await $`mkdir -p ${join(targetPath, "..")}`.quiet();
          await $`cp -r ${expandedPath} ${targetPath}`.quiet();
          savedAny = true;
        }
      }
    }

    // Remove empty cache dir if nothing was saved
    if (!savedAny) {
      await $`rmdir ${presetCacheDir}`.quiet();
    }

    return {
      preset,
      hit: false,
      key,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    // Clean up on error
    await $`rm -rf ${presetCacheDir}`.quiet();

    return {
      preset,
      hit: false,
      key,
      durationMs: Date.now() - startTime,
      error: String(error),
    };
  }
}

export async function restoreCache(
  workDir: string,
  presets: CachePresets
): Promise<CacheResult[]> {
  const results: CacheResult[] = [];

  for (const [preset, enabled] of Object.entries(presets)) {
    if (!enabled) continue;

    const config = PRESET_CONFIGS[preset];
    if (!config) {
      results.push({
        preset,
        hit: false,
        key: null,
        durationMs: 0,
        error: `Unknown preset: ${preset}`,
      });
      continue;
    }

    const result = await restorePreset(workDir, preset, config);
    results.push(result);
  }

  return results;
}

export async function saveCache(
  workDir: string,
  presets: CachePresets
): Promise<CacheResult[]> {
  const results: CacheResult[] = [];

  for (const [preset, enabled] of Object.entries(presets)) {
    if (!enabled) continue;

    const config = PRESET_CONFIGS[preset];
    if (!config) continue;

    const result = await savePreset(workDir, preset, config);
    results.push(result);
  }

  return results;
}
