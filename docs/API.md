# Specter MCP API Reference

Specter MCP provides 15 tools for AI agents to interact with Kotlin Multiplatform Mobile (KMM) projects.

## Table of Contents

- [Build & Deployment](#build-deployment)
- [UI Inspection & Interaction](#ui-inspection-interaction)
- [Testing & QA](#testing-qa)
- [Environment Management](#environment-management)
- [Crash Analysis](#crash-analysis)
- [Navigation](#navigation)
- [Observability](#observability)

## Quick Reference

| Tool | Category | Description |
|------|----------|-------------|
| `build_app` | Build & Deployment | Build a KMM application for Android or iOS |
| `install_app` | Build & Deployment | Install an app on a device or simulator |
| `launch_app` | Build & Deployment | Launch an installed app on a device or simulator |
| `get_ui_context` | UI Inspection & Interaction | Capture the current UI state including screenshot and interactive elements |
| `interact_with_ui` | UI Inspection & Interaction | Perform UI interactions like tap, swipe, or text input |
| `run_unit_tests` | Testing & QA | Run unit tests for Android or iOS |
| `run_maestro_flow` | Testing & QA | Run a Maestro E2E test flow |
| `run_linter` | Testing & QA | Run code linter (Detekt, Android Lint, SwiftLint, ktlint) |
| `list_devices` | Environment Management | List available devices (emulators, simulators, physical devices) |
| `manage_env` | Environment Management | Manage device environment: boot, shutdown, or restart emulators and simulators |
| `clean_project` | Environment Management | Clean project build caches, DerivedData, and other temporary files |
| `analyze_crash` | Crash Analysis | Analyze crash logs and device logs for both Android and iOS |
| `deep_link_navigate` | Navigation | Navigate to a specific screen in the app using a deep link or Universal Link |
| `inspect_app_state` | Observability | Inspect app preferences (SharedPreferences/UserDefaults) and SQLite databases |
| `inspect_logs` | Observability | Inspect device logs (Android logcat or iOS unified logs) |

## Build & Deployment

### `build_app`

Build a KMM application for Android or iOS. Returns structured build result with error details on failure.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform to build for |
| `variant` | enum: `debug`, `release` | ❌ | Build variant (default: debug) |
| `clean` | boolean | ❌ | Clean before building (default: false) |
| `iosDestination` | string | ❌ | iOS simulator destination (e.g., "platform=iOS Simulator,name=iPhone 15 Pro") |
| `androidModule` | string | ❌ | Android module name (default: androidApp) |
| `iosScheme` | string | ❌ | iOS scheme name (default: iosApp) |
| `timeoutMs` | number | ❌ | Build timeout in milliseconds (default: 30 minutes) |

### `install_app`

Install an app on a device or simulator. For Android, installs an APK. For iOS, installs an .app bundle.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `appPath` | string | ✅ | Path to the app artifact (APK for Android, .app bundle for iOS) |
| `device` | string | ❌ | Device ID or name (optional, uses first running device if not specified) |

### `launch_app`

Launch an installed app on a device or simulator.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `appId` | string | ✅ | Package name (Android) or bundle ID (iOS) |
| `device` | string | ❌ | Device ID or name (optional, uses first running device if not specified) |
| `clearData` | boolean | ❌ | Clear app data before launch (Android only, default: false) |
| `launchArguments` | array | ❌ | Arguments to pass to the app (iOS only) |

## UI Inspection & Interaction

### `get_ui_context`

Capture the current UI state including screenshot and interactive elements. Returns a compressed screenshot and a list of UI elements with their properties.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `device` | string | ❌ | Device ID or name (optional, uses first running device if not specified) |
| `includeAllElements` | boolean | ❌ | Include all elements, not just interactive ones (default: false) |
| `maxDepth` | number | ❌ | Maximum depth to traverse in UI hierarchy (default: 20) |
| `screenshotQuality` | number | ❌ | Screenshot JPEG quality 1-100 (default: 50) |
| `skipScreenshot` | boolean | ❌ | Skip screenshot capture for faster response (default: false) |
| `elementTypes` | array | ❌ | Filter to specific element types |

### `interact_with_ui`

Perform UI interactions like tap, swipe, or text input. Can target elements by ID/text or by coordinates.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `action` | enum: `tap`, `long_press`, `swipe`, `input_text`, `clear` | ✅ | Type of interaction to perform |
| `element` | string | ❌ | Element ID, resource ID, or text to interact with |
| `x` | number | ❌ | X coordinate for coordinate-based interaction |
| `y` | number | ❌ | Y coordinate for coordinate-based interaction |
| `text` | string | ❌ | Text to input (for input_text action) |
| `direction` | enum: `up`, `down`, `left`, `right` | ❌ | Swipe direction (for swipe action) |
| `durationMs` | number | ❌ | Duration in milliseconds (for long_press and swipe, default: 300) |
| `device` | string | ❌ | Device ID or name (optional) |

## Testing & QA

### `run_unit_tests`

Run unit tests for Android or iOS. Returns structured test results with pass/fail status and failure details.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `projectPath` | string | ✅ | Path to the project root directory |
| `sourceSet` | string | ❌ | Source set to test (test, commonTest, androidTest, iosTest) |
| `testClass` | string | ❌ | Specific test class to run (optional) |
| `testMethod` | string | ❌ | Specific test method to run (requires testClass) |
| `module` | string | ❌ | Gradle module for KMM projects (e.g., :shared) |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 300000) |

### `run_maestro_flow`

Run a Maestro E2E test flow. Returns structured results with step-by-step status. On failure, generates a failure bundle with screenshot and logs for debugging.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `flowPath` | string | ✅ | Path to the Maestro flow YAML file |
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `device` | string | ❌ | Device ID or name (optional, uses first available) |
| `appId` | string | ❌ | App package (Android) or bundle ID (iOS) |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 300000) |
| `generateFailureBundle` | boolean | ❌ | Generate failure bundle with screenshot and logs on failure (default: true) |
| `env` | object | ❌ | Environment variables for the flow |

### `run_linter`

Run code linter (Detekt, Android Lint, SwiftLint, ktlint). Returns structured lint results with issue locations and suggestions.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `projectPath` | string | ✅ | Path to the project root directory |
| `linter` | enum: `detekt`, `android-lint`, `swiftlint`, `ktlint` | ❌ | Linter to run (default: detekt for Android, swiftlint for iOS) |
| `module` | string | ❌ | Gradle module for Android linters (e.g., :app) |
| `configPath` | string | ❌ | Path to linter configuration file |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 300000) |
| `autoFix` | boolean | ❌ | Auto-fix issues if supported by the linter (default: false) |

## Environment Management

### `list_devices`

List available devices (emulators, simulators, physical devices). Returns device details including status and platform.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ❌ | Filter by platform (optional, lists all if not specified) |
| `status` | enum: `booted`, `shutdown`, `booting`, `unknown` | ❌ | Filter by device status |
| `includeAvds` | boolean | ❌ | Include list of available Android AVDs (default: false) |
| `includeUnavailable` | boolean | ❌ | Include unavailable iOS simulators (default: false) |

### `manage_env`

Manage device environment: boot, shutdown, or restart emulators and simulators.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum: `boot`, `shutdown`, `restart` | ✅ | Action to perform |
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `device` | string | ❌ | Device ID, name, or AVD name (optional, uses first available) |
| `waitForReady` | boolean | ❌ | Wait for device to be fully ready after boot (default: true) |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 120000) |

### `clean_project`

Clean project build caches, DerivedData, and other temporary files. Helps resolve build issues caused by stale caches.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | ✅ | Path to the project root directory |
| `cleanGradle` | boolean | ❌ | Clean Gradle caches and run gradlew clean (default: true) |
| `cleanDerivedData` | boolean | ❌ | Clean Xcode DerivedData (default: true) |
| `cleanBuild` | boolean | ❌ | Clean build directories (default: true) |
| `cleanNodeModules` | boolean | ❌ | Clean node_modules directory (default: false) |
| `cleanPods` | boolean | ❌ | Clean CocoaPods Pods directory (default: false) |
| `module` | string | ❌ | Specific Gradle module to clean (e.g., :app) |

## Crash Analysis

### `analyze_crash`

Cross-platform crash analysis tool. For iOS, can analyze crash log files (.ips/.crash) with symbolication, or analyze live device logs via oslog. For Android, analyzes live device logs via logcat. Identifies crash patterns and provides root cause suggestions.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform to analyze |
| `appId` | string | ❌ | App ID (Android package name or iOS bundle ID) for live device log analysis |
| `deviceId` | string | ❌ | Device ID for analysis (optional, uses first available device) |
| `crashLogPath` | string | ❌ | Path to iOS crash log file (.ips or .crash) - iOS only, optional for live analysis |
| `dsymPath` | string | ❌ | Path to dSYM file or directory - iOS only (optional, searches common locations) |
| `timeRangeSeconds` | number | ❌ | Time range in seconds to search device logs (default: 300 = 5 minutes) |
| `skipSymbolication` | boolean | ❌ | Skip symbolication for faster analysis - iOS only (default: false) |
| `includeRawLog` | boolean | ❌ | Include raw log data in output (default: false) |

## Navigation

### `deep_link_navigate`

Navigate to a specific screen in the app using a deep link or Universal Link. Supports custom URL schemes (myapp://path) and HTTPS URLs for App Links/Universal Links.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `uri` | string | ✅ | Deep link URI to navigate to (e.g., myapp://home/profile or https://example.com/app/products/123) |
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `deviceId` | string | ❌ | Device ID (optional, uses first available). For Android: emulator-5554. For iOS: UDID or "booted" |
| `packageName` | string | ❌ | Android package name to target specific app (e.g., com.example.myapp) |
| `bundleId` | string | ❌ | iOS bundle ID to target specific app (e.g., com.example.myapp) |
| `waitAfterMs` | number | ❌ | Time to wait after navigation in milliseconds (default: 1000) |
| `extras` | array | ❌ | Android intent extras to pass with the deep link |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 15000) |

## Observability

### `inspect_app_state`

Inspect app preferences (SharedPreferences/UserDefaults) and SQLite databases. Can list all preferences, inspect specific databases, or run SQL queries.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `appId` | string | ✅ | App package name (Android) or bundle ID (iOS) |
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `deviceId` | string | ❌ | Device ID (optional, uses first available) |
| `includePreferences` | boolean | ❌ | Include preferences in inspection (default: true) |
| `includeDatabases` | boolean | ❌ | Include databases in inspection (default: true) |
| `preferencesFile` | string | ❌ | Specific preferences file to inspect |
| `databaseName` | string | ❌ | Specific database name to inspect or query |
| `sqlQuery` | string | ❌ | SQL query to execute (requires databaseName) |
| `maxRows` | number | ❌ | Maximum rows to return from query (default: 100) |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 30000) |

### `inspect_logs`

Inspect device logs (Android logcat or iOS unified logs). Can filter by app, log level, tags, patterns, and time range.

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `platform` | enum: `android`, `ios` | ✅ | Target platform |
| `appId` | string | ❌ | App package name (Android) or bundle ID (iOS) to filter logs |
| `deviceId` | string | ❌ | Device ID (optional, uses first available) |
| `minLevel` | enum: `verbose`, `debug`, `info`, `warning`, `error`, `fatal` | ❌ | Minimum log level to include |
| `tags` | array | ❌ | Tags to include (Android logcat) |
| `excludeTags` | array | ❌ | Tags to exclude from results |
| `pattern` | string | ❌ | Search pattern (regex) to filter messages |
| `ignoreCase` | boolean | ❌ | Case insensitive pattern matching (default: true) |
| `subsystem` | string | ❌ | Subsystem filter (iOS only) |
| `category` | string | ❌ | Category filter (iOS only) |
| `maxEntries` | number | ❌ | Maximum log entries to return (default: 200) |
| `lastSeconds` | number | ❌ | Time range - logs from last N seconds (iOS, default: 300) |
| `clear` | boolean | ❌ | Clear log buffer before capture (Android only) |
| `includeCrashes` | boolean | ❌ | Include crash/fault logs (default: true) |
| `timeoutMs` | number | ❌ | Timeout in milliseconds (default: 30000) |

## Usage Examples

### Building an Android App

```json
{
  "tool": "build_app",
  "arguments": {
    "platform": "android",
    "variant": "debug",
    "clean": false
  }
}
```

### Capturing UI Context

```json
{
  "tool": "get_ui_context",
  "arguments": {
    "platform": "ios",
    "skipScreenshot": false
  }
}
```

### Running E2E Tests with Maestro

```json
{
  "tool": "run_maestro_flow",
  "arguments": {
    "platform": "android",
    "flowPath": "./maestro/login-flow.yaml",
    "appId": "com.example.app"
  }
}
```

### Analyzing a Crash (Android - live logs)

```json
{
  "tool": "analyze_crash",
  "arguments": {
    "platform": "android",
    "appId": "com.example.app",
    "timeRangeSeconds": 300
  }
}
```

### Analyzing a Crash (iOS - crash file)

```json
{
  "tool": "analyze_crash",
  "arguments": {
    "platform": "ios",
    "crashLogPath": "/path/to/crash.ips",
    "dsymPath": "/path/to/app.dSYM"
  }
}
```

## Error Handling

All tools return structured results with error information when failures occur:

- **Invalid Arguments**: Thrown when required parameters are missing or invalid
- **Platform Unavailable**: Thrown when required tools (gradle, xcodebuild) are not found
- **Device Not Found**: Returned with list of available devices
- **Timeout**: Thrown when operation exceeds configured timeout

---

*Generated on 2025-12-20*
