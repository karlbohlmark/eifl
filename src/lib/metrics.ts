import { Clock, TestTube2, Database, FileText, BarChart3 } from "lucide-react";
import type { ComponentType } from "react";

export interface Metric {
  key: string;
  value: number;
  unit: string | null;
}

export interface MetricGroup {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  priority: number;
  metrics: Metric[];
}

export interface TrendAnalysis {
  direction: "up" | "down" | "stable";
  percentChange: number;
  isOutlier: boolean;
  isPositive: boolean;
}

export interface HistoryPoint {
  value: number;
  created_at: string;
}

/**
 * Groups metrics by their semantic category based on key prefix
 */
export function groupMetrics(metrics: Metric[]): MetricGroup[] {
  const groups: Record<string, MetricGroup> = {
    duration: { id: "duration", name: "Duration", icon: Clock, priority: 1, metrics: [] },
    tests: { id: "tests", name: "Tests", icon: TestTube2, priority: 2, metrics: [] },
    cache: { id: "cache", name: "Cache", icon: Database, priority: 3, metrics: [] },
    size: { id: "size", name: "Bundle Size", icon: FileText, priority: 4, metrics: [] },
    custom: { id: "custom", name: "Custom", icon: BarChart3, priority: 5, metrics: [] },
  };

  for (const metric of metrics) {
    // Skip step-level metrics
    if (metric.key.startsWith("step.")) continue;

    if (metric.key.includes("duration")) {
      groups.duration!.metrics.push(metric);
    } else if (metric.key.startsWith("tests.")) {
      groups.tests!.metrics.push(metric);
    } else if (metric.key.startsWith("cache.")) {
      groups.cache!.metrics.push(metric);
    } else if (metric.key.startsWith("size.")) {
      groups.size!.metrics.push(metric);
    } else {
      groups.custom!.metrics.push(metric);
    }
  }

  return Object.values(groups)
    .filter((g) => g.metrics.length > 0)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Format metric value based on its type
 */
export function formatMetricValue(key: string, value: number, unit?: string | null): string {
  if (key.includes("duration")) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  if (key.includes("size")) {
    if (value >= 1024 * 1024) {
      return `${(value / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${(value / 1024).toFixed(2)} KB`;
  }
  if (unit) {
    return `${value} ${unit}`;
  }
  // For counts and other integers, don't show decimals
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
}

/**
 * Convert metric key to human-readable display name
 * e.g., "cache.bun.hit" -> "Bun Hit", "total_duration_ms" -> "Total Duration"
 */
export function getMetricDisplayName(key: string): string {
  // Remove common prefixes
  let name = key
    .replace(/^tests\./, "")
    .replace(/^cache\./, "")
    .replace(/^size\./, "");

  // Remove common suffixes
  name = name.replace(/_ms$/, "").replace(/_bytes$/, "");

  // Convert snake_case and dots to spaces, then title case
  return name
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Determine if an increase in this metric is positive (good)
 */
export function isIncreasePositive(key: string): boolean {
  // Metrics where higher is better
  if (key === "tests.passed" || key.endsWith(".hit")) {
    return true;
  }
  // Metrics where lower is better (duration, failed tests, sizes)
  if (
    key.includes("duration") ||
    key === "tests.failed" ||
    key.includes("size")
  ) {
    return false;
  }
  // Default: neutral (higher could be either)
  return true;
}

/**
 * Analyze metric trend compared to historical values
 */
export function analyzeMetricTrend(history: HistoryPoint[], metricKey: string): TrendAnalysis {
  if (history.length < 2) {
    return { direction: "stable", percentChange: 0, isOutlier: false, isPositive: true };
  }

  const current = history[history.length - 1]!.value;
  const previous = history[history.length - 2]!.value;

  // Calculate percentage change
  let percentChange = 0;
  if (previous !== 0) {
    percentChange = ((current - previous) / Math.abs(previous)) * 100;
  } else if (current !== 0) {
    percentChange = 100; // From 0 to something is 100% increase
  }

  // Calculate standard deviation for outlier detection
  const values = history.map((h) => h.value);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Outlier if > 2 standard deviations from mean
  const isOutlier = stdDev > 0 && Math.abs(current - mean) > 2 * stdDev;

  // Determine direction (use 1% threshold for stability)
  const direction: "up" | "down" | "stable" =
    percentChange > 1 ? "up" : percentChange < -1 ? "down" : "stable";

  // Determine if change is positive based on metric type
  const increaseIsGood = isIncreasePositive(metricKey);
  const isPositive =
    direction === "stable" ||
    (direction === "up" && increaseIsGood) ||
    (direction === "down" && !increaseIsGood);

  return { direction, percentChange, isOutlier, isPositive };
}
