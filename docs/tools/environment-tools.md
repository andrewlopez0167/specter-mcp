# Environment Tools

Tools for managing devices, simulators, and project state.

## list_devices

List available Android and iOS devices/simulators.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` \| `all` | No | `all` | Filter by platform |
| `status` | `all` \| `available` \| `booted` | No | `all` | Filter by status |

### Examples

**List all devices:**
```json
{}
```

**List booted iOS simulators:**
```json
{
  "platform": "ios",
  "status": "booted"
}
```

### Response

```json
{
  "android": [
    {
      "id": "emulator-5554",
      "name": "Pixel_7_API_34",
      "type": "emulator",
      "status": "online",
      "apiLevel": 34
    },
    {
      "id": "RF8M90XXXXX",
      "name": "Samsung Galaxy S23",
      "type": "device",
      "status": "online",
      "apiLevel": 33
    }
  ],
  "ios": [
    {
      "id": "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX",
      "name": "iPhone 15 Pro",
      "type": "simulator",
      "status": "booted",
      "runtime": "iOS 17.2"
    }
  ]
}
```

---

## manage_env

Boot, shutdown, or erase simulators and emulators.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `action` | string | Yes | - | Action to perform |
| `deviceId` | string | No | - | Device identifier |
| `deviceName` | string | No | - | Device name (for create) |

### Actions

#### boot

Start a simulator/emulator.

```json
{
  "platform": "ios",
  "action": "boot",
  "deviceId": "iPhone 15 Pro"
}
```

#### shutdown

Stop a running simulator/emulator.

```json
{
  "platform": "ios",
  "action": "shutdown",
  "deviceId": "iPhone 15 Pro"
}
```

#### erase

Reset a simulator to clean state (iOS only).

```json
{
  "platform": "ios",
  "action": "erase",
  "deviceId": "iPhone 15 Pro"
}
```

### Response

```json
{
  "success": true,
  "action": "boot",
  "deviceId": "iPhone 15 Pro",
  "message": "Simulator booted successfully"
}
```

---

## clean_project

Clean build caches and derived data.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` \| `all` | No | `all` | Platform to clean |
| `projectPath` | string | No | cwd | Project root path |
| `deep` | boolean | No | `false` | Deep clean (Gradle caches) |

### Examples

**Clean all:**
```json
{}
```

**Deep clean Android:**
```json
{
  "platform": "android",
  "deep": true
}
```

### What Gets Cleaned

**Android:**
- `build/` directories
- `.gradle/` cache (if deep)
- Gradle daemon (if deep)

**iOS:**
- `DerivedData/`
- `build/` directories
- Xcode caches

### Response

```json
{
  "success": true,
  "cleaned": {
    "android": [
      "app/build",
      "shared/build",
      ".gradle"
    ],
    "ios": [
      "build/DerivedData"
    ]
  },
  "freedMb": 1250
}
```

---

## Common Workflows

### Fresh Build Environment

1. Clean project: `clean_project` with `deep: true`
2. Verify devices: `list_devices`
3. Boot simulator if needed: `manage_env` with `action: boot`
4. Build app: `build_app`

### Reset Test Environment

1. Shutdown simulators: `manage_env` with `action: shutdown`
2. Erase simulator: `manage_env` with `action: erase`
3. Boot fresh: `manage_env` with `action: boot`
4. Install app: `install_app`

### Debug Device Issues

1. List all devices: `list_devices`
2. Check status of specific device
3. Restart device if offline: `manage_env` shutdown + boot
