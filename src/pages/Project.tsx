import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, ArrowLeft, Copy, Check, Github } from "lucide-react";
import { GitHubRepoForm } from "@/components/GitHubRepoForm";
import { SecretsManager } from "@/components/SecretsManager";

interface Project {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

interface Repo {
  id: number;
  project_id: number;
  name: string;
  path: string;
  remote_url: string | null;
  created_at: string;
}

export function Project() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [formMode, setFormMode] = useState<"none" | "local" | "github">("none");
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
  }, [id]);

  async function fetchProject() {
    try {
      const [projectRes, reposRes] = await Promise.all([
        fetch(`/api/projects/${id}`),
        fetch(`/api/projects/${id}/repos`),
      ]);

      if (projectRes.ok) {
        setProject(await projectRes.json());
      }
      if (reposRes.ok) {
        setRepos(await reposRes.json());
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createRepo() {
    if (!newRepoName.trim()) return;

    try {
      const res = await fetch(`/api/projects/${id}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newRepoName }),
      });

      if (res.ok) {
        setNewRepoName("");
        setFormMode("none");
        fetchProject();
      }
    } catch (error) {
      console.error("Failed to create repo:", error);
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="mb-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex items-center gap-4 mb-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32 ml-auto" />
        </div>
        <div className="grid gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="mb-6">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to projects
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <div className="flex gap-2 ml-auto">
          <Button onClick={() => setFormMode(formMode === "local" ? "none" : "local")}>
            <Plus className="w-4 h-4 mr-2" />
            New Repository
          </Button>
          <Button variant="outline" onClick={() => setFormMode(formMode === "github" ? "none" : "github")}>
            <Github className="w-4 h-4 mr-2" />
            Connect GitHub
          </Button>
        </div>
      </div>

      {formMode === "github" && (
        <GitHubRepoForm
          projectId={parseInt(id!)}
          onSuccess={() => {
            setFormMode("none");
            fetchProject();
          }}
          onCancel={() => setFormMode("none")}
        />
      )}

      {formMode === "local" && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Input
                placeholder="Repository name"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createRepo()}
              />
              <Button onClick={createRepo}>Create</Button>
              <Button variant="outline" onClick={() => setFormMode("none")}>
                Cancel
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-sm text-muted-foreground">
                Clone URL: <code>http://localhost:3000/git/{project.name}/[repo-name].git</code>
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyToClipboard(`http://localhost:3000/git/${project.name}/[repo-name].git`, 'new-repo-template')}
              >
                {copiedId === 'new-repo-template' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {repos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No repositories yet</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => setFormMode("local")}>
                Create your first repository
              </Button>
              <Button variant="outline" onClick={() => setFormMode("github")}>
                <Github className="w-4 h-4 mr-2" />
                Connect GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {repos.map((repo) => (
            <Card key={repo.id}>
              <CardHeader className="py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  {repo.remote_url ? (
                    <Github className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <GitBranch className="w-5 h-5 text-muted-foreground" />
                  )}
                  <Link to={`/repo/${repo.id}`} className="hover:underline">
                    {repo.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {repo.remote_url ? (
                  <a
                    href={repo.remote_url.replace(/\.git$/, "")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {repo.remote_url}
                  </a>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-muted-foreground font-mono">
                      git clone http://localhost:3000/git/{repo.path}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(`http://localhost:3000/git/${repo.path}`, `repo-${repo.id}`)}
                    >
                      {copiedId === `repo-${repo.id}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <SecretsManager
          scope="project"
          scopeId={parseInt(id!)}
          title="Project Secrets"
        />
        <p className="text-sm text-muted-foreground mt-2">
          Project secrets are available to all repositories in this project.
        </p>
      </div>
    </div>
  );
}
