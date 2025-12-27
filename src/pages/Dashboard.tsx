import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, GitBranch, Play, CheckCircle, XCircle, Clock } from "lucide-react";

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

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [repos, setRepos] = useState<Record<number, Repo[]>>({});
  const [newProjectName, setNewProjectName] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data);

      // Fetch repos for each project
      const reposMap: Record<number, Repo[]> = {};
      for (const project of data) {
        const reposRes = await fetch(`/api/projects/${project.id}/repos`);
        reposMap[project.id] = await reposRes.json();
      }
      setRepos(reposMap);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createProject() {
    if (!newProjectName.trim()) return;

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName }),
      });

      if (res.ok) {
        setNewProjectName("");
        setShowNewProject(false);
        fetchProjects();
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Button onClick={() => setShowNewProject(!showNewProject)}>
          <Plus className="w-4 h-4 mr-2" />
          New Project
        </Button>
      </div>

      {showNewProject && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <Input
                placeholder="Project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createProject()}
              />
              <Button onClick={createProject}>Create</Button>
              <Button variant="outline" onClick={() => setShowNewProject(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <Button onClick={() => setShowNewProject(true)}>
              Create your first project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link
                    to={`/project/${project.id}`}
                    className="hover:underline"
                  >
                    {project.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {repos[project.id]?.length > 0 ? (
                  <div className="space-y-2">
                    {repos[project.id].map((repo) => (
                      <Link
                        key={repo.id}
                        to={`/repo/${repo.id}`}
                        className="flex items-center gap-2 p-2 rounded hover:bg-muted"
                      >
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <span>{repo.name}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No repositories yet
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
