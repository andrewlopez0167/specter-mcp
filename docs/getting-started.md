# Getting Started with Specter MCP

This guide will help you set up Specter MCP and start using it with AI agents.

## Prerequisites

### Required

- **Node.js 20+** - [Download](https://nodejs.org/)
- **Android SDK** (for Android tools)
  - Ensure `adb` is in your PATH
  - Set `ANDROID_SDK_ROOT` environment variable
- **Xcode Command Line Tools** (for iOS tools, macOS only)
  ```bash
  xcode-select --install
  ```

### Optional

- **Maestro CLI** - For E2E testing
  ```bash
  curl -Ls "https://get.maestro.mobile.dev" | bash
  ```

## Installation

### From npm (Recommended)

```bash
npm install -g specter-mcp
```

### From Source

```bash
git clone https://github.com/anthropics/specter-mcp.git
cd specter-mcp
npm install
npm run build
```

## Configuration with Claude Desktop

Add Specter MCP to your Claude Desktop configuration:

### macOS

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp"
    }
  }
}
```

Or if installed from source:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "node",
      "args": ["/path/to/specter-mcp/dist/index.js"],
      "env": {
        "ANDROID_SDK_ROOT": "/Users/you/Library/Android/sdk"
      }
    }
  }
}
```

### Windows

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp"
    }
  }
}
```

## Verify Installation

Restart Claude Desktop and ask:

> "List available Android and iOS devices"

Claude should use the `list_devices` tool and show your connected devices/simulators.

## Quick Examples

### Build and Run an App

> "Build my Android app in debug mode and install it on the emulator"

### Debug a Crash

> "My iOS app is crashing. Analyze the latest crash log and tell me what's wrong"

### Run Tests

> "Run unit tests for the shared module and show me any failures"

### Inspect UI

> "Take a screenshot of my app and describe what's on screen"

## Environment Variables

Configure Specter MCP behavior via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SPECTER_DEBUG` | Enable debug logging | `false` |
| `SPECTER_TIMEOUT` | Command timeout (ms) | `60000` |
| `ANDROID_SDK_ROOT` | Android SDK path | auto-detect |
| `SPECTER_ANDROID_DEVICE` | Default Android device | - |
| `SPECTER_IOS_DEVICE` | Default iOS simulator | - |

## Next Steps

- [Configuration Guide](./configuration.md) - Detailed configuration options
- [API Reference](./API.md) - Complete tool documentation
- [Tool Examples](./tools/) - Usage examples for each tool
