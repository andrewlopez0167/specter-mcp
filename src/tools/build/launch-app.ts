/**
 * launch_app Tool Handler
 * MCP tool for launching apps on devices/simulators
 */

import { Platform, isPlatform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import { launchApp as launchAndroidApp, listDevices as listAndroidDevices } from '../../platforms/android/adb.js';
import { launchApp as launchIOSApp, listDevices as listIOSDevices, getBootedDevice } from '../../platforms/ios/simctl.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for launch_app tool
 */
export interface LaunchAppArgs {
  /** Target platform */
  platform: string;
  /** Package name (Android) or bundle ID (iOS) */
  appId: string;
  /** Target device ID or name (optional, uses first available if not specified) */
  deviceId?: string;
  /** Clear app data before launch (Android only) */
  clearData?: boolean;
  /** Arguments to pass to the app (iOS only) */
  launchArguments?: string[];
}

/**
 * Result of launch operation
 */
export interface LaunchResult {
  success: boolean;
  platform: Platform;
  deviceId: string;
  deviceName: string;
  appId: string;
}

/**
 * Launch app tool handler
 */
export async function launchApp(args: LaunchAppArgs): Promise<LaunchResult> {
  const { platform, appId, deviceId, clearData = false, launchArguments } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate app ID
  if (!appId || appId.trim().length === 0) {
    throw Errors.invalidArguments('appId is required');
  }

  if (platform === 'android') {
    return launchAndroid(appId, deviceId, clearData);
  } else {
    return launchIOS(appId, deviceId, launchArguments);
  }
}

/**
 * Launch Android app
 */
async function launchAndroid(
  packageName: string,
  deviceId?: string,
  clearData?: boolean
): Promise<LaunchResult> {
  // Find device if not specified
  let targetDevice: { id: string; name: string };

  if (deviceId) {
    const devices = await listAndroidDevices();
    const found = devices.find(
      (d) => d.id === deviceId || d.name === deviceId || d.model === deviceId
    );
    if (!found) {
      throw Errors.deviceNotFound(deviceId, devices.map((d) => `${d.id} (${d.name})`));
    }
    targetDevice = { id: found.id, name: found.name };
  } else {
    const devices = await listAndroidDevices();
    const bootedDevice = devices.find((d) => d.status === 'booted');
    if (!bootedDevice) {
      throw Errors.invalidArguments('No running Android device found. Boot a device first.');
    }
    targetDevice = { id: bootedDevice.id, name: bootedDevice.name };
  }

  // Launch the app
  await launchAndroidApp(packageName, targetDevice.id, { clearData });

  return {
    success: true,
    platform: 'android',
    deviceId: targetDevice.id,
    deviceName: targetDevice.name,
    appId: packageName,
  };
}

/**
 * Launch iOS app
 */
async function launchIOS(
  bundleId: string,
  deviceId?: string,
  launchArguments?: string[]
): Promise<LaunchResult> {
  // Find device if not specified
  let targetDevice: { id: string; name: string };

  if (deviceId) {
    const devices = await listIOSDevices();
    const found = devices.find((d) => d.id === deviceId || d.name === deviceId);
    if (!found) {
      throw Errors.deviceNotFound(deviceId, devices.map((d) => `${d.id} (${d.name})`));
    }
    targetDevice = { id: found.id, name: found.name };
  } else {
    const bootedDevice = await getBootedDevice();
    if (!bootedDevice) {
      throw Errors.invalidArguments('No running iOS simulator found. Boot a simulator first.');
    }
    targetDevice = { id: bootedDevice.id, name: bootedDevice.name };
  }

  // Launch the app
  await launchIOSApp(bundleId, targetDevice.id, { arguments: launchArguments });

  return {
    success: true,
    platform: 'ios',
    deviceId: targetDevice.id,
    deviceName: targetDevice.name,
    appId: bundleId,
  };
}

/**
 * Register the launch_app tool
 */
export function registerLaunchAppTool(): void {
  getToolRegistry().register(
    'launch_app',
    {
      description: 'Launch an installed app on a device or simulator.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          appId: {
            type: 'string',
            description: 'Package name (Android) or bundle ID (iOS)',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID or name (optional, uses first running device if not specified)',
          },
          clearData: {
            type: 'boolean',
            description: 'Clear app data before launch (Android only, default: false)',
          },
          launchArguments: {
            type: 'array',
            items: { type: 'string' },
            description: 'Arguments to pass to the app (iOS only)',
          },
        },
        ['platform', 'appId']
      ),
    },
    (args) => launchApp(args as unknown as LaunchAppArgs)
  );
}
