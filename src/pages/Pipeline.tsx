import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  XCircle,
  CheckCircle,
  Clock,
  Loader2,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatRelativeTime } from "../lib/utils";

interface Pipeline {
  id: number;
  repo_id: number;
  name: string;
  config: string;
}

interface Run {
  id: number;
  pipeline_id: number;
  status: "pending" | "running" | "success" | "failed" | "cancelled";
  commit_sha: string | null;
  branch: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

interface Step {
  id: number;
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  exit_code: number | null;
  output: string | null;
}

interface Metric {
  key: string;
  value: number;
  unit: string | null;
}

interface RunDetails extends Run {
  steps: Step[];
  metrics: Metric[];
  pipeline: Pipeline;
}

const STATUS_ICONS = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  cancelled: <XCircle className="w-4 h-4 text-muted-foreground" />,
  skipped: <Clock className="w-4 h-4 text-muted-foreground" />,
};

export function PipelineView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetails | null>(null);
  const [metricHistory, setMetricHistory] = useState<
    Record<string, Array<{ value: number; created_at: string }>>
  >({});
  const [loading, setLoading] = useState(true);
  const [showMetrics, setShowMetrics] = useState(true);

  // Get run ID from URL if present
  const urlRunId = searchParams.get("run");

  useEffect(() => {
    fetchPipeline();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [id]);

  useEffect(() => {
    if (selectedRun && (selectedRun.status === "pending" || selectedRun.status === "running")) {
      const interval = setInterval(() => fetchRun(selectedRun.id), 2000);
      return () => clearInterval(interval);
    }
  }, [selectedRun?.id, selectedRun?.status]);

  async function fetchPipeline() {
    try {
      const [pipelineRes, runsRes] = await Promise.all([
        fetch(`/api/pipelines/${id}`),
        fetch(`/api/pipelines/${id}/runs`),
      ]);

      if (pipelineRes.ok) {
        setPipeline(await pipelineRes.json());
      }

      if (runsRes.ok) {
        const runsData = await runsRes.json();
        setRuns(runsData);
        if (runsData.length > 0 && !selectedRun) {
          // If URL has a run ID, use that; otherwise use the first run
          const targetRunId = urlRunId ? parseInt(urlRunId) : runsData[0].id;
          fetchRun(targetRunId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch pipeline:", error);
    } finally {
      setLoading(false);
    }
  }

  function selectRun(runId: number) {
    setSearchParams({ run: String(runId) });
    fetchRun(runId);
  }

  async function fetchRuns() {
    try {
      const res = await fetch(`/api/pipelines/${id}/runs`);
      if (res.ok) {
        setRuns(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch runs:", error);
    }
  }

  async function fetchRun(runId: number) {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        setSelectedRun(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch run:", error);
    }
  }

  async function triggerPipeline() {
    try {
      const res = await fetch(`/api/pipelines/${id}/trigger`, {
        method: "POST",
      });
      if (res.ok) {
        const run = await res.json();
        fetchRuns();
        selectRun(run.id);
      }
    } catch (error) {
      console.error("Failed to trigger pipeline:", error);
    }
  }

  async function cancelRun(runId: number) {
    try {
      await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      fetchRun(runId);
      fetchRuns();
    } catch (error) {
      console.error("Failed to cancel run:", error);
    }
  }

  async function fetchMetricHistory(key: string) {
    try {
      const res = await fetch(`/api/pipelines/${id}/metrics/${key}`);
      if (res.ok) {
        const data = await res.json();
        setMetricHistory((prev) => ({ ...prev, [key]: data }));
      }
    } catch (error) {
      console.error("Failed to fetch metric history:", error);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Pipeline not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6">
        <Link
          to={`/repo/${pipeline.repo_id}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to repository
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{pipeline.name}</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowMetrics(!showMetrics)}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Metrics
          </Button>
          <Button onClick={triggerPipeline}>
            <Play className="w-4 h-4 mr-2" />
            Run Pipeline
          </Button>
        </div>
      </div>

      {showMetrics && selectedRun?.metrics && selectedRun.metrics.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {selectedRun.metrics
                .filter((m) => !m.key.startsWith("step."))
                .map((metric) => (
                  <div
                    key={metric.key}
                    className="p-4 rounded-lg bg-muted"
                    onClick={() => fetchMetricHistory(metric.key)}
                  >
                    <p className="text-sm text-muted-foreground">{metric.key}</p>
                    <p className="text-2xl font-bold">
                      {metric.key.includes("duration")
                        ? `${(metric.value / 1000).toFixed(2)}s`
                        : metric.key.includes("size")
                        ? `${(metric.value / 1024).toFixed(2)} KB`
                        : metric.value}
                    </p>
                    {metricHistory[metric.key] && (
                      <div className="mt-4 h-32">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={metricHistory[metric.key]}>
                            <XAxis
                              dataKey="created_at"
                              tick={false}
                              axisLine={false}
                            />
                            <YAxis hide />
                            <Tooltip />
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
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Runs</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {runs.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No runs yet
                </div>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => selectRun(run.id)}
                    className={`w-full p-3 flex items-center gap-2 hover:bg-muted border-b last:border-0 ${
                      selectedRun?.id === run.id ? "bg-muted" : ""
                    }`}
                  >
                    {STATUS_ICONS[run.status]}
                    <div className="text-left flex-1">
                      <p className="text-sm font-medium">Run #{run.id}</p>
                      <p className="text-xs text-muted-foreground">
                        {run.branch}
                        {run.commit_sha && ` @ ${run.commit_sha.slice(0, 8)}`}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2">
          {selectedRun ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {STATUS_ICONS[selectedRun.status]}
                    Run #{selectedRun.id}
                  </span>
                  {(selectedRun.status === "pending" ||
                    selectedRun.status === "running") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelRun(selectedRun.id)}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground mb-4">
                  {selectedRun.branch && <span>{selectedRun.branch}</span>}
                  {selectedRun.commit_sha && (
                    <span className="ml-2 font-mono">
                      {selectedRun.commit_sha.slice(0, 8)}
                    </span>
                  )}
                  {selectedRun.started_at && (
                    <span className="ml-4">
                      Started: {formatRelativeTime(selectedRun.started_at)}
                    </span>
                  )}
                </div>

                <div className="space-y-4">
                  {selectedRun.steps.map((step) => (
                    <div key={step.id} className="border rounded-lg">
                      <div className="flex items-center gap-2 p-3 bg-muted/50">
                        {STATUS_ICONS[step.status]}
                        <span className="font-medium">{step.name}</span>
                        {step.exit_code !== null && step.exit_code !== 0 && (
                          <span className="text-xs text-red-500 ml-auto">
                            Exit code: {step.exit_code}
                          </span>
                        )}
                      </div>
                      {step.output && (
                        <div className="bg-black rounded-b-lg">
                          <pre className="p-4 text-xs font-mono overflow-x-auto text-green-400 max-h-[500px] overflow-y-auto leading-relaxed scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                            {step.output}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Select a run to view details
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
