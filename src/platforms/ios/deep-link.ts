/**
 * iOS Deep Link Handler
 * Opens deep links and Universal Links on iOS simulators via simctl
 */

import { executeShell } from '../../utils/shell.js';
import { getBootedDevice } from './simctl.js';

/**
 * Options for opening deep link on iOS
 */
export interface IOSDeepLinkOptions {
  /** Device UDID (default: 'booted' for any booted simulator) */
  deviceId?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Wait after opening for screen transition */
  waitAfterMs?: number;
}

/**
 * Result of deep link navigation
 */
export interface IOSDeepLinkResult {
  success: boolean;
  uri: string;
  deviceId?: string;
  deviceName?: string;
  details?: string;
  error?: string;
  durationMs: number;
}

/**
 * Open a deep link on iOS simulator
 */
export async function openIOSDeepLink(
  uri: string,
  options: IOSDeepLinkOptions = {}
): Promise<IOSDeepLinkResult> {
  const {
    deviceId = 'booted',
    timeoutMs = 10000,
    waitAfterMs = 0,
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

  // If using 'booted', try to get the actual device info
  let resolvedDeviceId = deviceId;
  let deviceName: string | undefined;

  if (deviceId === 'booted') {
    const bootedDevice = await getBootedDevice();
    if (bootedDevice) {
      resolvedDeviceId = bootedDevice.id;
      deviceName = bootedDevice.name;
    }
  }

  // Build simctl command
  const args = ['simctl', 'openurl', resolvedDeviceId, uri];

  try {
    const result = await executeShell('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      const error = parseSimctlError(result.stderr, result.stdout);
      return {
        success: false,
        uri,
        deviceId: resolvedDeviceId,
        deviceName,
        error,
        durationMs: Date.now() - startTime,
      };
    }

    // Wait after opening if requested
    if (waitAfterMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitAfterMs));
    }

    return {
      success: true,
      uri,
      deviceId: resolvedDeviceId,
      deviceName,
      details: 'Deep link opened successfully',
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      uri,
      deviceId: resolvedDeviceId,
      deviceName,
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
  const schemeMatch = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/(.*)$/);
  return schemeMatch !== null;
}

/**
 * Parse simctl error message
 */
function parseSimctlError(stderr: string, stdout: string): string {
  const combined = `${stderr}\n${stdout}`.toLowerCase();

  if (combined.includes('no devices are booted')) {
    return 'No iOS simulator is currently booted. Use manage_env to boot a simulator first.';
  }

  if (combined.includes('invalid device')) {
    return 'Invalid device ID. Use list_devices to see available simulators.';
  }

  if (combined.includes('unable to lookup')) {
    return 'Device not found. Ensure the simulator exists and try again.';
  }

  if (combined.includes('error was encountered')) {
    return 'Failed to open URL. The app may not be installed or may not handle this URL scheme.';
  }

  if (combined.includes('malformed')) {
    return 'Malformed URL. Check the URI format.';
  }

  return stderr || 'Unknown error occurred while opening deep link';
}

/**
 * Check if a specific URL scheme is registered on the device
 * Note: This is a heuristic check - simctl doesn't provide direct scheme querying
 */
export async function checkUrlScheme(
  scheme: string,
  deviceId: string = 'booted'
): Promise<{ registered: boolean; bundleId?: string }> {
  // Unfortunately simctl doesn't provide a way to query registered URL schemes
  // We can try to find apps that might handle it by looking at installed apps
  // This is a best-effort approach

  try {
    const result = await executeShell('xcrun', ['simctl', 'listapps', deviceId], {
      timeoutMs: 10000,
    });

    if (result.exitCode !== 0) {
      return { registered: false };
    }

    // Very basic heuristic: check if any app's bundle ID contains the scheme
    // This is not reliable but better than nothing
    const schemeBase = scheme.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (result.stdout.toLowerCase().includes(schemeBase)) {
      return { registered: true };
    }

    return { registered: false };
  } catch {
    return { registered: false };
  }
}

/**
 * Open URL with specific app (if bundle ID known)
 * Uses launch with URL argument approach
 */
export async function openUrlWithApp(
  uri: string,
  bundleId: string,
  deviceId: string = 'booted',
  timeoutMs: number = 10000
): Promise<IOSDeepLinkResult> {
  const startTime = Date.now();

  // First launch the app
  const launchResult = await executeShell(
    'xcrun',
    ['simctl', 'launch', deviceId, bundleId, uri],
    { timeoutMs }
  );

  if (launchResult.exitCode !== 0) {
    return {
      success: false,
      uri,
      deviceId,
      error: `Failed to launch app: ${launchResult.stderr}`,
      durationMs: Date.now() - startTime,
    };
  }

  return {
    success: true,
    uri,
    deviceId,
    details: `Opened with ${bundleId}`,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Send push notification that triggers deep link
 * Useful for testing notification-based deep links
 */
export async function sendPushNotification(
  bundleId: string,
  _payload: PushNotificationPayload,
  deviceId: string = 'booted'
): Promise<{ success: boolean; error?: string }> {
  // Note: simctl push requires a JSON file path or stdin input
  // This is a simplified implementation that sends an empty notification
  // Full implementation would need file writing or stdin support

  try {
    const result = await executeShell(
      'xcrun',
      ['simctl', 'push', deviceId, bundleId, '-'],
      { timeoutMs: 5000 }
    );

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

/**
 * Push notification payload structure
 */
export interface PushNotificationPayload {
  aps?: {
    alert?: string | { title?: string; body?: string };
    badge?: number;
    sound?: string;
    'content-available'?: number;
    'mutable-content'?: number;
    category?: string;
  };
  alert?: string;
  customData?: Record<string, unknown>;
}

/**
 * Get foreground app's bundle ID
 */
export async function getForegroundApp(
  deviceId: string = 'booted'
): Promise<string | undefined> {
  try {
    // Use spawn_process to check what's in foreground
    // This is done through privacy-related logs
    const result = await executeShell(
      'xcrun',
      ['simctl', 'spawn', deviceId, 'launchctl', 'list'],
      { timeoutMs: 5000 }
    );

    // Parse launchctl output for app bundles
    // This is a basic approach - may need refinement
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      if (line.includes('UIKitApplication')) {
        const match = line.match(/UIKitApplication:([^\[]+)/);
        if (match) {
          return match[1].trim();
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return undefined;
}

/**
 * Terminate app before opening deep link (for clean state testing)
 */
export async function terminateApp(
  bundleId: string,
  deviceId: string = 'booted'
): Promise<boolean> {
  try {
    const result = await executeShell(
      'xcrun',
      ['simctl', 'terminate', deviceId, bundleId],
      { timeoutMs: 5000 }
    );
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Open deep link with clean app state
 */
export async function openDeepLinkClean(
  uri: string,
  bundleId: string,
  deviceId: string = 'booted'
): Promise<IOSDeepLinkResult> {
  const startTime = Date.now();

  // Terminate app first
  await terminateApp(bundleId, deviceId);

  // Wait a bit for termination
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Open the deep link
  const result = await openIOSDeepLink(uri, { deviceId });

  return {
    ...result,
    durationMs: Date.now() - startTime,
  };
}
