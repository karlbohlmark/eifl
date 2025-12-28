import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Tag, X, Copy, Check, Server } from "lucide-react";

interface Runner {
  id: number;
  name: string;
  status: "online" | "offline" | "busy";
  tags: string[];
  last_seen: string | null;
  created_at: string;
}

export function Runners() {
  const [runners, setRunners] = useState<Runner[]>([]);
  const [newRunnerName, setNewRunnerName] = useState("");
  const [newRunnerTags, setNewRunnerTags] = useState("");
  const [showNewRunner, setShowNewRunner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingTags, setEditingTags] = useState<number | null>(null);
  const [editTagsValue, setEditTagsValue] = useState("");
  const [copiedToken, setCopiedToken] = useState<number | null>(null);

  useEffect(() => {
    fetchRunners();
  }, []);

  async function fetchRunners() {
    try {
      const res = await fetch("/api/runners");
      const data = await res.json();
      setRunners(data);
    } catch (error) {
      console.error("Failed to fetch runners:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createRunner() {
    if (!newRunnerName.trim()) return;

    const tags = newRunnerTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/runners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRunnerName, tags }),
      });

      if (res.ok) {
        const runner = await res.json();
        // Show the token once for copying
        alert(`Runner created! Token: ${runner.token}\n\nSave this token - it won't be shown again.`);
        setNewRunnerName("");
        setNewRunnerTags("");
        setShowNewRunner(false);
        fetchRunners();
      }
    } catch (error) {
      console.error("Failed to create runner:", error);
    }
  }

  async function deleteRunner(id: number) {
    try {
      const res = await fetch(`/api/runners/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchRunners();
      }
    } catch (error) {
      console.error("Failed to delete runner:", error);
    }
  }

  async function updateTags(id: number) {
    const tags = editTagsValue
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const res = await fetch(`/api/runners/${id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      });

      if (res.ok) {
        setEditingTags(null);
        fetchRunners();
      }
    } catch (error) {
      console.error("Failed to update tags:", error);
    }
  }

  function startEditingTags(runner: Runner) {
    setEditingTags(runner.id);
    setEditTagsValue(runner.tags.join(", "));
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "online":
        return "bg-green-500";
      case "busy":
        return "bg-yellow-500";
      default:
        return "bg-gray-400";
    }
  }

  function getStatusText(status: string) {
    switch (status) {
      case "online":
        return "Online";
      case "busy":
        return "Busy";
      default:
        return "Offline";
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex justify-between items-center mb-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Runners</h1>
        <Button onClick={() => setShowNewRunner(!showNewRunner)}>
          <Plus className="w-4 h-4 mr-2" />
          New Runner
        </Button>
      </div>

      {showNewRunner && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <Input
                  placeholder="Runner name"
                  value={newRunnerName}
                  onChange={(e) => setNewRunnerName(e.target.value)}
                />
                <Input
                  placeholder="Tags (comma-separated, e.g. performance, linux)"
                  value={newRunnerTags}
                  onChange={(e) => setNewRunnerTags(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={createRunner}>Create</Button>
                <Button variant="outline" onClick={() => setShowNewRunner(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {runners.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Server className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">No runners configured</p>
            <Button onClick={() => setShowNewRunner(true)}>
              Add your first runner
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {runners.map((runner) => (
            <Card key={runner.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${getStatusColor(runner.status)}`}
                      title={getStatusText(runner.status)}
                    />
                    <span>{runner.name}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      ({getStatusText(runner.status)})
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteRunner(runner.id)}
                    title="Delete runner"
                  >
                    <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 flex-wrap">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  {editingTags === runner.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        className="flex-1"
                        value={editTagsValue}
                        onChange={(e) => setEditTagsValue(e.target.value)}
                        placeholder="Tags (comma-separated)"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") updateTags(runner.id);
                          if (e.key === "Escape") setEditingTags(null);
                        }}
                      />
                      <Button size="sm" onClick={() => updateTags(runner.id)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingTags(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      {runner.tags.length > 0 ? (
                        runner.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 bg-muted rounded text-sm"
                          >
                            {tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No tags
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditingTags(runner)}
                      >
                        Edit tags
                      </Button>
                    </>
                  )}
                </div>
                {runner.last_seen && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Last seen: {new Date(runner.last_seen).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-lg">Using Runner Tags</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Runner tags allow you to control which runners execute specific pipelines.
            For example, you can tag runners with "performance" and require that tag
            in your pipeline config.
          </p>
          <div className="bg-muted p-4 rounded font-mono text-xs">
            <pre>{`// .eifl.json
{
  "name": "performance-tests",
  "runner_tags": ["performance", "linux"],
  "steps": [
    { "name": "benchmark", "run": "./run-benchmarks.sh" }
  ]
}`}</pre>
          </div>
          <p>
            A runner must have <strong>all</strong> specified tags to pick up the job.
            If no runner_tags are specified, any runner can execute the pipeline.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
