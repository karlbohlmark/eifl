# EIFL API Documentation

Base URL: `http://<host>:3000/api`

## Projects

### List Projects
```
GET /projects
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "my-project",
    "description": "Optional description",
    "created_at": "2025-01-01 12:00:00"
  }
]
```

### Create Project
```
POST /projects
Content-Type: application/json

{
  "name": "my-project",
  "description": "Optional description"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "my-project",
  "description": "Optional description",
  "created_at": "2025-01-01 12:00:00"
}
```

### Get Project
```
GET /projects/:id
```

### Delete Project
```
DELETE /projects/:id
```

**Response:** `204 No Content`

---

## Repositories

### List Repositories
```
GET /projects/:projectId/repos
```

**Response:**
```json
[
  {
    "id": 1,
    "project_id": 1,
    "name": "my-app",
    "path": "my-project/my-app.git",
    "default_branch": "main",
    "created_at": "2025-01-01 12:00:00"
  }
]
```

### Create Repository
```
POST /projects/:projectId/repos
Content-Type: application/json

{
  "name": "my-app"
}
```

**Response:** `201 Created`

Creates a bare Git repository at `data/repos/<project>/<repo>.git`

### Get Repository
```
GET /repos/:id
```

### Delete Repository
```
DELETE /repos/:id
```

**Response:** `204 No Content`

### List Branches
```
GET /repos/:id/branches
```

**Response:**
```json
{
  "branches": ["main", "develop", "feature-x"],
  "default": "main"
}
```

### Browse Files (Tree)
```
GET /repos/:id/tree/:ref
GET /repos/:id/tree/:ref/:path
```

**Parameters:**
- `ref` - Branch name or commit SHA
- `path` - Optional subdirectory path

**Response:**
```json
[
  { "mode": "040000", "type": "tree", "hash": "abc123", "name": "src" },
  { "mode": "100644", "type": "blob", "hash": "def456", "name": "README.md" }
]
```

### Get File Content
```
GET /repos/:id/file/:ref/:path
```

**Response:**
```json
{
  "content": "file contents here",
  "size": 1234,
  "binary": false
}
```

### List Commits
```
GET /repos/:id/commits/:ref?limit=50
```

**Response:**
```json
[
  {
    "sha": "abc123def456...",
    "author": "John Doe",
    "authorEmail": "john@example.com",
    "date": "2025-01-01T12:00:00Z",
    "message": "Initial commit"
  }
]
```

### Get Commit Details
```
GET /repos/:id/commit/:sha
```

**Response:**
```json
{
  "sha": "abc123def456...",
  "author": "John Doe",
  "authorEmail": "john@example.com",
  "date": "2025-01-01T12:00:00Z",
  "message": "Full commit message",
  "diff": "diff --git a/file.txt..."
}
```

---

## Pipelines

### List Pipelines
```
GET /repos/:repoId/pipelines
```

**Response:**
```json
[
  {
    "id": 1,
    "repo_id": 1,
    "name": "build",
    "config": "{...}",
    "created_at": "2025-01-01 12:00:00"
  }
]
```

### Create/Update Pipeline
```
POST /repos/:repoId/pipelines
Content-Type: application/json

{
  "name": "build",
  "triggers": {
    "push": { "branches": ["main"] },
    "manual": true
  },
  "steps": [
    { "name": "test", "run": "zig build test" },
    { "name": "build", "run": "zig build -Drelease" }
  ]
}
```

**Response:** `201 Created`

### Get Pipeline
```
GET /pipelines/:id
```

### Delete Pipeline
```
DELETE /pipelines/:id
```

### Trigger Pipeline
```
POST /pipelines/:id/trigger
Content-Type: application/json

{
  "branch": "main",
  "commit": "abc123..."
}
```

Both fields are optional. Defaults to the repo's default branch and latest commit.

**Response:** `201 Created`
```json
{
  "id": 1,
  "pipeline_id": 1,
  "status": "pending",
  "commit_sha": "abc123...",
  "branch": "main",
  "triggered_by": "manual",
  "created_at": "2025-01-01 12:00:00"
}
```

### Get Metric History
```
GET /pipelines/:id/metrics/:key?limit=100
```

**Response:**
```json
[
  { "run_id": 5, "value": 1234, "created_at": "2025-01-01 12:00:00", "commit_sha": "abc123" },
  { "run_id": 4, "value": 1200, "created_at": "2025-01-01 11:00:00", "commit_sha": "def456" }
]
```

---

## Runs

### List Runs
```
GET /pipelines/:pipelineId/runs?limit=50
```

**Response:**
```json
[
  {
    "id": 1,
    "pipeline_id": 1,
    "status": "success",
    "commit_sha": "abc123...",
    "branch": "main",
    "triggered_by": "push",
    "started_at": "2025-01-01 12:00:00",
    "finished_at": "2025-01-01 12:01:00",
    "created_at": "2025-01-01 12:00:00"
  }
]
```

**Status values:** `pending`, `running`, `success`, `failed`, `cancelled`

### Get Run Details
```
GET /runs/:id
```

**Response:**
```json
{
  "id": 1,
  "pipeline_id": 1,
  "status": "success",
  "commit_sha": "abc123...",
  "branch": "main",
  "triggered_by": "push",
  "started_at": "2025-01-01 12:00:00",
  "finished_at": "2025-01-01 12:01:00",
  "created_at": "2025-01-01 12:00:00",
  "steps": [
    {
      "id": 1,
      "name": "test",
      "status": "success",
      "exit_code": 0,
      "output": "Running tests...\n5 passed",
      "started_at": "2025-01-01 12:00:00",
      "finished_at": "2025-01-01 12:00:30"
    }
  ],
  "metrics": [
    { "key": "total_duration_ms", "value": 15000, "unit": "ms" },
    { "key": "tests.passed", "value": 5, "unit": null }
  ],
  "pipeline": { ... }
}
```

### Cancel Run
```
POST /runs/:id/cancel
```

**Response:**
```json
{ "success": true }
```

---

## Runners

### List Runners
```
GET /runners
```

**Response:**
```json
[
  {
    "id": 1,
    "name": "local-runner",
    "status": "online",
    "last_seen": "2025-01-01 12:00:00",
    "created_at": "2025-01-01 10:00:00"
  }
]
```

Note: Token is not included in list response.

### Create Runner
```
POST /runners
Content-Type: application/json

{
  "name": "my-runner"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "my-runner",
  "token": "uuid-token-here",
  "status": "offline",
  "last_seen": null,
  "created_at": "2025-01-01 12:00:00"
}
```

**Important:** Save the token - it's only shown once and is required to start the runner.

### Delete Runner
```
DELETE /runners/:id
```

---

## Runner API (Authenticated)

These endpoints require the `Authorization: Bearer <token>` header.

### Poll for Job
```
GET /runner/poll
Authorization: Bearer <runner-token>
```

**Response (no job):**
```json
{ "job": null }
```

**Response (job available):**
```json
{
  "job": {
    "run": { ... },
    "steps": [ ... ],
    "repoUrl": "/git/project/repo.git",
    "commitSha": "abc123...",
    "branch": "main",
    "pipelineConfig": { ... }
  }
}
```

### Report Step Update
```
POST /runner/step
Authorization: Bearer <runner-token>
Content-Type: application/json

{
  "stepId": 1,
  "status": "running|success|failed|skipped",
  "exitCode": 0,
  "output": "Step output..."
}
```

### Append Step Output
```
POST /runner/output
Authorization: Bearer <runner-token>
Content-Type: application/json

{
  "stepId": 1,
  "output": "Additional output..."
}
```

### Report Run Complete
```
POST /runner/complete
Authorization: Bearer <runner-token>
Content-Type: application/json

{
  "runId": 1,
  "status": "success|failed",
  "metrics": [
    { "key": "total_duration_ms", "value": 15000, "unit": "ms" },
    { "key": "binary_size", "value": 1048576, "unit": "bytes" }
  ]
}
```

### Heartbeat
```
POST /runner/heartbeat
Authorization: Bearer <runner-token>
```

---

## Git HTTP Protocol

Git operations use the smart HTTP protocol at `/git/<path>`.

### Clone/Fetch
```bash
git clone http://<host>:3000/git/<project>/<repo>.git
```

### Push
```bash
git push origin main
```

Pushing triggers pipeline execution if `.eifl.json` exists in the repository.

---

## Pipeline Configuration

Create `.eifl.json` in your repository root:

```json
{
  "name": "build",
  "triggers": {
    "push": {
      "branches": ["main", "develop"]
    },
    "manual": true
  },
  "steps": [
    {
      "name": "test",
      "run": "zig build test"
    },
    {
      "name": "build",
      "run": "zig build -Drelease",
      "capture_sizes": ["zig-out/bin/*"]
    }
  ]
}
```

### Custom Metrics

Emit custom metrics from your pipeline steps:

```bash
echo "::metric::test_count=42"
echo "::metric::memory_mb=256:mb"
```

Format: `::metric::<key>=<value>[:<unit>]`
