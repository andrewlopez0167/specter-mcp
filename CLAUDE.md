# CLAUDE.md - Project Instructions for Claude

## Communication Style

**ALWAYS use the `AskUserQuestion` tool when presenting questions or options to the user.** Do not ask questions inline in text responses. The AskUserQuestion tool provides a better UX with structured options.

## Project Context

**Specter MCP** is a KMM (Kotlin Multiplatform Mobile) Diagnostic & Execution Engine that acts as "hands and eyes" for AI agents working with mobile projects.

### Tech Stack
- TypeScript 5.x (Node.js 20+)
- @modelcontextprotocol/sdk
- sharp (image processing)
- xml2js (UI hierarchy parsing)

### Architecture
- **Primary Agent + Specialized Worker** model
- Primary agent (Claude Sonnet) handles high-level reasoning
- Worker models handle specific tasks:
  - Log analysis → Claude Haiku
  - Vision/UI analysis → Vision-capable model
  - Code reasoning → Primary model

### Tool Domains
1. **Environment & Build**: Device management, cache cleaning, builds
2. **Testing & QA**: Unit tests, Maestro E2E, linting
3. **UI & Observability**: Screenshots, UI hierarchy, interactions, logs, deep links, app state
4. **iOS Crash Diagnostics**: Crash log parsing, symbolication, pattern detection
5. **Model Routing**: Task dispatching to specialized AI models
6. **Concurrency & Error Handling**: Sequential queue, device discovery, timeouts

## Design Decisions

### Access & Security
- No authentication required - Claude AI or users call directly on trusted local machine

### Concurrency
- Queue requests and execute sequentially to prevent resource conflicts (no parallel tool execution)

### Error Handling
- When a requested device/emulator doesn't exist: Return error plus list of available devices for agent to choose
- If configured worker model (e.g., Claude Haiku) is unavailable: Fallback to primary model, accept higher cost

### Timeouts
- Maximum build timeout: 30 minutes (accommodates complex projects with many dependencies)

### iOS Debugging
- **Crash log analysis**: Parse .crash/.ips files, symbolicate with dSYM, detect crash patterns
- **Xcode Instruments**: Out of scope - focus on functional debugging, not performance profiling

## Release Workflow

### Auto-release (recommended)
1. Push commits with conventional prefixes (`feat:`, `fix:`, `chore:`)
2. release-please will create a PR with version bump
3. Merge the PR to create release and auto-publish to npm

### Conventional Commit Prefixes
- `feat:` - New feature (bumps minor version)
- `fix:` - Bug fix (bumps patch version)
- `chore:` - Maintenance tasks (no version bump)
- `docs:` - Documentation changes
- `test:` - Test changes
- `ci:` - CI/CD changes

### npm Trusted Publishing (OIDC)

This repo uses npm Trusted Publishing - no `NPM_TOKEN` secret needed. Authentication happens via OIDC between GitHub Actions and npm.

**One-time setup on npmjs.com:**
1. Go to https://www.npmjs.com/package/specter-mcp/access
2. Under "Publishing access", click "Add new configuration"
3. Configure the GitHub Actions environment:
   - Repository: `abd3lraouf/specter-mcp`
   - Workflow: `release.yml` (or `publish.yml`)
   - Environment: leave empty (or use `production` if configured)
4. Save the configuration

**How it works:**
- GitHub Actions requests an OIDC token from GitHub
- npm verifies the token matches the configured repository/workflow
- Publish succeeds without any stored secrets
- All packages get automatic provenance attestation
