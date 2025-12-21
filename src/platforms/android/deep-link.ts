/**
 * Android Deep Link Handler
 * Opens deep links and App Links on Android devices via adb
 */

import { executeShell } from '../../utils/shell.js';

/**
 * Intent extra types for Android
 */
export type IntentExtraType = 'string' | 'int' | 'long' | 'float' | 'boolean' | 'uri';

/**
 * Intent extra value
 */
export interface IntentExtra {
  type: IntentExtraType;
  key: string;
  value: string | number | boolean;
}

/**
 * Options for opening deep link on Android
 */
export interface AndroidDeepLinkOptions {
  /** Device ID (serial number or emulator ID) */
  deviceId?: string;
  /** Package name for explicit intent */
  packageName?: string;
  /** Activity name for explicit intent */
  activityName?: string;
  /** Intent action (default: android.intent.action.VIEW) */
  action?: string;
  /** Intent category */
  category?: string;
  /** Intent extras to pass with the deep link */
  extras?: IntentExtra[];
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Wait for activity to launch */
  waitForLaunch?: boolean;
}

/**
 * Result of deep link navigation
 */
export interface AndroidDeepLinkResult {
  success: boolean;
  uri: string;
  deviceId?: string;
  details?: string;
  error?: string;
  durationMs: number;
}

/**
 * Open a deep link on Android device
 */
export async function openAndroidDeepLink(
  uri: string,
  options: AndroidDeepLinkOptions = {}
): Promise<AndroidDeepLinkResult> {
  const {
    deviceId,
    packageName,
    activityName,
    action = 'android.intent.action.VIEW',
    category,
    extras = [],
    timeoutMs = 10000,
    waitForLaunch = true,
  } = options;

  const startTime = Date.now();

  // Validate URI
  if (!isValidUri(uri)) {
    return {
      success: false,
      uri,
      error: 'Invalid URI format. Must be scheme://path or https://domain/path',
      durationMs: Date.now() - startTime,
    };
  }

  // Build adb command
  const args: string[] = [];

  // Target specific device if provided
  if (deviceId) {
    args.push('-s', deviceId);
  }

  // Shell command to start activity
  args.push('shell', 'am', 'start');

  // Wait for launch completion
  if (waitForLaunch) {
    args.push('-W');
  }

  // Intent action
  args.push('-a', action);

  // Intent data (the deep link URI)
  args.push('-d', escapeUri(uri));

  // Intent category
  if (category) {
    args.push('-c', category);
  }

  // Explicit component (package/activity)
  if (packageName && activityName) {
    args.push('-n', `${packageName}/${activityName}`);
  } else if (packageName) {
    args.push('-p', packageName);
  }

  // Add intent extras
  for (const extra of extras) {
    const extraArgs = buildExtraArgs(extra);
    args.push(...extraArgs);
  }

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      const error = parseAdbError(result.stderr, result.stdout);
      return {
        success: false,
        uri,
        deviceId,
        error,
        durationMs: Date.now() - startTime,
      };
    }

    // Check for activity launch success
    const details = parseAdbSuccess(result.stdout);

    return {
      success: true,
      uri,
      deviceId,
      details,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      uri,
      deviceId,
      error: `Failed to execute deep link: ${error}`,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Validate URI format
 */
export function isValidUri(uri: string): boolean {
  if (!uri || uri.length === 0) {
    return false;
  }

  // Must have scheme://
  const schemeMatch = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.+)$/);
  return schemeMatch !== null;
}

/**
 * Escape URI for shell command
 */
function escapeUri(uri: string): string {
  // Wrap in quotes to handle special characters
  // Escape existing quotes and dollar signs
  return `"${uri.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`;
}

/**
 * Build adb intent extra arguments
 */
function buildExtraArgs(extra: IntentExtra): string[] {
  const value = String(extra.value);

  switch (extra.type) {
    case 'string':
      return ['--es', extra.key, value];
    case 'int':
      return ['--ei', extra.key, value];
    case 'long':
      return ['--el', extra.key, value];
    case 'float':
      return ['--ef', extra.key, value];
    case 'boolean':
      return ['--ez', extra.key, value];
    case 'uri':
      return ['--eu', extra.key, value];
    default:
      return ['--es', extra.key, value];
  }
}

/**
 * Parse adb error message
 */
function parseAdbError(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`.toLowerCase();

  if (combined.includes('no devices') || combined.includes('no emulators')) {
    return 'No Android device connected. Use manage_env to boot an emulator first.';
  }

  if (combined.includes('activity not found') || combined.includes('unable to resolve')) {
    return 'No app can handle this deep link. Ensure the app is installed and properly configured.';
  }

  if (combined.includes('security exception')) {
    return 'Security exception: The deep link requires permissions or is not exported.';
  }

  if (combined.includes('offline')) {
    return 'Device is offline. Wait for it to come online or restart adb.';
  }

  if (combined.includes('error:')) {
    const match = combined.match(/error:\s*(.+?)(?:\n|$)/i);
    if (match) {
      return match[1].trim();
    }
  }

  return stderr || 'Unknown error occurred while opening deep link';
}

/**
 * Parse adb success message
 */
function parseAdbSuccess(stdout: string): string {
  // Look for activity launch info
  const startingMatch = stdout.match(/Starting:\s*Intent\s*\{([^}]+)\}/);
  if (startingMatch) {
    // Extract relevant info
    const intentInfo = startingMatch[1];
    const actMatch = intentInfo.match(/cmp=([^\s}]+)/);
    if (actMatch) {
      return `Launched activity: ${actMatch[1]}`;
    }
    return 'Deep link opened successfully';
  }

  // Check for status
  if (stdout.includes('Status: ok')) {
    return 'Deep link opened successfully';
  }

  return 'Deep link sent to device';
}

/**
 * Check if app with package name is installed
 */
export async function isAppInstalled(
  packageName: string,
  deviceId?: string
): Promise<boolean> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'pm', 'list', 'packages', packageName);

  try {
    const result = await executeShell('adb', args, { timeoutMs: 5000 });
    return result.stdout.includes(`package:${packageName}`);
  } catch {
    return false;
  }
}

/**
 * Get the current foreground activity
 */
export async function getCurrentActivity(deviceId?: string): Promise<string | undefined> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'dumpsys', 'activity', 'activities');

  try {
    const result = await executeShell('adb', args, { timeoutMs: 5000 });

    // Look for mResumedActivity or mFocusedActivity
    const match = result.stdout.match(/mResumedActivity.*?([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)/);
    if (match) {
      return match[1];
    }

    const focusMatch = result.stdout.match(/mFocusedActivity.*?([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)/);
    if (focusMatch) {
      return focusMatch[1];
    }
  } catch {
    // Ignore errors
  }

  return undefined;
}

/**
 * Send broadcast intent (for testing deep link receivers)
 */
export async function sendBroadcast(
  action: string,
  options: {
    deviceId?: string;
    packageName?: string;
    extras?: IntentExtra[];
    timeoutMs?: number;
  } = {}
): Promise<{ success: boolean; error?: string }> {
  const { deviceId, packageName, extras = [], timeoutMs = 5000 } = options;

  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'am', 'broadcast');
  args.push('-a', action);

  if (packageName) {
    args.push('-p', packageName);
  }

  for (const extra of extras) {
    args.push(...buildExtraArgs(extra));
  }

  try {
    const result = await executeShell('adb', args, { timeoutMs });
    return {
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
    };
  }
}
