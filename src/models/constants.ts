/**
 * Specter MCP Constants and Enums
 * Platform-agnostic types used across the codebase
 */

// Supported platforms
export const PLATFORMS = ['android', 'ios'] as const;
export type Platform = (typeof PLATFORMS)[number];

// Build variants
export const BUILD_VARIANTS = ['debug', 'release'] as const;
export type BuildVariant = (typeof BUILD_VARIANTS)[number];

// KMM modules
export const KMM_MODULES = ['shared', 'commonMain', 'commonTest', 'androidMain', 'iosMain'] as const;
export type KmmModule = (typeof KMM_MODULES)[number];

// UI interaction types
export const INTERACTION_TYPES = ['tap', 'long_press', 'swipe', 'input_text', 'clear'] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

// Swipe directions
export const SWIPE_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type SwipeDirection = (typeof SWIPE_DIRECTIONS)[number];

// Device status
export const DEVICE_STATUSES = ['booted', 'shutdown', 'booting', 'unknown'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

// Log levels
export const LOG_LEVELS = ['verbose', 'debug', 'info', 'warning', 'error', 'fatal'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

// Element types (unified across platforms)
export const ELEMENT_TYPES = [
  'button',
  'text',
  'input',
  'image',
  'list',
  'scroll',
  'container',
  'switch',
  'checkbox',
  'other',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

// Crash pattern types
export const CRASH_PATTERN_TYPES = [
  'null_pointer',
  'array_bounds',
  'threading_violation',
  'stack_overflow',
  'assertion_failure',
  'memory_corruption',
  'unknown',
] as const;
export type CrashPatternType = (typeof CRASH_PATTERN_TYPES)[number];

// Lint sources
export const LINT_SOURCES = ['detekt', 'android-lint', 'ktlint'] as const;
export type LintSource = (typeof LINT_SOURCES)[number];

// Environment actions
export const ENV_ACTIONS = ['boot', 'shutdown', 'wipe'] as const;
export type EnvAction = (typeof ENV_ACTIONS)[number];

/**
 * Default configuration values
 */
export const DEFAULTS = {
  BUILD_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
  SHELL_TIMEOUT_MS: 30 * 1000, // 30 seconds
  LOG_LIMIT: 100,
  SCREENSHOT_QUALITY: 50,
  DEVICE_BOOT_TIMEOUT_MS: 2 * 60 * 1000, // 2 minutes
} as const;

/**
 * Android-specific mappings
 */
export const ANDROID_ELEMENT_MAP: Record<string, ElementType> = {
  'android.widget.Button': 'button',
  'android.widget.TextView': 'text',
  'android.widget.EditText': 'input',
  'android.widget.ImageView': 'image',
  'androidx.recyclerview.widget.RecyclerView': 'list',
  'android.widget.ListView': 'list',
  'android.widget.ScrollView': 'scroll',
  'android.widget.HorizontalScrollView': 'scroll',
  'android.view.ViewGroup': 'container',
  'android.widget.LinearLayout': 'container',
  'android.widget.FrameLayout': 'container',
  'android.widget.RelativeLayout': 'container',
  'android.widget.Switch': 'switch',
  'android.widget.CheckBox': 'checkbox',
};

/**
 * iOS-specific mappings
 */
export const IOS_ELEMENT_MAP: Record<string, ElementType> = {
  XCUIElementTypeButton: 'button',
  XCUIElementTypeStaticText: 'text',
  XCUIElementTypeTextField: 'input',
  XCUIElementTypeTextView: 'input',
  XCUIElementTypeSecureTextField: 'input',
  XCUIElementTypeImage: 'image',
  XCUIElementTypeTable: 'list',
  XCUIElementTypeCollectionView: 'list',
  XCUIElementTypeScrollView: 'scroll',
  XCUIElementTypeOther: 'container',
  XCUIElementTypeCell: 'container',
  XCUIElementTypeSwitch: 'switch',
  XCUIElementTypeCheckBox: 'checkbox',
};

/**
 * Type guards
 */
export function isPlatform(value: string): value is Platform {
  return PLATFORMS.includes(value as Platform);
}

export function isBuildVariant(value: string): value is BuildVariant {
  return BUILD_VARIANTS.includes(value as BuildVariant);
}

export function isLogLevel(value: string): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

export function isDeviceStatus(value: string): value is DeviceStatus {
  return DEVICE_STATUSES.includes(value as DeviceStatus);
}
