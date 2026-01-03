import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MetricCard } from "./MetricCard";
import type { MetricGroup, HistoryPoint } from "@/lib/metrics";

interface MetricGroupCardProps {
  group: MetricGroup;
  metricHistories: Record<string, HistoryPoint[]>;
  onFetchHistory: (key: string) => void;
  defaultExpanded?: boolean;
}

export function MetricGroupCard({
  group,
  metricHistories,
  onFetchHistory,
  defaultExpanded,
}: MetricGroupCardProps) {
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded ?? group.metrics.length <= 3
  );
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const Icon = group.icon;
  const visibleMetrics = isExpanded ? group.metrics : group.metrics.slice(0, 3);
  const hiddenCount = group.metrics.length - visibleMetrics.length;

  const handleMetricClick = (metricKey: string) => {
    // Toggle expanded state for the clicked metric
    setExpandedMetric(expandedMetric === metricKey ? null : metricKey);
    // Fetch history if not already loaded
    if (!metricHistories[metricKey]) {
      onFetchHistory(metricKey);
    }
  };

  return (
    <div className="border rounded-lg p-4">
      <button
        className="flex items-center gap-2 w-full text-left mb-3"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{group.name}</span>
        <span className="text-muted-foreground text-sm">
          ({group.metrics.length})
        </span>
        <ChevronDown
          className={cn(
            "w-4 h-4 ml-auto transition-transform text-muted-foreground",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {visibleMetrics.map((metric) => (
          <MetricCard
            key={metric.key}
            metric={metric}
            history={metricHistories[metric.key]}
            onClick={() => handleMetricClick(metric.key)}
            isExpanded={expandedMetric === metric.key}
          />
        ))}
      </div>

      {hiddenCount > 0 && !isExpanded && (
        <button
          className="text-sm text-muted-foreground mt-3 hover:underline"
          onClick={() => setIsExpanded(true)}
        >
          +{hiddenCount} more
        </button>
      )}
    </div>
  );
}
