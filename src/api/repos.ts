import {
  createProject,
  getProjects,
  getProject,
  getProjectByName,
  deleteProject,
  createRepo,
  getRepos,
  getRepo,
  deleteRepo,
} from "../db/queries";
import { initBareRepo, deleteRepoFiles, listBranches } from "../git/http";
import { listTree, getFileContent, getCommits, getCommit, getCommitDiff } from "../git/browse";

// Projects
export async function handleCreateProject(req: Request): Promise<Response> {
  const body = await req.json() as { name: string; description?: string };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  // Check if project already exists
  const existing = getProjectByName(body.name);
  if (existing) {
    return Response.json({ error: "Project already exists" }, { status: 409 });
  }

  const project = createProject(body.name, body.description);
  return Response.json(project, { status: 201 });
}

export function handleGetProjects(): Response {
  const projects = getProjects();
  return Response.json(projects);
}

export function handleGetProject(id: number): Response {
  const project = getProject(id);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return Response.json(project);
}

export function handleDeleteProject(id: number): Response {
  const success = deleteProject(id);
  if (!success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

// Repos
export async function handleCreateRepo(projectId: number, req: Request): Promise<Response> {
  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const body = await req.json() as { name: string };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Name is required" }, { status: 400 });
  }

  // Sanitize repo name
  const repoName = body.name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const repoPath = `${project.name}/${repoName}.git`;

  try {
    await initBareRepo(repoPath);
    const repo = createRepo(projectId, repoName, repoPath);
    return Response.json(repo, { status: 201 });
  } catch (error) {
    return Response.json({ error: "Failed to create repository" }, { status: 500 });
  }
}

export function handleGetRepos(projectId: number): Response {
  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const repos = getRepos(projectId);
  return Response.json(repos);
}

export function handleGetRepo(id: number): Response {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json(repo);
}

export async function handleDeleteRepo(id: number): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  await deleteRepoFiles(repo.path);
  deleteRepo(id);
  return new Response(null, { status: 204 });
}

// Repo browsing
export async function handleGetBranches(id: number): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const branches = await listBranches(repo.path);
  return Response.json({ branches, default: repo.default_branch });
}

export async function handleGetTree(id: number, ref: string, path: string): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const entries = await listTree(repo.path, ref, path);
  return Response.json(entries);
}

export async function handleGetFile(id: number, ref: string, path: string): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const content = await getFileContent(repo.path, ref, path);
  if (!content) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json(content);
}

export async function handleGetCommits(
  id: number,
  ref: string,
  limit: number
): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const commits = await getCommits(repo.path, ref, limit);
  return Response.json(commits);
}

export async function handleGetCommit(id: number, sha: string): Promise<Response> {
  const repo = getRepo(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const commit = await getCommit(repo.path, sha);
  if (!commit) {
    return Response.json({ error: "Commit not found" }, { status: 404 });
  }

  const diff = await getCommitDiff(repo.path, sha);
  return Response.json({ ...commit, diff });
}
