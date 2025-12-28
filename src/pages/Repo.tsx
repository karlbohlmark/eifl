import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  File,
  Folder,
  GitBranch,
  GitCommit,
  Play,
  Copy,
  Check,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  Github,
  ExternalLink,
  Key,
} from "lucide-react";
import { formatRelativeTime } from "../lib/utils";
import { SecretsManager } from "@/components/SecretsManager";

interface Repo {
  id: number;
  project_id: number;
  name: string;
  path: string;
  default_branch: string;
  remote_url: string | null;
}

interface TreeEntry {
  mode: string;
  type: "blob" | "tree";
  hash: string;
  name: string;
}

interface Commit {
  sha: string;
  author: string;
  date: string;
  message: string;
}

interface Pipeline {
  id: number;
  name: string;
  config: string;
  latest_run_status: "pending" | "running" | "success" | "failed" | "cancelled" | null;
  latest_run_id: number | null;
  latest_run_date: string | null;
}

const STATUS_ICONS = {
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  success: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  cancelled: <XCircle className="w-4 h-4 text-muted-foreground" />,
  skipped: <Clock className="w-4 h-4 text-muted-foreground" />,
};

export function Repo() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPath = searchParams.get("path") || "";

  const [repo, setRepo] = useState<Repo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string>("");
  const [tree, setTree] = useState<TreeEntry[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"files" | "commits" | "pipelines" | "secrets">("files");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchRepo();
  }, [id]);

  // Set default tab to pipelines for GitHub repos
  useEffect(() => {
    if (repo?.remote_url && tab !== "pipelines") {
      setTab("pipelines");
    }
  }, [repo?.remote_url]);

  useEffect(() => {
    if (currentBranch && !repo?.remote_url) {
      if (tab === "files") {
        fetchTree();
      } else if (tab === "commits") {
        fetchCommits();
      }
    }
  }, [currentBranch, currentPath, tab, repo?.remote_url]);

  async function fetchRepo() {
    try {
      const repoRes = await fetch(`/api/repos/${id}`);
      if (!repoRes.ok) {
        setLoading(false);
        return;
      }

      const repoData = await repoRes.json();
      setRepo(repoData);

      // For GitHub repos, only fetch pipelines (no local git to browse)
      if (repoData.remote_url) {
        const pipelinesRes = await fetch(`/api/repos/${id}/pipelines`);
        if (pipelinesRes.ok) {
          setPipelines(await pipelinesRes.json());
        }
      } else {
        // For local repos, fetch branches and pipelines
        const [branchesRes, pipelinesRes] = await Promise.all([
          fetch(`/api/repos/${id}/branches`),
          fetch(`/api/repos/${id}/pipelines`),
        ]);

        if (branchesRes.ok) {
          const data = await branchesRes.json();
          setBranches(data.branches);
          setCurrentBranch(data.branches[0] || data.default || "main");
        }

        if (pipelinesRes.ok) {
          setPipelines(await pipelinesRes.json());
        }
      }
    } catch (error) {
      console.error("Failed to fetch repo:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTree() {
    if (!currentBranch) return;

    try {
      const url = currentPath
        ? `/api/repos/${id}/tree/${currentBranch}/${currentPath}`
        : `/api/repos/${id}/tree/${currentBranch}`;
      const res = await fetch(url);
      if (res.ok) {
        setTree(await res.json());
        setFileContent(null);
      }
    } catch (error) {
      console.error("Failed to fetch tree:", error);
    }
  }

  async function fetchCommits() {
    if (!currentBranch) return;

    try {
      const res = await fetch(`/api/repos/${id}/commits/${currentBranch}`);
      if (res.ok) {
        setCommits(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch commits:", error);
    }
  }

  async function fetchFile(path: string) {
    try {
      const res = await fetch(`/api/repos/${id}/file/${currentBranch}/${path}`);
      if (res.ok) {
        const data = await res.json();
        if (data.binary) {
          setFileContent("[Binary file]");
        } else {
          setFileContent(data.content);
        }
      }
    } catch (error) {
      console.error("Failed to fetch file:", error);
    }
  }

  function navigateTo(entry: TreeEntry) {
    const newPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.type === "tree") {
      setSearchParams({ path: newPath });
    } else {
      fetchFile(newPath);
    }
  }

  function navigateUp() {
    const parts = currentPath.split("/");
    parts.pop();
    if (parts.length === 0) {
      setSearchParams({});
    } else {
      setSearchParams({ path: parts.join("/") });
    }
    setFileContent(null);
  }

  function copyCloneUrl() {
    if (!repo) return;
    const url = `http://localhost:3000/git/${repo.path}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Repository not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="mb-6">
        <Link
          to={`/project/${repo.project_id}`}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to project
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          {repo.remote_url ? (
            <Github className="w-8 h-8" />
          ) : (
            <GitBranch className="w-8 h-8" />
          )}
          {repo.name}
        </h1>

        {!repo.remote_url && branches.length > 0 && (
          <Select value={currentBranch} onValueChange={setCurrentBranch}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch} value={branch}>
                  {branch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {repo.remote_url ? (
        <a
          href={repo.remote_url.replace(/\.git$/, "")}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <span>{repo.remote_url}</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mb-6">
          <span>git clone http://localhost:3000/git/{repo.path}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={copyCloneUrl}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {!repo.remote_url && (
          <>
            <Button
              variant={tab === "files" ? "default" : "outline"}
              onClick={() => setTab("files")}
            >
              <File className="w-4 h-4 mr-2" />
              Files
            </Button>
            <Button
              variant={tab === "commits" ? "default" : "outline"}
              onClick={() => setTab("commits")}
            >
              <GitCommit className="w-4 h-4 mr-2" />
              Commits
            </Button>
          </>
        )}
        <Button
          variant={tab === "pipelines" ? "default" : "outline"}
          onClick={() => setTab("pipelines")}
        >
          <Play className="w-4 h-4 mr-2" />
          Pipelines
        </Button>
        <Button
          variant={tab === "secrets" ? "default" : "outline"}
          onClick={() => setTab("secrets")}
        >
          <Key className="w-4 h-4 mr-2" />
          Secrets
        </Button>
        {repo.remote_url && (
          <a
            href={repo.remote_url.replace(/\.git$/, "")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline">
              <Github className="w-4 h-4 mr-2" />
              View on GitHub
              <ExternalLink className="w-3 h-3 ml-2" />
            </Button>
          </a>
        )}
      </div>

      {tab === "files" && !repo.remote_url && (
        <Card>
          <CardContent className="p-0">
            {branches.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <p>No commits yet. Push some code to get started:</p>
                <pre className="mt-4 text-left bg-muted p-4 rounded text-sm overflow-x-auto">
{`git init
git remote add origin http://localhost:3000/git/${repo.path}
git add .
git commit -m "Initial commit"
git push -u origin main`}
                </pre>
              </div>
            ) : fileContent !== null ? (
              <div>
                <div className="flex items-center gap-2 p-3 border-b bg-muted/50">
                  <Button variant="ghost" size="sm" onClick={navigateUp}>
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <span className="font-mono text-sm">{currentPath}</span>
                </div>
                <pre className="p-4 text-sm overflow-x-auto whitespace-pre-wrap">
                  {fileContent}
                </pre>
              </div>
            ) : (
              <div>
                {currentPath && (
                  <button
                    onClick={navigateUp}
                    className="w-full flex items-center gap-2 p-3 hover:bg-muted border-b"
                  >
                    <ArrowLeft className="w-4 h-4 text-muted-foreground" />
                    <span>..</span>
                  </button>
                )}
                {tree.map((entry) => (
                  <button
                    key={entry.hash}
                    onClick={() => navigateTo(entry)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-muted border-b last:border-0"
                  >
                    {entry.type === "tree" ? (
                      <Folder className="w-4 h-4 text-blue-500" />
                    ) : (
                      <File className="w-4 h-4 text-muted-foreground" />
                    )}
                    <span>{entry.name}</span>
                  </button>
                ))}
                {tree.length === 0 && !currentPath && (
                  <div className="p-8 text-center text-muted-foreground">
                    Empty directory
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "commits" && !repo.remote_url && (
        <Card>
          <CardContent className="p-0">
            {commits.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No commits yet
              </div>
            ) : (
              commits.map((commit) => (
                <div
                  key={commit.sha}
                  className="p-4 border-b last:border-0 hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{commit.message}</p>
                      <p className="text-sm text-muted-foreground">
                        {commit.author} committed {formatRelativeTime(commit.date)}
                      </p>
                    </div>
                    <code className="text-xs text-muted-foreground">
                      {commit.sha.slice(0, 8)}
                    </code>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {tab === "pipelines" && (
        <div className="space-y-4">
          {pipelines.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No pipelines yet</p>
                <p className="text-sm text-muted-foreground">
                  Add a <code>.eifl.json</code> file to your repository to
                  define a pipeline
                </p>
              </CardContent>
            </Card>
          ) : (
            pipelines.map((pipeline) => (
              <Card key={pipeline.id}>
                <CardHeader className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Link
                        to={`/pipeline/${pipeline.id}`}
                        className="font-semibold hover:underline"
                      >
                        {pipeline.name}
                      </Link>
                      {pipeline.latest_run_status && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {STATUS_ICONS[pipeline.latest_run_status]}
                          <span>
                            {pipeline.latest_run_status}
                            {pipeline.latest_run_date && (
                              <span className="ml-1">
                                ({formatRelativeTime(pipeline.latest_run_date)})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    <Link to={`/pipeline/${pipeline.id}`}>
                      <Button size="sm">
                        <Play className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === "secrets" && (
        <div>
          <SecretsManager
            scope="repo"
            scopeId={parseInt(id!)}
            title="Repository Secrets"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Repository secrets override project secrets with the same name.
          </p>
        </div>
      )}
    </div>
  );
}
