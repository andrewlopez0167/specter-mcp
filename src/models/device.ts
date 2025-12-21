/**
 * Device Models
 * Unified device representation across Android and iOS
 */

import { Platform } from './constants.js';

/**
 * Device status
 */
export type DeviceStatus = 'booted' | 'shutdown' | 'booting' | 'unknown';

/**
 * Device type
 */
export type DeviceType = 'emulator' | 'simulator' | 'physical';

/**
 * Unified device representation
 */
export interface Device {
  /** Unique device identifier (UDID for iOS, serial for Android) */
  id: string;
  /** Device name */
  name: string;
  /** Platform */
  platform: Platform;
  /** Device type */
  type: DeviceType;
  /** Current status */
  status: DeviceStatus;
  /** OS version */
  osVersion?: string;
  /** Device model */
  model?: string;
  /** Screen size if known */
  screenSize?: {
    width: number;
    height: number;
  };
  /** Whether device is the default/selected device */
  isDefault?: boolean;
}

/**
 * Environment action type
 */
export type EnvironmentAction = 'boot' | 'shutdown' | 'restart';

/**
 * Environment operation result
 */
export interface EnvironmentResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Action performed */
  action: EnvironmentAction;
  /** Target device */
  device?: Device;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Additional details */
  details?: string;
}

/**
 * Clean project options
 */
export interface CleanProjectOptions {
  /** Project root path */
  projectPath: string;
  /** Clean Gradle caches */
  cleanGradle?: boolean;
  /** Clean Xcode DerivedData */
  cleanDerivedData?: boolean;
  /** Clean build directories */
  cleanBuild?: boolean;
  /** Clean node_modules */
  cleanNodeModules?: boolean;
  /** Clean CocoaPods */
  cleanPods?: boolean;
  /** Specific module to clean (for Gradle) */
  module?: string;
}

/**
 * Clean project result
 */
export interface CleanResult {
  /** Overall success */
  success: boolean;
  /** Items cleaned */
  cleaned: Array<{
    type: string;
    path: string;
    success: boolean;
    error?: string;
  }>;
  /** Total space freed (bytes, if calculable) */
  spaceFreedBytes?: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Convert Android device to unified Device
 */
export function fromAndroidDevice(android: {
  id: string;
  name: string;
  status: string;
  model?: string;
  type?: string;
}): Device {
  return {
    id: android.id,
    name: android.name,
    platform: 'android',
    type: android.type === 'emulator' ? 'emulator' : 'physical',
    status: mapStatus(android.status),
    model: android.model,
  };
}

/**
 * Convert iOS device to unified Device
 */
export function fromIOSDevice(ios: {
  id: string;
  name: string;
  status: string;
  runtime?: string;
  isAvailable?: boolean;
}): Device {
  // Extract OS version from runtime (e.g., "iOS 17.0" from "com.apple.CoreSimulator.SimRuntime.iOS-17-0")
  let osVersion: string | undefined;
  if (ios.runtime) {
    const versionMatch = ios.runtime.match(/(\d+)-(\d+)(?:-(\d+))?$/);
    if (versionMatch) {
      osVersion = `${versionMatch[1]}.${versionMatch[2]}${versionMatch[3] ? '.' + versionMatch[3] : ''}`;
    }
  }

  return {
    id: ios.id,
    name: ios.name,
    platform: 'ios',
    type: 'simulator', // simctl only works with simulators
    status: mapStatus(ios.status),
    osVersion,
  };
}

/**
 * Map platform-specific status to unified status
 */
function mapStatus(status: string): DeviceStatus {
  const lower = status.toLowerCase();
  if (lower === 'booted' || lower === 'online' || lower === 'device') {
    return 'booted';
  }
  if (lower === 'shutdown' || lower === 'offline') {
    return 'shutdown';
  }
  if (lower === 'booting' || lower === 'starting') {
    return 'booting';
  }
  return 'unknown';
}

/**
 * Filter devices by status
 */
export function filterDevicesByStatus(
  devices: Device[],
  status: DeviceStatus
): Device[] {
  return devices.filter((d) => d.status === status);
}

/**
 * Find device by ID or name
 */
export function findDevice(
  devices: Device[],
  query: string
): Device | undefined {
  // Exact ID match
  const byId = devices.find((d) => d.id === query);
  if (byId) return byId;

  // Exact name match
  const byName = devices.find((d) => d.name === query);
  if (byName) return byName;

  // Partial name match (case insensitive)
  const lowerQuery = query.toLowerCase();
  return devices.find((d) => d.name.toLowerCase().includes(lowerQuery));
}

/**
 * Get first booted device for platform
 */
export function getBootedDevice(
  devices: Device[],
  platform?: Platform
): Device | undefined {
  const filtered = platform
    ? devices.filter((d) => d.platform === platform)
    : devices;

  return filtered.find((d) => d.status === 'booted');
}

/**
 * Create device summary for AI
 */
export function createDeviceSummary(devices: Device[]): string {
  if (devices.length === 0) {
    return 'No devices found';
  }

  const android = devices.filter((d) => d.platform === 'android');
  const ios = devices.filter((d) => d.platform === 'ios');

  const lines: string[] = [`Total: ${devices.length} devices`];

  if (android.length > 0) {
    const booted = android.filter((d) => d.status === 'booted');
    lines.push(`Android: ${android.length} (${booted.length} running)`);
    for (const device of booted) {
      lines.push(`  - ${device.name} (${device.id})`);
    }
  }

  if (ios.length > 0) {
    const booted = ios.filter((d) => d.status === 'booted');
    lines.push(`iOS: ${ios.length} (${booted.length} running)`);
    for (const device of booted) {
      lines.push(`  - ${device.name} (${device.id})`);
    }
  }

  return lines.join('\n');
}
