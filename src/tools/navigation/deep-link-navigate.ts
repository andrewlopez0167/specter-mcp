/**
 * deep_link_navigate Tool Handler
 * MCP tool for navigating to specific screens via deep links
 */

import { isPlatform, Platform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import {
  openAndroidDeepLink,
  isValidUri as isValidAndroidUri,
  IntentExtra,
} from '../../platforms/android/deep-link.js';
import {
  openIOSDeepLink,
  isValidUri as isValidIOSUri,
} from '../../platforms/ios/deep-link.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for deep_link_navigate tool
 */
export interface DeepLinkNavigateArgs {
  /** Deep link URI to navigate to */
  uri: string;
  /** Target platform */
  platform: string;
  /** Device ID (optional, uses first available) */
  deviceId?: string;
  /** Package name for Android (helps target specific app) */
  packageName?: string;
  /** Bundle ID for iOS (helps target specific app) */
  bundleId?: string;
  /** Wait time after navigation in milliseconds */
  waitAfterMs?: number;
  /** Intent extras for Android deep links */
  extras?: Array<{
    type: 'string' | 'int' | 'boolean';
    key: string;
    value: string | number | boolean;
  }>;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Result of deep link navigation
 */
export interface DeepLinkResult {
  /** Whether navigation was successful */
  success: boolean;
  /** Target platform */
  platform: Platform;
  /** The URI that was opened */
  uri: string;
  /** Device ID used */
  deviceId?: string;
  /** Device name (if available) */
  deviceName?: string;
  /** Success details */
  details?: string;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Navigate via deep link tool handler
 */
export async function deepLinkNavigate(args: DeepLinkNavigateArgs): Promise<DeepLinkResult> {
  const {
    uri,
    platform,
    deviceId,
    packageName,
    bundleId,
    waitAfterMs = 1000,
    extras,
    timeoutMs = 15000,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate URI
  if (!uri || uri.trim().length === 0) {
    throw Errors.invalidArguments('URI is required');
  }

  // Route to platform-specific handler
  if (platform === 'android') {
    return navigateAndroid(uri, {
      deviceId,
      packageName,
      extras,
      timeoutMs,
      waitAfterMs,
    });
  } else {
    return navigateIOS(uri, {
      deviceId,
      bundleId,
      timeoutMs,
      waitAfterMs,
    });
  }
}

/**
 * Navigate on Android device
 */
async function navigateAndroid(
  uri: string,
  options: {
    deviceId?: string;
    packageName?: string;
    extras?: DeepLinkNavigateArgs['extras'];
    timeoutMs: number;
    waitAfterMs: number;
  }
): Promise<DeepLinkResult> {
  const startTime = Date.now();

  // Validate URI format
  if (!isValidAndroidUri(uri)) {
    return {
      success: false,
      platform: 'android',
      uri,
      error: 'Invalid URI format. Must be scheme://path or https://domain/path',
      durationMs: Date.now() - startTime,
    };
  }

  // Convert extras to Android format
  const intentExtras: IntentExtra[] = (options.extras || []).map((e) => ({
    type: e.type === 'int' ? 'int' : e.type === 'boolean' ? 'boolean' : 'string',
    key: e.key,
    value: e.value,
  }));

  // Open deep link
  const result = await openAndroidDeepLink(uri, {
    deviceId: options.deviceId,
    packageName: options.packageName,
    extras: intentExtras,
    timeoutMs: options.timeoutMs,
    waitForLaunch: true,
  });

  // Wait after navigation if successful
  if (result.success && options.waitAfterMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, options.waitAfterMs));
  }

  return {
    success: result.success,
    platform: 'android',
    uri: result.uri,
    deviceId: result.deviceId,
    details: result.details,
    error: result.error,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Navigate on iOS simulator
 */
async function navigateIOS(
  uri: string,
  options: {
    deviceId?: string;
    bundleId?: string;
    timeoutMs: number;
    waitAfterMs: number;
  }
): Promise<DeepLinkResult> {
  const startTime = Date.now();

  // Validate URI format
  if (!isValidIOSUri(uri)) {
    return {
      success: false,
      platform: 'ios',
      uri,
      error: 'Invalid URI format. Must be scheme://path or https://domain/path',
      durationMs: Date.now() - startTime,
    };
  }

  // Open deep link
  const result = await openIOSDeepLink(uri, {
    deviceId: options.deviceId || 'booted',
    timeoutMs: options.timeoutMs,
    waitAfterMs: options.waitAfterMs,
  });

  return {
    success: result.success,
    platform: 'ios',
    uri: result.uri,
    deviceId: result.deviceId,
    deviceName: result.deviceName,
    details: result.details,
    error: result.error,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Generate AI-friendly output for navigation result
 */
export function formatNavigationResult(result: DeepLinkResult): string {
  const lines: string[] = [];

  if (result.success) {
    lines.push(`## Deep Link Navigation: Success`);
    lines.push(``);
    lines.push(`**URI**: \`${result.uri}\``);
    lines.push(`**Platform**: ${result.platform}`);
    if (result.deviceId) {
      lines.push(`**Device**: ${result.deviceName || result.deviceId}`);
    }
    if (result.details) {
      lines.push(`**Details**: ${result.details}`);
    }
    lines.push(`**Duration**: ${result.durationMs}ms`);
  } else {
    lines.push(`## Deep Link Navigation: Failed`);
    lines.push(``);
    lines.push(`**URI**: \`${result.uri}\``);
    lines.push(`**Platform**: ${result.platform}`);
    lines.push(`**Error**: ${result.error}`);
    lines.push(``);
    lines.push(`### Troubleshooting`);
    lines.push(``);

    if (result.error?.includes('No device') || result.error?.includes('No simulator')) {
      lines.push(`- Boot a device first using \`manage_env\` with action: "boot"`);
    }
    if (result.error?.includes('not installed') || result.error?.includes('No app')) {
      lines.push(`- Ensure the app is installed on the device`);
      lines.push(`- Verify the URL scheme is registered in the app`);
    }
    if (result.error?.includes('Invalid URI')) {
      lines.push(`- Check URI format: should be \`scheme://path\` or \`https://domain/path\``);
    }
  }

  return lines.join('\n');
}

/**
 * Register the deep_link_navigate tool
 */
export function registerDeepLinkNavigateTool(): void {
  getToolRegistry().register(
    'deep_link_navigate',
    {
      description:
        'Navigate to a specific screen in the app using a deep link or Universal Link. ' +
        'Supports custom URL schemes (myapp://path) and HTTPS URLs for App Links/Universal Links.',
      inputSchema: createInputSchema(
        {
          uri: {
            type: 'string',
            description:
              'Deep link URI to navigate to (e.g., myapp://home/profile or https://example.com/app/products/123)',
          },
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          deviceId: {
            type: 'string',
            description:
              'Device ID (optional, uses first available). For Android: emulator-5554. For iOS: UDID or "booted"',
          },
          packageName: {
            type: 'string',
            description: 'Android package name to target specific app (e.g., com.example.myapp)',
          },
          bundleId: {
            type: 'string',
            description: 'iOS bundle ID to target specific app (e.g., com.example.myapp)',
          },
          waitAfterMs: {
            type: 'number',
            description: 'Time to wait after navigation in milliseconds (default: 1000)',
          },
          extras: {
            type: 'array',
            description: 'Android intent extras to pass with the deep link',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 15000)',
          },
        },
        ['uri', 'platform']
      ),
    },
    async (args) => {
      const result = await deepLinkNavigate(args as unknown as DeepLinkNavigateArgs);
      return {
        ...result,
        formattedOutput: formatNavigationResult(result),
      };
    }
  );
}
