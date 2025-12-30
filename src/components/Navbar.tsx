import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronRight, Home, FolderKanban, Server, BookOpen } from "lucide-react";

interface Project {
  id: number;
  name: string;
}

interface Repo {
  id: number;
  project_id: number;
  name: string;
}

interface Pipeline {
  id: number;
  repo_id: number;
  name: string;
}

interface BreadcrumbData {
  project?: Project;
  repo?: Repo;
  pipeline?: Pipeline;
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [breadcrumbData, setBreadcrumbData] = useState<BreadcrumbData>({});
  const [loading, setLoading] = useState(true);

  // Parse current route
  const pathParts = location.pathname.split("/").filter(Boolean);
  const currentPage = pathParts[0] || "dashboard";
  const currentId = pathParts[1] ? parseInt(pathParts[1]) : null;

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    fetchBreadcrumbData();
  }, [location.pathname]);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        setProjects(await res.json());
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchBreadcrumbData() {
    const data: BreadcrumbData = {};

    try {
      if (currentPage === "project" && currentId) {
        const res = await fetch(`/api/projects/${currentId}`);
        if (res.ok) data.project = await res.json();
      } else if (currentPage === "repo" && currentId) {
        const repoRes = await fetch(`/api/repos/${currentId}`);
        if (repoRes.ok) {
          const repo: Repo = await repoRes.json();
          data.repo = repo;
          const projectRes = await fetch(`/api/projects/${repo.project_id}`);
          if (projectRes.ok) data.project = await projectRes.json();
        }
      } else if (currentPage === "pipeline" && currentId) {
        const pipelineRes = await fetch(`/api/pipelines/${currentId}`);
        if (pipelineRes.ok) {
          const pipeline: Pipeline = await pipelineRes.json();
          data.pipeline = pipeline;
          const repoRes = await fetch(`/api/repos/${pipeline.repo_id}`);
          if (repoRes.ok) {
            const repo: Repo = await repoRes.json();
            data.repo = repo;
            const projectRes = await fetch(`/api/projects/${repo.project_id}`);
            if (projectRes.ok) data.project = await projectRes.json();
          }
        }
      }
    } catch (error) {
      console.error("Failed to fetch breadcrumb data:", error);
    }

    setBreadcrumbData(data);
  }

  function handleProjectChange(projectId: string) {
    navigate(`/project/${projectId}`);
  }

  const currentProjectId = breadcrumbData.project?.id?.toString();

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="px-8 h-14 flex items-center justify-between">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm">
          <Link
            to="/"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Home className="w-4 h-4" />
            <span className="hidden sm:inline">Projects</span>
          </Link>

          {breadcrumbData.project && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <Link
                to={`/project/${breadcrumbData.project.id}`}
                className={`hover:text-foreground transition-colors ${
                  currentPage === "project" && !breadcrumbData.repo
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {breadcrumbData.project.name}
              </Link>
            </>
          )}

          {breadcrumbData.repo && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <Link
                to={`/repo/${breadcrumbData.repo.id}`}
                className={`hover:text-foreground transition-colors ${
                  currentPage === "repo"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {breadcrumbData.repo.name}
              </Link>
            </>
          )}

          {breadcrumbData.pipeline && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground font-medium">
                {breadcrumbData.pipeline.name}
              </span>
            </>
          )}
        </div>

        {/* Quick Project Switcher and Navigation Links */}
        <div className="flex items-center gap-4">
          <Link
            to="/docs"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Docs</span>
          </Link>
          <Link
            to="/runners"
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Server className="w-4 h-4" />
            <span className="hidden sm:inline">Runners</span>
          </Link>
          <div className="flex items-center gap-2">
            <FolderKanban className="w-4 h-4 text-muted-foreground" />
            <Select
              value={currentProjectId || ""}
              onValueChange={handleProjectChange}
            >
              <SelectTrigger className="w-[180px]" size="sm">
                <SelectValue placeholder="Switch project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id.toString()}>
                    {project.name}
                  </SelectItem>
                ))}
                {projects.length === 0 && !loading && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No projects
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </nav>
  );
}
