import { TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";
import {
  type Metric,
  type HistoryPoint,
  type TrendAnalysis,
  formatMetricValue,
  getMetricDisplayName,
  analyzeMetricTrend,
} from "@/lib/metrics";

interface MetricCardProps {
  metric: Metric;
  history?: HistoryPoint[];
  onClick: () => void;
  isExpanded: boolean;
}

function TrendIndicator({ trend }: { trend: TrendAnalysis }) {
  if (trend.direction === "stable") {
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  }

  const Icon = trend.direction === "up" ? TrendingUp : TrendingDown;
  const colorClass = trend.isPositive ? "text-green-500" : "text-red-500";

  return <Icon className={cn("w-4 h-4", colorClass)} />;
}

export function MetricCard({ metric, history, onClick, isExpanded }: MetricCardProps) {
  const trend = history && history.length >= 2 ? analyzeMetricTrend(history, metric.key) : null;
  const displayName = getMetricDisplayName(metric.key);
  const formattedValue = formatMetricValue(metric.key, metric.value, metric.unit);

  // Determine border class based on outlier status
  let borderClass = "border border-transparent";
  if (trend?.isOutlier) {
    borderClass = trend.isPositive
      ? "border-2 border-green-500/50"
      : "border-2 border-amber-500 animate-pulse";
  }

  // Color for sparkline based on trend
  const sparklineColor = trend?.isPositive !== false ? "#22c55e" : "#ef4444";

  return (
    <div
      className={cn(
        "p-4 rounded-lg bg-muted cursor-pointer transition-all hover:bg-muted/80",
        borderClass
      )}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <p className="text-sm text-muted-foreground truncate pr-2">{displayName}</p>
        <div className="flex items-center gap-1 flex-shrink-0">
          {trend?.isOutlier && !trend.isPositive && (
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          )}
          {trend && <TrendIndicator trend={trend} />}
        </div>
      </div>

      <div className="flex justify-between items-end mt-1">
        <p className="text-2xl font-bold">{formattedValue}</p>
        {history && history.length > 1 && (
          <Sparkline
            data={history.slice(-10).map((h) => h.value)}
            color={sparklineColor}
          />
        )}
      </div>

      {trend && Math.abs(trend.percentChange) >= 1 && (
        <p
          className={cn(
            "text-xs mt-1",
            trend.isPositive ? "text-green-600" : "text-red-500"
          )}
        >
          {trend.direction === "up" ? "+" : ""}
          {trend.percentChange.toFixed(1)}% from previous
        </p>
      )}

      {isExpanded && history && history.length > 1 && (
        <div className="mt-4 h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <XAxis dataKey="created_at" tick={false} axisLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value) =>
                  formatMetricValue(metric.key, value as number, metric.unit)
                }
                labelFormatter={() => ""}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
