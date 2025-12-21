/**
 * manage_env Tool Handler
 * MCP tool for booting, shutting down, and restarting devices
 */

import { isPlatform } from '../../models/constants.js';
import {
  Device,
  EnvironmentAction,
  EnvironmentResult,
  fromAndroidDevice,
  fromIOSDevice,
} from '../../models/device.js';
import { Errors } from '../../models/errors.js';
import {
  listDevices as listAndroidDevices,
  bootEmulator,
  shutdownEmulator,
  waitForDevice,
  listAvds,
} from '../../platforms/android/adb.js';
import {
  listDevices as listIOSDevices,
  bootSimulator,
  shutdownSimulator,
  getBootedDevice as getIOSBootedDevice,
} from '../../platforms/ios/simctl.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for manage_env tool
 */
export interface ManageEnvArgs {
  /** Action to perform */
  action: EnvironmentAction;
  /** Target platform */
  platform: string;
  /** Device ID or name */
  device?: string;
  /** Wait for device to be ready after boot */
  waitForReady?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Manage environment tool handler
 */
export async function manageEnv(args: ManageEnvArgs): Promise<EnvironmentResult> {
  const {
    action,
    platform,
    device,
    waitForReady = true,
    timeoutMs = 120000,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate action
  if (!['boot', 'shutdown', 'restart'].includes(action)) {
    throw Errors.invalidArguments(`Invalid action: ${action}. Must be 'boot', 'shutdown', or 'restart'`);
  }

  const startTime = Date.now();

  if (platform === 'android') {
    return manageAndroidEnv(action, device, waitForReady, timeoutMs, startTime);
  } else {
    return manageIOSEnv(action, device, waitForReady, timeoutMs, startTime);
  }
}

/**
 * Manage Android environment
 */
async function manageAndroidEnv(
  action: EnvironmentAction,
  deviceQuery: string | undefined,
  waitForReady: boolean,
  _timeoutMs: number,
  startTime: number
): Promise<EnvironmentResult> {
  // Get current devices
  const devices = await listAndroidDevices();
  let targetDevice: Device | undefined;

  if (deviceQuery) {
    // Find specific device
    const found = devices.find(
      (d) => d.id === deviceQuery || d.name === deviceQuery || d.model === deviceQuery
    );
    if (found) {
      targetDevice = fromAndroidDevice(found);
    }
  } else if (action !== 'boot') {
    // For shutdown/restart, use first booted device
    const booted = devices.find((d) => d.status === 'booted');
    if (booted) {
      targetDevice = fromAndroidDevice(booted);
    }
  }

  switch (action) {
    case 'boot': {
      // For boot, we need an AVD name
      let avdName = deviceQuery;

      if (!avdName) {
        // List available AVDs and use first one
        const avds = await listAvds();
        if (avds.length === 0) {
          return {
            success: false,
            action,
            error: 'No Android AVDs available. Create one in Android Studio.',
            durationMs: Date.now() - startTime,
          };
        }
        avdName = avds[0];
      }

      // Check if already running
      const existing = devices.find((d) => d.name === avdName || d.id.includes(avdName));
      if (existing && existing.status === 'booted') {
        return {
          success: true,
          action,
          device: fromAndroidDevice(existing),
          details: 'Device already running',
          durationMs: Date.now() - startTime,
        };
      }

      // Boot the emulator (fire and forget, returns void)
      await bootEmulator(avdName);

      // Wait for device to be ready if requested
      if (waitForReady) {
        // Find the booted device
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Initial wait
        const updatedDevices = await listAndroidDevices();
        const bootedDevice = updatedDevices.find((d) => d.status === 'booted');
        if (bootedDevice) {
          await waitForDevice(bootedDevice.id);
        }
      }

      // Get updated device info
      const finalDevices = await listAndroidDevices();
      const bootedDevice = finalDevices.find((d) => d.status === 'booted');

      return {
        success: true,
        action,
        device: bootedDevice ? fromAndroidDevice(bootedDevice) : undefined,
        details: `Booted emulator: ${avdName}`,
        durationMs: Date.now() - startTime,
      };
    }

    case 'shutdown': {
      if (!targetDevice) {
        return {
          success: false,
          action,
          error: 'No running Android device found to shutdown',
          durationMs: Date.now() - startTime,
        };
      }

      await shutdownEmulator(targetDevice.id);

      return {
        success: true,
        action,
        device: targetDevice,
        details: `Shutdown device: ${targetDevice.name}`,
        durationMs: Date.now() - startTime,
      };
    }

    case 'restart': {
      if (!targetDevice) {
        return {
          success: false,
          action,
          error: 'No running Android device found to restart',
          durationMs: Date.now() - startTime,
        };
      }

      // Shutdown then boot
      await shutdownEmulator(targetDevice.id);
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get AVD name from device
      const avdName = targetDevice.name;
      await bootEmulator(avdName);

      if (waitForReady) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const updatedDevices = await listAndroidDevices();
        const bootedDevice = updatedDevices.find((d) => d.status === 'booted');
        if (bootedDevice) {
          await waitForDevice(bootedDevice.id);
        }
      }

      // Get updated device info
      const finalDevices = await listAndroidDevices();
      const restartedDevice = finalDevices.find((d) => d.status === 'booted');

      return {
        success: true,
        action,
        device: restartedDevice ? fromAndroidDevice(restartedDevice) : targetDevice,
        details: `Restarted device: ${targetDevice.name}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Manage iOS environment
 */
async function manageIOSEnv(
  action: EnvironmentAction,
  deviceQuery: string | undefined,
  waitForReady: boolean,
  _timeoutMs: number,
  startTime: number
): Promise<EnvironmentResult> {
  // Get current devices
  const devices = await listIOSDevices();
  let targetDevice: Device | undefined;

  if (deviceQuery) {
    // Find specific device
    const found = devices.find((d) => d.id === deviceQuery || d.name === deviceQuery);
    if (found) {
      targetDevice = fromIOSDevice({
        id: found.id,
        name: found.name,
        status: found.status,
        runtime: found.runtime,
      });
    }
  } else if (action !== 'boot') {
    // For shutdown/restart, use first booted device
    const booted = await getIOSBootedDevice();
    if (booted) {
      targetDevice = fromIOSDevice({
        id: booted.id,
        name: booted.name,
        status: booted.status,
        runtime: booted.runtime,
      });
    }
  }

  switch (action) {
    case 'boot': {
      let udid = deviceQuery;

      if (!udid) {
        // Find first available simulator
        const available = devices.find((d) => d.isAvailable !== false);
        if (!available) {
          return {
            success: false,
            action,
            error: 'No iOS simulators available',
            durationMs: Date.now() - startTime,
          };
        }
        udid = available.id;
      }

      // Check if already running
      const existing = devices.find((d) => d.id === udid || d.name === udid);
      if (existing && existing.status.toLowerCase() === 'booted') {
        return {
          success: true,
          action,
          device: fromIOSDevice({
            id: existing.id,
            name: existing.name,
            status: existing.status,
            runtime: existing.runtime,
          }),
          details: 'Simulator already running',
          durationMs: Date.now() - startTime,
        };
      }

      // Get UDID if we have a name
      const targetSim = devices.find((d) => d.id === udid || d.name === udid);
      if (!targetSim) {
        return {
          success: false,
          action,
          error: `iOS simulator not found: ${udid}`,
          durationMs: Date.now() - startTime,
        };
      }

      // Boot the simulator
      await bootSimulator(targetSim.id);

      // Wait for device to be ready (simple delay since simctl boot is synchronous)
      if (waitForReady) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      return {
        success: true,
        action,
        device: fromIOSDevice({
          id: targetSim.id,
          name: targetSim.name,
          status: 'Booted',
          runtime: targetSim.runtime,
        }),
        details: `Booted simulator: ${targetSim.name}`,
        durationMs: Date.now() - startTime,
      };
    }

    case 'shutdown': {
      if (!targetDevice) {
        return {
          success: false,
          action,
          error: 'No running iOS simulator found to shutdown',
          durationMs: Date.now() - startTime,
        };
      }

      await shutdownSimulator(targetDevice.id);

      return {
        success: true,
        action,
        device: targetDevice,
        details: `Shutdown simulator: ${targetDevice.name}`,
        durationMs: Date.now() - startTime,
      };
    }

    case 'restart': {
      if (!targetDevice) {
        return {
          success: false,
          action,
          error: 'No running iOS simulator found to restart',
          durationMs: Date.now() - startTime,
        };
      }

      // Shutdown then boot
      await shutdownSimulator(targetDevice.id);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await bootSimulator(targetDevice.id);

      if (waitForReady) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      return {
        success: true,
        action,
        device: { ...targetDevice, status: 'booted' },
        details: `Restarted simulator: ${targetDevice.name}`,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Register the manage_env tool
 */
export function registerManageEnvTool(): void {
  getToolRegistry().register(
    'manage_env',
    {
      description:
        'Manage device environment: boot, shutdown, or restart emulators and simulators.',
      inputSchema: createInputSchema(
        {
          action: {
            type: 'string',
            enum: ['boot', 'shutdown', 'restart'],
            description: 'Action to perform',
          },
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          device: {
            type: 'string',
            description: 'Device ID, name, or AVD name (optional, uses first available)',
          },
          waitForReady: {
            type: 'boolean',
            description: 'Wait for device to be fully ready after boot (default: true)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 120000)',
          },
        },
        ['action', 'platform']
      ),
    },
    (args) => manageEnv(args as unknown as ManageEnvArgs)
  );
}
