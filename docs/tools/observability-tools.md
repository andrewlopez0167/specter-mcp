# Observability Tools

Tools for inspecting logs, app state, and debugging crashes.

## inspect_logs

Capture and filter device logs (logcat/oslog).

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `appId` | string | No | - | Filter by app bundle ID |
| `deviceId` | string | No | - | Target device |
| `minLevel` | string | No | `verbose` | Min log level |
| `maxEntries` | number | No | `100` | Max log entries |
| `since` | string | No | - | Time filter (e.g., "5m", "1h") |
| `grep` | string | No | - | Text filter pattern |

### Log Levels

- `verbose` / `debug` / `info` / `warning` / `error`

### Examples

**App errors only:**
```json
{
  "platform": "android",
  "appId": "com.example.app",
  "minLevel": "error",
  "maxEntries": 50
}
```

**Search for crashes:**
```json
{
  "platform": "ios",
  "grep": "CRASH|Exception|Fatal",
  "since": "10m"
}
```

### Response

```json
{
  "platform": "android",
  "entries": [
    {
      "timestamp": "2024-01-15T10:30:45.123Z",
      "level": "error",
      "tag": "MainActivity",
      "message": "NullPointerException: Cannot invoke method on null"
    }
  ],
  "truncated": false
}
```

---

## inspect_app_state

Read app preferences, databases, and files.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `appId` | string | Yes | - | App bundle ID |
| `deviceId` | string | No | - | Target device |
| `stateType` | string | No | `preferences` | Type of state |
| `key` | string | No | - | Specific key to read |
| `fileName` | string | No | - | Specific file name |

### State Types

- `preferences` - SharedPreferences / UserDefaults
- `database` - SQLite databases (Android)
- `files` - App file listing

### Examples

**Read all preferences:**
```json
{
  "platform": "android",
  "appId": "com.example.app",
  "stateType": "preferences"
}
```

**Read specific preference:**
```json
{
  "platform": "ios",
  "appId": "com.example.app",
  "stateType": "preferences",
  "key": "user_token"
}
```

### Response

```json
{
  "platform": "android",
  "appId": "com.example.app",
  "preferences": [
    {
      "name": "user_prefs",
      "entries": [
        { "key": "username", "value": "john_doe", "type": "string" },
        { "key": "loginCount", "value": 5, "type": "int" },
        { "key": "darkMode", "value": true, "type": "boolean" }
      ]
    }
  ]
}
```

---

## analyze_crash

Parse and analyze iOS crash logs.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `crashLogPath` | string | No | - | Path to .crash/.ips file |
| `appId` | string | No | - | App to find crashes for |
| `dsymPath` | string | No | - | dSYM for symbolication |
| `limit` | number | No | `5` | Max crashes to analyze |

### Examples

**Analyze specific crash:**
```json
{
  "crashLogPath": "/path/to/MyApp-2024-01-15.crash"
}
```

**Find recent crashes:**
```json
{
  "appId": "com.example.app",
  "limit": 3
}
```

### Response

```json
{
  "crashes": [
    {
      "timestamp": "2024-01-15T10:30:00Z",
      "exceptionType": "EXC_BAD_ACCESS",
      "signal": "SIGSEGV",
      "crashedThread": 0,
      "stackTrace": [
        {
          "frame": 0,
          "binary": "MyApp",
          "symbol": "-[ViewController viewDidLoad]",
          "file": "ViewController.swift",
          "line": 42
        }
      ],
      "analysis": {
        "category": "memory",
        "likelyCause": "Null pointer dereference",
        "suggestions": [
          "Check for nil values before accessing properties",
          "Add guard statements for optional unwrapping"
        ]
      }
    }
  ]
}
```

---

## deep_link_navigate

Open deep links in the app.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `url` | string | Yes | - | Deep link URL |
| `deviceId` | string | No | - | Target device |
| `extras` | object | No | - | Intent extras (Android) |

### Examples

**Basic deep link:**
```json
{
  "platform": "android",
  "url": "myapp://product/123"
}
```

**With intent extras:**
```json
{
  "platform": "android",
  "url": "myapp://checkout",
  "extras": {
    "cartId": "abc123",
    "promoCode": "SAVE20"
  }
}
```

### Response

```json
{
  "success": true,
  "url": "myapp://product/123",
  "launched": true
}
```

---

## Debugging Workflows

### Investigate App Behavior

1. Use `inspect_logs` to capture recent activity
2. Check `inspect_app_state` for saved data
3. Use `get_ui_context` to see current screen

### Crash Analysis

1. Run `analyze_crash` to find recent crashes
2. Review stack trace and suggestions
3. Check logs around crash time with `inspect_logs`
