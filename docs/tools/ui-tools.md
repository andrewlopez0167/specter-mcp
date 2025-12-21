# UI Tools

Tools for capturing and interacting with mobile app UI.

## get_ui_context

Capture a screenshot and/or UI element hierarchy.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `deviceId` | string | No | - | Target device ID |
| `includeScreenshot` | boolean | No | `true` | Include base64 screenshot |
| `includeHierarchy` | boolean | No | `true` | Include UI element tree |

### Examples

**Full UI context:**
```json
{
  "platform": "android",
  "includeScreenshot": true,
  "includeHierarchy": true
}
```

**Screenshot only:**
```json
{
  "platform": "ios",
  "includeScreenshot": true,
  "includeHierarchy": false
}
```

### Response

```json
{
  "platform": "android",
  "screenshot": "data:image/png;base64,iVBORw0KGgo...",
  "hierarchy": {
    "elements": [
      {
        "id": "login_button",
        "type": "Button",
        "text": "Login",
        "bounds": { "x": 100, "y": 400, "width": 200, "height": 48 },
        "clickable": true,
        "visible": true
      }
    ]
  }
}
```

---

## interact_with_ui

Perform UI interactions: tap, swipe, type, scroll.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `platform` | `android` \| `ios` | Yes | - | Target platform |
| `action` | string | Yes | - | Action type (see below) |
| `deviceId` | string | No | - | Target device ID |

### Action Types

#### tap

Tap on an element or coordinates.

```json
{
  "platform": "android",
  "action": "tap",
  "elementId": "login_button"
}
```

Or by coordinates:

```json
{
  "platform": "android",
  "action": "tap",
  "x": 200,
  "y": 450
}
```

Or by text:

```json
{
  "platform": "android",
  "action": "tap",
  "text": "Login"
}
```

#### type

Input text into a focused field.

```json
{
  "platform": "android",
  "action": "type",
  "text": "user@example.com"
}
```

#### swipe

Swipe in a direction.

```json
{
  "platform": "ios",
  "action": "swipe",
  "direction": "up",
  "startX": 200,
  "startY": 600
}
```

#### scroll

Scroll to find an element.

```json
{
  "platform": "android",
  "action": "scroll",
  "direction": "down",
  "elementId": "target_element"
}
```

#### pressKey

Press a system key (Android).

```json
{
  "platform": "android",
  "action": "pressKey",
  "keyCode": "KEYCODE_BACK"
}
```

### Response

```json
{
  "success": true,
  "action": "tap",
  "target": "login_button"
}
```

---

## Best Practices

### Element Selection Priority

1. **Element ID** - Most reliable
2. **Accessibility ID** - Cross-platform friendly
3. **Text content** - Human-readable but fragile
4. **Coordinates** - Last resort

### Waiting for UI

After interactions, the UI may need time to update. Use `get_ui_context` to verify state changes before proceeding.

### Scrolling Strategy

For long lists:
1. Try `scroll` action with target element
2. If not found, use directional swipe
3. Capture UI context to verify position
