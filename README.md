<p align="center">
  <img src="logo.png" alt="Specter MCP Logo" width="400">
</p>

<h1 align="center">Specter MCP</h1>

<p align="center">
  <strong>KMM Diagnostic & Execution Engine</strong><br>
  An MCP server providing "hands and eyes" for AI agents working with Kotlin Multiplatform Mobile projects.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/specter-mcp"><img src="https://img.shields.io/npm/v/specter-mcp.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/specter-mcp"><img src="https://img.shields.io/npm/dm/specter-mcp.svg" alt="npm downloads"></a>
  <a href="https://github.com/abd3lraouf/specter-mcp/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/specter-mcp.svg" alt="license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/node/v/specter-mcp.svg" alt="node version"></a>
</p>

---

## What is Specter MCP?

Specter MCP enables AI agents (Claude, GPT, etc.) to **build, test, debug, and interact** with Android and iOS applications through the [Model Context Protocol](https://modelcontextprotocol.io). Think of it as giving your AI assistant the ability to:

- Build and deploy your mobile apps
- Take screenshots and interact with UI elements
- Run unit tests and E2E tests (Maestro)
- Analyze crash logs and debug issues
- Inspect app state (preferences, databases, logs)

## Prerequisites

| Requirement | Version | Verify Command |
|-------------|---------|----------------|
| Node.js | 20+ | `node --version` |
| Android SDK | Any | `adb --version` |
| Xcode CLI (macOS) | Any | `xcrun --version` |
| Maestro (optional) | Any | `maestro --version` |

### Quick Setup

```bash
# Android SDK (if not installed via Android Studio)
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"

# iOS (macOS only)
xcode-select --install
sudo xcodebuild -license accept

# Maestro (optional, for E2E testing)
curl -Ls "https://get.maestro.mobile.dev" | bash
```

## Installation

### Option 1: npm (Recommended)

```bash
npm install -g specter-mcp
```

### Option 2: From Source

```bash
git clone https://github.com/abd3lraouf/specter-mcp.git
cd specter-mcp
npm install && npm run build
```

## Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp"
    }
  }
}
```

### Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp"
    }
  }
}
```

### With Environment Variables

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp",
      "env": {
        "SPECTER_DEBUG": "true",
        "ANDROID_SDK_ROOT": "/path/to/android/sdk"
      }
    }
  }
}
```

### From Source

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/specter-mcp/dist/index.js"]
    }
  }
}
```

## Available Tools (15)

| Category | Tool | Description |
|----------|------|-------------|
| **Build** | `build_app` | Build Android/iOS app (debug/release) |
| | `install_app` | Install APK or .app on device |
| | `launch_app` | Launch installed app |
| **UI** | `get_ui_context` | Screenshot + UI hierarchy |
| | `interact_with_ui` | Tap, swipe, input text |
| **Testing** | `run_unit_tests` | Run unit tests |
| | `run_maestro_flow` | Run Maestro E2E flows |
| | `run_linter` | Detekt, SwiftLint, ktlint |
| **Environment** | `list_devices` | List emulators/simulators |
| | `manage_env` | Boot/shutdown devices |
| | `clean_project` | Clean build caches |
| **Debug** | `analyze_crash` | Parse crash logs, symbolicate |
| | `inspect_logs` | Filter device logs |
| | `inspect_app_state` | Read prefs, databases |
| **Navigation** | `deep_link_navigate` | Open deep links |

## Usage Examples

### Build & Deploy

```
You: Build my Android app in debug mode and install it

Claude: I'll build and deploy your app.
→ build_app(platform: "android", variant: "debug")
→ install_app(platform: "android", appPath: "...")
→ launch_app(platform: "android", appId: "com.example.app")
```

### Debug a Crash

```
You: My iOS app crashed, help me debug it

Claude: Let me analyze the crash.
→ analyze_crash(platform: "ios", appId: "com.example.app")
→ inspect_logs(platform: "ios", minLevel: "error")
```

### UI Testing

```
You: Take a screenshot and tap the login button

Claude: I'll capture the UI and interact with it.
→ get_ui_context(platform: "android")
→ interact_with_ui(platform: "android", action: "tap", element: "Login")
```

### Run E2E Tests

```
You: Run my login flow test on both platforms

Claude: Running Maestro flows.
→ run_maestro_flow(platform: "android", flowPath: "./maestro/login.yaml")
→ run_maestro_flow(platform: "ios", flowPath: "./maestro/login.yaml")
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SPECTER_DEBUG` | `false` | Enable debug logging |
| `SPECTER_LOG_LEVEL` | `info` | Log level (error/warn/info/debug) |
| `SPECTER_TIMEOUT` | `60000` | Default timeout (ms) |
| `ANDROID_SDK_ROOT` | auto | Android SDK path |
| `SPECTER_ANDROID_DEVICE` | - | Default Android device |
| `SPECTER_IOS_DEVICE` | `booted` | Default iOS simulator |

## Troubleshooting

### "adb: command not found"

```bash
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"
```

### "No devices found"

```bash
# Android: Start emulator
emulator -avd Pixel_6_API_34

# iOS: Boot simulator
xcrun simctl boot "iPhone 15 Pro"
```

### "xcrun: error: unable to find utility"

```bash
xcode-select --install
```

### Debug Mode

```json
{
  "env": {
    "SPECTER_DEBUG": "true",
    "SPECTER_LOG_LEVEL": "debug"
  }
}
```

## Project Structure

```
src/
├── index.ts              # MCP server entry
├── config.ts             # Configuration
├── platforms/            # Android/iOS utilities
│   ├── android/          # ADB, Gradle, logcat
│   └── ios/              # simctl, xcodebuild, crash parsing
├── tools/                # MCP tool implementations
│   ├── build/            # build_app, install_app, launch_app
│   ├── ui/               # get_ui_context, interact_with_ui
│   ├── testing/          # run_unit_tests, run_maestro_flow, run_linter
│   ├── environment/      # list_devices, manage_env, clean_project
│   ├── crash/            # analyze_crash
│   ├── navigation/       # deep_link_navigate
│   └── observability/    # inspect_logs, inspect_app_state
└── utils/                # Shell, image processing, XML parsing
```

## Development

```bash
npm install          # Install dependencies
npm run build        # Build TypeScript
npm test             # Run tests (695 tests)
npm run test:coverage # Coverage report
npm run lint         # ESLint
npm run typecheck    # Type check
```

## Documentation

- [API Reference](./docs/API.md) — All 15 tools with parameters
- [Configuration Guide](./docs/configuration.md) — Environment variables & setup
- [Getting Started](./docs/getting-started.md) — First steps

## License

[MIT](./LICENSE) © Specter MCP Contributors
