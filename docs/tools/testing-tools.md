# Testing Tools

Tools for running unit tests, E2E tests, and linters.

## run_unit_tests

Run unit tests using Gradle (Android) or XCTest (iOS).

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `sourceSet` | string | No | `test` | Source set to test |
| `module` | string | No | `:shared` | Gradle module |
| `testClass` | string | No | - | Specific test class |
| `testMethod` | string | No | - | Specific test method |

### Examples

**Run all tests:**
```json
{
  "platform": "android"
}
```

**Run shared module tests:**
```json
{
  "platform": "android",
  "module": ":shared",
  "sourceSet": "commonTest"
}
```

**Run specific test:**
```json
{
  "platform": "android",
  "testClass": "com.example.UserRepositoryTest",
  "testMethod": "testLoginSuccess"
}
```

### Response

```json
{
  "platform": "android",
  "success": true,
  "totalTests": 45,
  "passed": 43,
  "failed": 2,
  "skipped": 0,
  "durationMs": 12500,
  "suites": [
    {
      "name": "UserRepositoryTest",
      "totalTests": 5,
      "passed": 4,
      "failed": 1,
      "testCases": [
        {
          "name": "testLoginSuccess",
          "status": "passed",
          "durationMs": 120
        },
        {
          "name": "testLoginFailure",
          "status": "failed",
          "error": "Expected 401 but got 200",
          "stackTrace": "..."
        }
      ]
    }
  ]
}
```

---

## run_maestro_flow

Execute Maestro E2E test flows.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `flowPath` | string | Yes | - | Path to .yaml flow file |
| `platform` | `android` \| `ios` | No | auto | Target platform |
| `deviceId` | string | No | - | Target device |
| `env` | object | No | - | Environment variables |

### Examples

**Run a flow:**
```json
{
  "flowPath": "./maestro/flows/login.yaml"
}
```

**With environment variables:**
```json
{
  "flowPath": "./maestro/flows/checkout.yaml",
  "env": {
    "TEST_USER": "demo@example.com",
    "TEST_PASSWORD": "secret123"
  }
}
```

### Response

```json
{
  "success": true,
  "flowName": "login.yaml",
  "durationMs": 15000,
  "steps": [
    { "action": "launchApp", "status": "passed" },
    { "action": "tapOn 'Login'", "status": "passed" },
    { "action": "inputText", "status": "passed" },
    { "action": "assertVisible 'Welcome'", "status": "passed" }
  ]
}
```

On failure, includes failure bundle:

```json
{
  "success": false,
  "failedStep": "assertVisible 'Welcome'",
  "failureBundle": {
    "screenshot": "base64...",
    "hierarchy": { ... },
    "logs": "..."
  }
}
```

---

## run_linter

Run static analysis tools.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `tool` | string | No | auto | Linter: `detekt`, `ktlint`, `swiftlint` |
| `fix` | boolean | No | `false` | Auto-fix issues |
| `paths` | string[] | No | - | Paths to lint |

### Examples

**Run Detekt:**
```json
{
  "platform": "android",
  "tool": "detekt"
}
```

**Run SwiftLint with auto-fix:**
```json
{
  "platform": "ios",
  "tool": "swiftlint",
  "fix": true
}
```

### Response

```json
{
  "success": false,
  "tool": "detekt",
  "issueCount": 12,
  "issues": [
    {
      "rule": "MagicNumber",
      "message": "Report magic numbers",
      "file": "src/Main.kt",
      "line": 42,
      "severity": "warning"
    }
  ]
}
```

---

## Testing Workflows

### Full Test Suite

1. Run unit tests: `run_unit_tests`
2. Run E2E tests: `run_maestro_flow`
3. Run linter: `run_linter`

### Test-Driven Debugging

1. Run failing test to reproduce issue
2. Use `inspect_logs` to check runtime behavior
3. Fix code
4. Re-run test to verify fix

### KMM Testing

For Kotlin Multiplatform:

```json
{
  "platform": "android",
  "module": ":shared",
  "sourceSet": "commonTest"
}
```

This runs tests for common code on the JVM target.
