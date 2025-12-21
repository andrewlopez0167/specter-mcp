# Build Tools

Tools for building, installing, and launching mobile applications.

## build_app

Build an Android or iOS application.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `variant` | `debug` \| `release` | No | `debug` | Build variant |
| `clean` | boolean | No | `false` | Clean before build |
| `deviceId` | string | No | - | Target device ID |

### Examples

**Build Android Debug:**
```json
{
  "platform": "android",
  "variant": "debug"
}
```

**Clean Build iOS Release:**
```json
{
  "platform": "ios",
  "variant": "release",
  "clean": true
}
```

### Response

```json
{
  "success": true,
  "platform": "android",
  "variant": "debug",
  "durationMs": 45000,
  "artifactPath": "/project/app/build/outputs/apk/debug/app-debug.apk"
}
```

On failure, includes error analysis:

```json
{
  "success": false,
  "errorSummary": {
    "errorCount": 2,
    "topErrors": [
      {
        "message": "Unresolved reference: foo",
        "file": "/project/src/Main.kt",
        "line": 15
      }
    ],
    "suggestions": ["Check for missing imports"]
  }
}
```

---

## install_app

Install an app on a device or simulator.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `appPath` | string | No | - | Path to APK/app bundle |
| `deviceId` | string | No | - | Target device ID |
| `reinstall` | boolean | No | `false` | Replace existing app |

### Examples

**Install APK:**
```json
{
  "platform": "android",
  "appPath": "/project/app/build/outputs/apk/debug/app-debug.apk"
}
```

**Reinstall iOS app:**
```json
{
  "platform": "ios",
  "appPath": "/project/build/Debug-iphonesimulator/App.app",
  "reinstall": true
}
```

---

## launch_app

Launch an installed application.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `appId` | string | Yes | - | Bundle ID / package name |
| `deviceId` | string | No | - | Target device ID |
| `waitForLaunch` | boolean | No | `true` | Wait for app to start |

### Examples

**Launch Android app:**
```json
{
  "platform": "android",
  "appId": "com.example.myapp"
}
```

**Launch iOS app on specific simulator:**
```json
{
  "platform": "ios",
  "appId": "com.example.myapp",
  "deviceId": "iPhone 15 Pro"
}
```

---

## Common Workflows

### Build and Run

1. Build the app: `build_app`
2. Install on device: `install_app`
3. Launch the app: `launch_app`

### Debug Build Failures

When `build_app` fails:

1. Check `errorSummary.topErrors` for specific errors
2. Use `suggestions` for fix hints
3. Ask Claude to analyze the error and suggest fixes
