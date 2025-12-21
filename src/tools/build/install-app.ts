/**
 * install_app Tool Handler
 * MCP tool for installing apps on devices/simulators
 */

import { Platform, isPlatform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import { installApk, listDevices as listAndroidDevices } from '../../platforms/android/adb.js';
import { installApp as installIOSApp, listDevices as listIOSDevices, getBootedDevice } from '../../platforms/ios/simctl.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for install_app tool
 */
export interface InstallAppArgs {
  /** Target platform */
  platform: string;
  /** Path to the app artifact (APK or .app bundle) */
  appPath: string;
  /** Target device ID or name (optional, uses first available if not specified) */
  deviceId?: string;
}

/**
 * Result of install operation
 */
export interface InstallResult {
  success: boolean;
  platform: Platform;
  deviceId: string;
  deviceName: string;
  appPath: string;
}

/**
 * Install app tool handler
 */
export async function installApp(args: InstallAppArgs): Promise<InstallResult> {
  const { platform, appPath, deviceId } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate app path
  if (!appPath || appPath.trim().length === 0) {
    throw Errors.invalidArguments('appPath is required');
  }

  if (platform === 'android') {
    return installAndroidApp(appPath, deviceId);
  } else {
    return installIOSApplication(appPath, deviceId);
  }
}

/**
 * Install Android APK
 */
async function installAndroidApp(
  apkPath: string,
  deviceId?: string
): Promise<InstallResult> {
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

  // Install the APK
  await installApk(apkPath, targetDevice.id);

  return {
    success: true,
    platform: 'android',
    deviceId: targetDevice.id,
    deviceName: targetDevice.name,
    appPath: apkPath,
  };
}

/**
 * Install iOS app
 */
async function installIOSApplication(
  appPath: string,
  deviceId?: string
): Promise<InstallResult> {
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

  // Install the app
  await installIOSApp(appPath, targetDevice.id);

  return {
    success: true,
    platform: 'ios',
    deviceId: targetDevice.id,
    deviceName: targetDevice.name,
    appPath,
  };
}

/**
 * Register the install_app tool
 */
export function registerInstallAppTool(): void {
  getToolRegistry().register(
    'install_app',
    {
      description: 'Install an app on a device or simulator. For Android, installs an APK. For iOS, installs an .app bundle.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          appPath: {
            type: 'string',
            description: 'Path to the app artifact (APK for Android, .app bundle for iOS)',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID or name (optional, uses first running device if not specified)',
          },
        },
        ['platform', 'appPath']
      ),
    },
    (args) => installApp(args as unknown as InstallAppArgs)
  );
}
