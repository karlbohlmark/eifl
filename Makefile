.PHONY: all build-runner clean dev start runner lint

all: build-runner

# Build single executable runner
build-runner:
	bun build --compile runner/main.ts --outfile dist/runner

# Development server with hot reload
dev:
	bun --hot src/index.ts

# Production server
start:
	NODE_ENV=production bun src/index.ts

# Run runner in development mode
runner:
	bun runner/main.ts

# Lint
lint:
	bun run lint

# Clean build artifacts
clean:
	rm -rf dist
