import { Glob } from "bun";

export interface MetricValue {
  key: string;
  value: number;
  unit?: string;
}

export const collectMetrics = {
  // Parse metrics from command output using ::metric:: format
  parseOutputMetrics(output: string): MetricValue[] {
    const metrics: MetricValue[] = [];
    const regex = /::metric::(\w+)=([0-9.]+)(?::(\w+))?/g;

    let match;
    while ((match = regex.exec(output)) !== null) {
      metrics.push({
        key: match[1]!,
        value: parseFloat(match[2]!),
        unit: match[3],
      });
    }

    return metrics;
  },

  // Capture file sizes matching a glob pattern
  async captureFileSizes(cwd: string, pattern: string): Promise<MetricValue[]> {
    const metrics: MetricValue[] = [];

    try {
      const glob = new Glob(pattern);
      const files = glob.scanSync({ cwd, absolute: true });

      for (const filePath of files) {
        const file = Bun.file(filePath);
        const size = file.size;
        const relativePath = filePath.replace(cwd + "/", "");
        const key = `size.${relativePath.replace(/[^a-zA-Z0-9_]/g, "_")}`;

        metrics.push({
          key,
          value: size,
          unit: "bytes",
        });
      }
    } catch (error) {
      console.error(`Error capturing file sizes for pattern ${pattern}:`, error);
    }

    return metrics;
  },

  // Parse test results (basic implementation)
  parseTestResults(output: string): MetricValue[] {
    const metrics: MetricValue[] = [];

    // Try to parse common test output formats
    // Format: X passed, Y failed, Z skipped
    const passedMatch = output.match(/(\d+)\s+pass(?:ed|ing)?/i);
    const failedMatch = output.match(/(\d+)\s+fail(?:ed|ing)?/i);
    const skippedMatch = output.match(/(\d+)\s+skip(?:ped)?/i);

    if (passedMatch) {
      metrics.push({ key: "tests.passed", value: parseInt(passedMatch[1]!) });
    }
    if (failedMatch) {
      metrics.push({ key: "tests.failed", value: parseInt(failedMatch[1]!) });
    }
    if (skippedMatch) {
      metrics.push({ key: "tests.skipped", value: parseInt(skippedMatch[1]!) });
    }

    // Try Zig test format: X/Y passed
    const zigMatch = output.match(/(\d+)\/(\d+) (?:test )?passed/i);
    if (zigMatch) {
      metrics.push({ key: "tests.passed", value: parseInt(zigMatch[1]!) });
      metrics.push({ key: "tests.total", value: parseInt(zigMatch[2]!) });
    }

    return metrics;
  },
};
