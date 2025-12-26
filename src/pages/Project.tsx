import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, GitBranch, ArrowLeft } from "lucide-react";

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
  created_at: string;
}

export function Project() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [newRepoName, setNewRepoName] = useState("");
  const [showNewRepo, setShowNewRepo] = useState(false);
  const [loading, setLoading] = useState(true);

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
        setShowNewRepo(false);
        fetchProject();
      }
    } catch (error) {
      console.error("Failed to create repo:", error);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <p className="text-muted-foreground">Loading...</p>
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

      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">{project.name}</h1>
        <Button onClick={() => setShowNewRepo(!showNewRepo)}>
          <Plus className="w-4 h-4 mr-2" />
          New Repository
        </Button>
      </div>

      {showNewRepo && (
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
              <Button variant="outline" onClick={() => setShowNewRepo(false)}>
                Cancel
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Clone URL: <code>http://localhost:3000/git/{project.name}/[repo-name].git</code>
            </p>
          </CardContent>
        </Card>
      )}

      {repos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No repositories yet</p>
            <Button onClick={() => setShowNewRepo(true)}>
              Create your first repository
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {repos.map((repo) => (
            <Card key={repo.id}>
              <CardHeader className="py-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-muted-foreground" />
                  <Link to={`/repo/${repo.id}`} className="hover:underline">
                    {repo.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground font-mono">
                  git clone http://localhost:3000/git/{repo.path}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
