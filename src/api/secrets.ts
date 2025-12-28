import {
  getSecrets,
  upsertSecret,
  deleteSecret,
  getProject,
  getRepo,
} from "../db/queries";
import type { SecretScope } from "../db/schema";
import {
  encryptSecret,
  isEncryptionConfigured,
  EncryptionError,
} from "../lib/crypto";

// Response type for listing secrets (never expose values)
interface SecretListItem {
  name: string;
  updatedAt: string;
  scope: SecretScope;
}

function formatSecretsForResponse(
  secrets: Array<{ name: string; updated_at: string; scope: SecretScope }>
): SecretListItem[] {
  return secrets.map((s) => ({
    name: s.name,
    updatedAt: s.updated_at,
    scope: s.scope,
  }));
}

// Project secrets
export async function handleGetProjectSecrets(projectId: number): Promise<Response> {
  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const secrets = getSecrets("project", projectId);
  return Response.json(formatSecretsForResponse(secrets));
}

export async function handleCreateProjectSecret(
  projectId: number,
  req: Request
): Promise<Response> {
  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  if (!isEncryptionConfigured()) {
    return Response.json(
      { error: "Secret management is not configured. Set EIFL_ENCRYPTION_KEY environment variable." },
      { status: 503 }
    );
  }

  const body = (await req.json()) as { name: string; value: string };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Secret name is required" }, { status: 400 });
  }

  if (!body.value || typeof body.value !== "string") {
    return Response.json({ error: "Secret value is required" }, { status: 400 });
  }

  // Validate secret name (environment variable format)
  if (!/^[A-Z][A-Z0-9_]*$/.test(body.name)) {
    return Response.json(
      { error: "Secret name must be uppercase with underscores (e.g., DATABASE_URL)" },
      { status: 400 }
    );
  }

  try {
    const { encrypted, iv } = await encryptSecret(body.value);
    const secret = upsertSecret("project", projectId, body.name, encrypted, iv);

    return Response.json(
      { name: secret.name, updatedAt: secret.updated_at, scope: secret.scope },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof EncryptionError) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}

export async function handleDeleteProjectSecret(
  projectId: number,
  name: string
): Promise<Response> {
  const project = getProject(projectId);
  if (!project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const deleted = deleteSecret("project", projectId, name);
  if (!deleted) {
    return Response.json({ error: "Secret not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}

// Repo secrets
export async function handleGetRepoSecrets(repoId: number): Promise<Response> {
  const repo = getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const secrets = getSecrets("repo", repoId);
  return Response.json(formatSecretsForResponse(secrets));
}

export async function handleCreateRepoSecret(
  repoId: number,
  req: Request
): Promise<Response> {
  const repo = getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  if (!isEncryptionConfigured()) {
    return Response.json(
      { error: "Secret management is not configured. Set EIFL_ENCRYPTION_KEY environment variable." },
      { status: 503 }
    );
  }

  const body = (await req.json()) as { name: string; value: string };

  if (!body.name || typeof body.name !== "string") {
    return Response.json({ error: "Secret name is required" }, { status: 400 });
  }

  if (!body.value || typeof body.value !== "string") {
    return Response.json({ error: "Secret value is required" }, { status: 400 });
  }

  // Validate secret name (environment variable format)
  if (!/^[A-Z][A-Z0-9_]*$/.test(body.name)) {
    return Response.json(
      { error: "Secret name must be uppercase with underscores (e.g., DATABASE_URL)" },
      { status: 400 }
    );
  }

  try {
    const { encrypted, iv } = await encryptSecret(body.value);
    const secret = upsertSecret("repo", repoId, body.name, encrypted, iv);

    return Response.json(
      { name: secret.name, updatedAt: secret.updated_at, scope: secret.scope },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof EncryptionError) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    throw error;
  }
}

export async function handleDeleteRepoSecret(
  repoId: number,
  name: string
): Promise<Response> {
  const repo = getRepo(repoId);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  const deleted = deleteSecret("repo", repoId, name);
  if (!deleted) {
    return Response.json({ error: "Secret not found" }, { status: 404 });
  }

  return new Response(null, { status: 204 });
}
