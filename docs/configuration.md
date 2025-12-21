# Configuration Guide

Specter MCP can be configured via environment variables and Claude Desktop settings.

## Environment Variables

### Core Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPECTER_DEBUG` | boolean | `false` | Enable verbose debug logging |
| `SPECTER_LOG_LEVEL` | string | `info` | Log level: `error`, `warn`, `info`, `debug` |
| `SPECTER_TIMEOUT` | number | `60000` | Default command timeout in milliseconds |

### Android Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ANDROID_SDK_ROOT` | path | auto | Android SDK installation path |
| `ANDROID_HOME` | path | auto | Alternative to ANDROID_SDK_ROOT |
| `SPECTER_ANDROID_DEVICE` | string | - | Default Android device/emulator ID |
| `SPECTER_ADB_TIMEOUT` | number | `30000` | ADB command timeout |

### iOS Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `SPECTER_IOS_DEVICE` | string | `booted` | Default iOS simulator UDID |
| `SPECTER_XCODE_TIMEOUT` | number | `1800000` | xcodebuild timeout (30 min) |

### Testing Settings

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MAESTRO_PATH` | path | auto | Path to Maestro CLI binary |
| `SPECTER_TEST_TIMEOUT` | number | `300000` | Test execution timeout (5 min) |

## Claude Desktop Configuration

### Basic Configuration

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
        "ANDROID_SDK_ROOT": "/Users/you/Library/Android/sdk",
        "SPECTER_ANDROID_DEVICE": "emulator-5554",
        "SPECTER_IOS_DEVICE": "booted"
      }
    }
  }
}
```

### From Source Installation

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/specter-mcp/dist/index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

## Platform-Specific Setup

### Android

1. Install Android Studio or Android SDK Command Line Tools
2. Set environment variable:
   ```bash
   export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
   ```
3. Add platform-tools to PATH:
   ```bash
   export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"
   ```
4. Verify:
   ```bash
   adb --version
   ```

### iOS (macOS only)

1. Install Xcode from App Store
2. Install Command Line Tools:
   ```bash
   xcode-select --install
   ```
3. Accept license:
   ```bash
   sudo xcodebuild -license accept
   ```
4. Verify:
   ```bash
   xcrun simctl list devices
   ```

### Maestro (Optional)

For E2E testing capabilities:

```bash
# Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# Verify installation
maestro --version
```

## Timeouts

Specter MCP uses different timeouts for different operations:

| Operation | Default | Environment Variable |
|-----------|---------|---------------------|
| Build (Gradle/Xcode) | 30 min | `SPECTER_BUILD_TIMEOUT` |
| Unit Tests | 5 min | `SPECTER_TEST_TIMEOUT` |
| E2E Tests | 10 min | `SPECTER_MAESTRO_TIMEOUT` |
| ADB Commands | 30 sec | `SPECTER_ADB_TIMEOUT` |
| General Commands | 60 sec | `SPECTER_TIMEOUT` |

## Troubleshooting

### "adb: command not found"

Ensure Android SDK platform-tools is in your PATH:

```bash
export PATH="$PATH:$ANDROID_SDK_ROOT/platform-tools"
```

### "xcrun: error: unable to find utility"

Install Xcode Command Line Tools:

```bash
xcode-select --install
```

### "No devices found"

- **Android**: Start an emulator or connect a device with USB debugging enabled
- **iOS**: Boot a simulator via Xcode or `xcrun simctl boot <device-id>`

### Debug Mode

Enable debug logging for troubleshooting:

```json
{
  "mcpServers": {
    "specter-mcp": {
      "command": "specter-mcp",
      "env": {
        "SPECTER_DEBUG": "true",
        "SPECTER_LOG_LEVEL": "debug"
      }
    }
  }
}
```
