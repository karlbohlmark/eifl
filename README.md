# EIFL

A lightweight, self-hosted Git + CI platform built with Bun. Designed for performance and simplicity, with a focus on Zig builds.

## Features

- **Git hosting** - Push/pull via HTTP smart protocol
- **GitHub integration** - Use GitHub for source control, EIFL for CI
- **Pipeline execution** - Define pipelines in `.eifl.json`
- **Automatic triggers** - Pipelines run on push
- **Manual triggers** - Run pipelines on demand
- **Build runners** - Distributed execution on separate machines
- **Custom metrics** - Track build time, binary sizes, test counts
- **Repository browser** - View files, commits, branches
- **Live logs** - Stream build output in real-time

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Start the server

```bash
bun run dev
```

Server runs at `http://localhost:3000` (accessible on all network interfaces).

### 3. Create a project and repository

```bash
# Create project
curl -X POST http://localhost:3000/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"my-project"}'

# Create repository
curl -X POST http://localhost:3000/api/projects/1/repos \
  -H "Content-Type: application/json" \
  -d '{"name":"my-app"}'
```

### 4. Push code

```bash
cd your-project
git remote add eifl http://localhost:3000/git/my-project/my-app.git
git push -u eifl main
```

### 5. Set up a runner

```bash
# Create runner (save the token!)
curl -X POST http://localhost:3000/api/runners \
  -H "Content-Type: application/json" \
  -d '{"name":"local-runner"}'

# Start runner
EIFL_SERVER_URL=http://localhost:3000 \
EIFL_RUNNER_TOKEN=<token> \
bun run runner
```

## GitHub Integration

You can use GitHub for source control and pull requests while using EIFL for CI.
See [docs/GITHUB_INTEGRATION.md](docs/GITHUB_INTEGRATION.md) for setup instructions.

## Pipeline Configuration

Create `.eifl.json` in your repository:

```json
{
  "name": "build",
  "triggers": {
    "push": { "branches": ["main"] },
    "manual": true
  },
  "steps": [
    { "name": "test", "run": "zig build test" },
    {
      "name": "build",
      "run": "zig build -Drelease",
      "capture_sizes": ["zig-out/bin/*"]
    }
  ]
}
```

### Custom Metrics

Emit metrics from your build steps:

```bash
echo "::metric::test_count=42"
echo "::metric::memory_mb=256:mb"
```

## Configuration

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | - | Set to `production` for prod mode |
| `GITHUB_WEBHOOK_SECRET` | - | Secret for GitHub webhook verification |
| `GITHUB_TOKEN` | - | PAT for private repo access |

### Runner

| Variable | Default | Description |
|----------|---------|-------------|
| `EIFL_SERVER_URL` | `http://localhost:3000` | Server URL |
| `EIFL_RUNNER_TOKEN` | - | Runner authentication token |
| `EIFL_POLL_INTERVAL` | `5000` | Job poll interval (ms) |

## Scripts

```bash
bun run dev      # Start dev server with HMR
bun run start    # Start production server
bun run runner   # Start build runner
bun run build    # Build for production
```

## Project Structure

```
eifl/
├── src/
│   ├── index.ts           # Server entry point
│   ├── api/               # API route handlers
│   ├── db/                # SQLite database (bun:sqlite)
│   ├── git/               # Git HTTP protocol & browsing
│   ├── pipeline/          # Pipeline parsing & scheduling
│   └── pages/             # React frontend pages
├── runner/                # Build runner
│   ├── main.ts            # Runner entry point
│   ├── executor.ts        # Step execution
│   └── metrics.ts         # Metric collection
└── data/                  # Runtime data (gitignored)
    ├── eifl.db            # SQLite database
    └── repos/             # Bare Git repositories
```

## API Documentation

See [docs/API.md](docs/API.md) for the complete API reference.

## License

MIT
