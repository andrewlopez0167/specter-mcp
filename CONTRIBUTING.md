# Contributing to Specter MCP

Thank you for your interest in contributing to Specter MCP! This document provides guidelines and information for contributors.

## Development Setup

### Prerequisites

- Node.js 20+
- Android SDK with `adb` in PATH
- Xcode Command Line Tools (macOS)
- Maestro CLI (optional, for E2E testing)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/anthropics/specter-mcp.git
cd specter-mcp

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Project Structure

```
src/
├── index.ts              # MCP server entry point
├── config.ts             # Environment configuration
├── models/               # Type definitions, errors, constants
├── platforms/            # Platform-specific implementations
│   ├── android/          # ADB, Gradle, logcat, prefs
│   └── ios/              # simctl, xcodebuild, oslog, crash
├── queue/                # Request queue and executor
├── routing/              # Model routing dispatcher
├── tools/                # MCP tool implementations
│   ├── build/            # build_app, install_app, launch_app
│   ├── crash/            # analyze_crash
│   ├── environment/      # list_devices, manage_env, clean_project
│   ├── navigation/       # deep_link_navigate
│   ├── observability/    # inspect_logs, inspect_app_state
│   ├── testing/          # run_unit_tests, run_maestro_flow, run_linter
│   └── ui/               # get_ui_context, interact_with_ui
└── utils/                # Shell execution, image processing, XML parsing
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Prefer explicit types over `any`
- Use interfaces for public APIs
- Document exported functions with JSDoc

### Testing

- Write unit tests for new functionality
- Use dependency injection for shell commands (see `ShellExecutor` pattern)
- Mock external dependencies in tests
- Aim for >70% coverage on new code

```typescript
// Example: Using ShellExecutor for testability
export async function myFunction(
  options: MyOptions,
  shell: ShellExecutor = defaultShellExecutor
): Promise<Result> {
  const result = await shell.execute('command', args);
  // ...
}
```

### Code Style

- Run `npm run lint` before committing
- Run `npm run typecheck` to verify types
- Use meaningful variable names
- Keep functions focused and small

## Pull Request Process

1. **Fork** the repository
2. **Create a branch** from `main`: `git checkout -b feature/my-feature`
3. **Make your changes** with tests
4. **Run checks**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
5. **Commit** with a clear message
6. **Push** and create a Pull Request

### Commit Messages

Use conventional commit format:

```
feat: add new tool for X
fix: resolve issue with Y
docs: update API documentation
test: add tests for Z
refactor: simplify error handling
```

## Adding a New Tool

1. Create tool implementation in `src/tools/<category>/`
2. Define input/output schemas in the tool file
3. Register in `src/tools/register.ts`
4. Add unit tests in `tests/unit/tools/`
5. Document in `docs/API.md`

Example tool structure:

```typescript
// src/tools/example/my-tool.ts
import { z } from 'zod';

export const myToolSchema = z.object({
  platform: z.enum(['android', 'ios']),
  // ...
});

export type MyToolInput = z.infer<typeof myToolSchema>;

export async function myTool(input: MyToolInput): Promise<MyToolResult> {
  // Implementation
}
```

## Reporting Issues

When reporting bugs, please include:

- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs or error messages

## Questions?

Open a GitHub Discussion or Issue for questions about contributing.
