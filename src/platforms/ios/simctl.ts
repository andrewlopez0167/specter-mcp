/**
 * iOS Simulator Control (simctl) wrapper
 * Provides type-safe interface to common simctl commands
 */
import { executeShell, executeShellOrThrow, commandExists } from '../../utils/shell.js';
import { Errors } from '../../models/errors.js';
import { DeviceStatus, DEFAULTS } from '../../models/constants.js';

export interface iOSDevice {
  id: string; // UDID
  name: string;
  status: DeviceStatus;
  runtime: string;
  deviceType: string;
  isAvailable: boolean;
}

interface SimctlDevice {
  udid: string;
  name: string;
  state: string;
  isAvailable: boolean;
  deviceTypeIdentifier: string;
}

interface SimctlRuntime {
  identifier: string;
  name: string;
  version: string;
}

interface SimctlListOutput {
  devices: Record<string, SimctlDevice[]>;
  runtimes: SimctlRuntime[];
}

/**
 * Check if simctl is available (requires macOS with Xcode)
 */
export async function isSimctlAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }
  return commandExists('xcrun');
}

/**
 * List all iOS simulators
 */
export async function listDevices(): Promise<iOSDevice[]> {
  const result = await executeShell('xcrun', ['simctl', 'list', 'devices', '--json']);

  if (result.exitCode !== 0) {
    throw Errors.shellExecutionFailed('xcrun simctl list', result.stderr);
  }

  try {
    const data: SimctlListOutput = JSON.parse(result.stdout);
    const devices: iOSDevice[] = [];

    for (const [runtime, runtimeDevices] of Object.entries(data.devices)) {
      for (const device of runtimeDevices) {
        let status: DeviceStatus = 'unknown';
        if (device.state === 'Booted') status = 'booted';
        else if (device.state === 'Shutdown') status = 'shutdown';
        else if (device.state === 'Booting') status = 'booting';

        devices.push({
          id: device.udid,
          name: device.name,
          status,
          runtime: runtime.replace('com.apple.CoreSimulator.SimRuntime.', ''),
          deviceType: device.deviceTypeIdentifier.split('.').pop() ?? '',
          isAvailable: device.isAvailable,
        });
      }
    }

    return devices;
  } catch (error) {
    throw Errors.shellExecutionFailed('xcrun simctl list', 'Failed to parse JSON output');
  }
}

/**
 * Get a specific device by name or UDID
 */
export async function getDevice(nameOrId: string): Promise<iOSDevice | null> {
  const devices = await listDevices();
  return devices.find(
    (d) => d.id === nameOrId || d.name === nameOrId
  ) ?? null;
}

/**
 * Get the currently booted device, or null if none
 */
export async function getBootedDevice(): Promise<iOSDevice | null> {
  const devices = await listDevices();
  return devices.find((d) => d.status === 'booted') ?? null;
}

/**
 * Boot a simulator
 */
export async function bootSimulator(udid: string): Promise<void> {
  await executeShellOrThrow('xcrun', ['simctl', 'boot', udid], {
    timeoutMs: DEFAULTS.DEVICE_BOOT_TIMEOUT_MS,
  });

  // Wait for the simulator to be fully booted
  await waitForDevice(udid);
}

/**
 * Wait for a simulator to be ready
 */
export async function waitForDevice(
  udid: string,
  timeoutMs: number = DEFAULTS.DEVICE_BOOT_TIMEOUT_MS
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const device = await getDevice(udid);
    if (device?.status === 'booted') {
      // Additional check: wait for springboard
      const result = await executeShell('xcrun', [
        'simctl', 'spawn', udid, 'launchctl', 'print', 'system'
      ], { silent: true });

      if (result.exitCode === 0) {
        return;
      }
    }
    await delay(1000);
  }

  throw Errors.timeout('Simulator boot', timeoutMs);
}

/**
 * Shutdown a simulator
 */
export async function shutdownSimulator(udid: string): Promise<void> {
  await executeShellOrThrow('xcrun', ['simctl', 'shutdown', udid]);
}

/**
 * Erase simulator data
 */
export async function eraseSimulator(udid: string): Promise<void> {
  // Must be shutdown first
  const device = await getDevice(udid);
  if (device?.status === 'booted') {
    await shutdownSimulator(udid);
  }

  await executeShellOrThrow('xcrun', ['simctl', 'erase', udid]);
}

/**
 * Take a screenshot
 */
export async function takeScreenshot(udid: string): Promise<Buffer> {
  const tmpPath = `/tmp/specter-screenshot-${Date.now()}.png`;

  await executeShellOrThrow('xcrun', ['simctl', 'io', udid, 'screenshot', tmpPath]);

  // Read the file
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(tmpPath);
  await fs.unlink(tmpPath);

  return buffer;
}

/**
 * Get app container path
 */
export async function getAppContainer(
  udid: string,
  bundleId: string,
  containerType: 'app' | 'data' | 'groups' = 'data'
): Promise<string> {
  const result = await executeShellOrThrow('xcrun', [
    'simctl', 'get_app_container', udid, bundleId, containerType
  ]);

  return result.stdout.trim();
}

/**
 * Open a deep link
 */
export async function openDeepLink(uri: string, udid: string): Promise<void> {
  await executeShellOrThrow('xcrun', ['simctl', 'openurl', udid, uri]);
}

/**
 * Install an app bundle
 */
export async function installApp(appPath: string, udid: string): Promise<void> {
  await executeShellOrThrow('xcrun', ['simctl', 'install', udid, appPath], {
    timeoutMs: 120000,
  });
}

/**
 * Uninstall an app
 */
export async function uninstallApp(bundleId: string, udid: string): Promise<void> {
  await executeShellOrThrow('xcrun', ['simctl', 'uninstall', udid, bundleId]);
}

/**
 * Launch an app
 */
export async function launchApp(
  bundleId: string,
  udid: string,
  options?: { arguments?: string[] }
): Promise<void> {
  const args = ['simctl', 'launch', udid, bundleId];

  if (options?.arguments) {
    args.push(...options.arguments);
  }

  await executeShellOrThrow('xcrun', args);
}

/**
 * Terminate an app
 */
export async function terminateApp(bundleId: string, udid: string): Promise<void> {
  await executeShell('xcrun', ['simctl', 'terminate', udid, bundleId]);
}

/**
 * Get log stream (returns a snapshot, not continuous stream)
 */
export async function getLogs(
  udid: string,
  options?: {
    predicate?: string;
    level?: string;
    limit?: number;
  }
): Promise<string> {
  // Use log show for historical logs
  const args = ['simctl', 'spawn', udid, 'log', 'show', '--style', 'compact'];

  if (options?.predicate) {
    args.push('--predicate', options.predicate);
  }

  if (options?.level) {
    args.push('--level', options.level);
  }

  // Limit output
  args.push('--last', '1m'); // Last minute of logs

  const result = await executeShell('xcrun', args, { timeoutMs: 10000 });

  let output = result.stdout;

  if (options?.limit) {
    const lines = output.split('\n');
    output = lines.slice(-options.limit).join('\n');
  }

  return output;
}

/**
 * Get crash logs directory for a device
 */
export function getCrashLogsDir(udid: string): string {
  const home = process.env.HOME ?? '';
  return `${home}/Library/Developer/CoreSimulator/Devices/${udid}/data/Library/Logs/CrashReporter`;
}

/**
 * Get global crash logs directory
 */
export function getGlobalCrashLogsDir(): string {
  const home = process.env.HOME ?? '';
  return `${home}/Library/Logs/DiagnosticReports`;
}

// Helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
