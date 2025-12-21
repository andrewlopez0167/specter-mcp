/**
 * list_devices Tool Handler
 * MCP tool for listing available devices across platforms
 */

import { isPlatform } from '../../models/constants.js';
import {
  Device,
  DeviceStatus,
  fromAndroidDevice,
  fromIOSDevice,
  filterDevicesByStatus,
  createDeviceSummary,
} from '../../models/device.js';
import { listDevices as listAndroidDevices, listAvds } from '../../platforms/android/adb.js';
import { listDevices as listIOSDevices } from '../../platforms/ios/simctl.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for list_devices tool
 */
export interface ListDevicesArgs {
  /** Platform filter (optional, lists all if not specified) */
  platform?: string;
  /** Status filter */
  status?: DeviceStatus;
  /** Include available AVDs (Android) */
  includeAvds?: boolean;
  /** Include unavailable simulators (iOS) */
  includeUnavailable?: boolean;
}

/**
 * Result structure for list_devices
 */
export interface ListDevicesResult {
  /** List of devices */
  devices: Device[];
  /** Summary for AI consumption */
  summary: string;
  /** Available AVDs (if requested) */
  availableAvds?: string[];
}

/**
 * List devices tool handler
 */
export async function listDevices(args: ListDevicesArgs): Promise<ListDevicesResult> {
  const {
    platform,
    status,
    includeAvds = false,
    includeUnavailable = false,
  } = args;

  // Validate platform if specified
  if (platform && !isPlatform(platform)) {
    // If platform is specified but invalid, return empty
    return {
      devices: [],
      summary: `Invalid platform: ${platform}. Must be 'android' or 'ios'.`,
    };
  }

  const devices: Device[] = [];
  let availableAvds: string[] | undefined;

  // Get Android devices
  if (!platform || platform === 'android') {
    try {
      const androidDevices = await listAndroidDevices();
      for (const ad of androidDevices) {
        devices.push(fromAndroidDevice(ad));
      }

      // Get available AVDs if requested
      if (includeAvds) {
        availableAvds = await listAvds();
      }
    } catch (error) {
      console.error('[list_devices] Failed to list Android devices:', error);
    }
  }

  // Get iOS devices
  if (!platform || platform === 'ios') {
    try {
      const iosDevices = await listIOSDevices();
      for (const id of iosDevices) {
        // Skip unavailable if not requested
        if (!includeUnavailable && id.isAvailable === false) {
          continue;
        }
        devices.push(fromIOSDevice({
          id: id.id,
          name: id.name,
          status: id.status,
          runtime: id.runtime,
          isAvailable: id.isAvailable,
        }));
      }
    } catch (error) {
      console.error('[list_devices] Failed to list iOS devices:', error);
    }
  }

  // Filter by status if specified
  const filteredDevices = status
    ? filterDevicesByStatus(devices, status)
    : devices;

  // Create summary
  const summary = createDeviceSummary(filteredDevices);

  return {
    devices: filteredDevices,
    summary,
    availableAvds,
  };
}

/**
 * Register the list_devices tool
 */
export function registerListDevicesTool(): void {
  getToolRegistry().register(
    'list_devices',
    {
      description:
        'List available devices (emulators, simulators, physical devices). Returns device details including status and platform.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Filter by platform (optional, lists all if not specified)',
          },
          status: {
            type: 'string',
            enum: ['booted', 'shutdown', 'booting', 'unknown'],
            description: 'Filter by device status',
          },
          includeAvds: {
            type: 'boolean',
            description: 'Include list of available Android AVDs (default: false)',
          },
          includeUnavailable: {
            type: 'boolean',
            description: 'Include unavailable iOS simulators (default: false)',
          },
        },
        []
      ),
    },
    (args) => listDevices(args as unknown as ListDevicesArgs)
  );
}
