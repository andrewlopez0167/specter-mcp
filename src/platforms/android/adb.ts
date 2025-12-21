/**
 * ADB (Android Debug Bridge) wrapper
 * Provides type-safe interface to common ADB commands
 */
import { executeShell, executeShellOrThrow, executeShellBinary, commandExists, parseLines } from '../../utils/shell.js';
import { Errors } from '../../models/errors.js';
import { DeviceStatus, DEFAULTS } from '../../models/constants.js';

export interface AndroidDevice {
  id: string;
  name: string;
  status: DeviceStatus;
  model?: string;
  product?: string;
}

/**
 * Check if ADB is available
 */
export async function isAdbAvailable(): Promise<boolean> {
  return commandExists('adb');
}

/**
 * List connected Android devices/emulators
 */
export async function listDevices(): Promise<AndroidDevice[]> {
  const result = await executeShell('adb', ['devices', '-l']);

  if (result.exitCode !== 0) {
    throw Errors.shellExecutionFailed('adb devices', result.stderr);
  }

  const lines = parseLines(result.stdout);
  const devices: AndroidDevice[] = [];

  // Skip the "List of devices attached" header
  for (const line of lines.slice(1)) {
    const match = line.match(/^(\S+)\s+(device|offline|unauthorized)(.*)$/);
    if (match) {
      const [, id, state, props] = match;

      // Parse device properties
      const modelMatch = props.match(/model:(\S+)/);
      const productMatch = props.match(/product:(\S+)/);

      let status: DeviceStatus = 'unknown';
      if (state === 'device') status = 'booted';
      else if (state === 'offline') status = 'shutdown';

      devices.push({
        id,
        name: modelMatch?.[1] ?? id,
        status,
        model: modelMatch?.[1],
        product: productMatch?.[1],
      });
    }
  }

  return devices;
}

/**
 * Get a specific device by name or ID
 */
export async function getDevice(nameOrId: string): Promise<AndroidDevice | null> {
  const devices = await listDevices();
  return devices.find(
    (d) => d.id === nameOrId || d.name === nameOrId || d.model === nameOrId
  ) ?? null;
}

/**
 * List available AVDs (Android Virtual Devices)
 */
export async function listAvds(): Promise<string[]> {
  const result = await executeShell('emulator', ['-list-avds']);
  if (result.exitCode !== 0) {
    return [];
  }
  return parseLines(result.stdout);
}

/**
 * Boot an emulator by AVD name
 */
export async function bootEmulator(
  avdName: string,
  options?: { noSnapshotLoad?: boolean; coldBoot?: boolean }
): Promise<void> {
  const args = ['-avd', avdName];

  if (options?.noSnapshotLoad || options?.coldBoot) {
    args.push('-no-snapshot-load');
  }

  // Start emulator in background (fire and forget)
  executeShell('emulator', args, {
    timeoutMs: DEFAULTS.DEVICE_BOOT_TIMEOUT_MS,
  });

  // Wait for device to be ready
  await waitForDevice(avdName);
}

/**
 * Wait for a device to be fully booted
 */
export async function waitForDevice(
  deviceId?: string,
  timeoutMs: number = DEFAULTS.DEVICE_BOOT_TIMEOUT_MS
): Promise<void> {
  const args = deviceId ? ['-s', deviceId, 'wait-for-device'] : ['wait-for-device'];

  await executeShellOrThrow('adb', args, { timeoutMs });

  // Additionally wait for boot to complete
  const bootArgs = deviceId
    ? ['-s', deviceId, 'shell', 'getprop', 'sys.boot_completed']
    : ['shell', 'getprop', 'sys.boot_completed'];

  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const result = await executeShell('adb', bootArgs);
    if (result.stdout.trim() === '1') {
      return;
    }
    await delay(1000);
  }

  throw Errors.timeout('Device boot', timeoutMs);
}

/**
 * Shutdown an emulator
 */
export async function shutdownEmulator(deviceId: string): Promise<void> {
  await executeShellOrThrow('adb', ['-s', deviceId, 'emu', 'kill']);
}

/**
 * Take a screenshot
 */
export async function takeScreenshot(deviceId?: string): Promise<Buffer> {
  const args = deviceId
    ? ['-s', deviceId, 'exec-out', 'screencap', '-p']
    : ['exec-out', 'screencap', '-p'];

  const result = await executeShellBinary('adb', args);

  if (result.exitCode !== 0) {
    throw Errors.shellExecutionFailed('adb screencap', result.stderr);
  }

  return result.stdout;
}

/**
 * Dump UI hierarchy with retry logic
 */
export async function dumpUiHierarchy(deviceId?: string): Promise<string> {
  const tmpFile = '/sdcard/specter-ui-dump.xml';
  const deviceArgs = deviceId ? ['-s', deviceId] : [];
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // Kill any stale uiautomator processes first to prevent "Killed" errors
    await executeShell('adb', [
      ...deviceArgs,
      'shell',
      'pkill -9 uiautomator 2>/dev/null; rm -f ' + tmpFile,
    ], { silent: true });

    // Wait for process cleanup
    await delay(300 * attempt);

    // Dump to temp file and cat it
    const dumpResult = await executeShell('adb', [
      ...deviceArgs,
      'shell',
      `uiautomator dump ${tmpFile} && cat ${tmpFile}`,
    ], { timeoutMs: 20000, silent: true });

    if (dumpResult.exitCode === 0 && dumpResult.stdout.includes('<hierarchy')) {
      // Extract XML from output (skip the "UI hierarchy dumped to:" message)
      const xmlMatch = dumpResult.stdout.match(/<\?xml[\s\S]*<\/hierarchy>/);
      return xmlMatch?.[0] ?? dumpResult.stdout;
    }

    // If "Killed" error, retry
    if (attempt < maxRetries && dumpResult.stderr.includes('Killed')) {
      continue;
    }

    // Last attempt failed
    if (attempt === maxRetries) {
      throw Errors.shellExecutionFailed('adb uiautomator dump', dumpResult.stderr || 'UI dump failed after retries');
    }
  }

  throw Errors.shellExecutionFailed('adb uiautomator dump', 'UI dump failed');
}

/**
 * Get logcat output
 */
export async function getLogcat(
  deviceId?: string,
  options?: {
    level?: string;
    tags?: string[];
    limit?: number;
    since?: string;
  }
): Promise<string> {
  const args = deviceId ? ['-s', deviceId, 'logcat', '-d'] : ['logcat', '-d'];

  // Add format
  args.push('-v', 'time');

  // Add level filter
  if (options?.level) {
    args.push(`*:${options.level.toUpperCase().charAt(0)}`);
  }

  // Add tag filters
  if (options?.tags?.length) {
    for (const tag of options.tags) {
      args.push(`${tag}:V`);
    }
  }

  const result = await executeShell('adb', args);

  let output = result.stdout;

  // Limit lines if specified
  if (options?.limit) {
    const lines = output.split('\n');
    output = lines.slice(-options.limit).join('\n');
  }

  return output;
}

/**
 * Capture logcat with filtering options
 * Alias for getLogcat with additional filtering capabilities
 */
export async function captureLogcat(
  deviceId: string,
  options?: {
    filterByPackage?: string;
    maxLines?: number;
    since?: Date;
    level?: string;
  }
): Promise<string> {
  const { filterByPackage, maxLines, level } = options || {};

  // Use getLogcat with translated options
  let output = await getLogcat(deviceId, {
    level,
    limit: maxLines,
  });

  // Filter by package if specified
  if (filterByPackage) {
    const lines = output.split('\n');
    output = lines.filter((line) => line.includes(filterByPackage)).join('\n');
  }

  return output;
}

/**
 * Open a deep link
 */
export async function openDeepLink(uri: string, deviceId?: string): Promise<void> {
  const args = deviceId
    ? ['-s', deviceId, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri]
    : ['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', uri];

  await executeShellOrThrow('adb', args);
}

/**
 * Install an APK
 */
export async function installApk(apkPath: string, deviceId?: string): Promise<void> {
  const args = deviceId
    ? ['-s', deviceId, 'install', '-r', apkPath]
    : ['install', '-r', apkPath];

  await executeShellOrThrow('adb', args, { timeoutMs: 120000 });
}

/**
 * Launch an app by package name
 */
export async function launchApp(
  packageName: string,
  deviceId?: string,
  options?: { clearData?: boolean }
): Promise<void> {
  if (options?.clearData) {
    const clearArgs = deviceId
      ? ['-s', deviceId, 'shell', 'pm', 'clear', packageName]
      : ['shell', 'pm', 'clear', packageName];
    await executeShell('adb', clearArgs);
  }

  const args = deviceId
    ? ['-s', deviceId, 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']
    : ['shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1'];

  await executeShellOrThrow('adb', args);
}

/**
 * Tap at coordinates
 */
export async function tap(x: number, y: number, deviceId?: string): Promise<void> {
  const args = deviceId
    ? ['-s', deviceId, 'shell', 'input', 'tap', String(x), String(y)]
    : ['shell', 'input', 'tap', String(x), String(y)];

  await executeShellOrThrow('adb', args);
}

/**
 * Input text
 */
export async function inputText(text: string, deviceId?: string): Promise<void> {
  // Escape special characters for shell
  const escapedText = text.replace(/([\\$`"!])/g, '\\$1').replace(/ /g, '%s');

  const args = deviceId
    ? ['-s', deviceId, 'shell', 'input', 'text', escapedText]
    : ['shell', 'input', 'text', escapedText];

  await executeShellOrThrow('adb', args);
}

/**
 * Swipe gesture
 */
export async function swipe(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  durationMs: number = 300,
  deviceId?: string
): Promise<void> {
  const args = deviceId
    ? ['-s', deviceId, 'shell', 'input', 'swipe',
       String(startX), String(startY), String(endX), String(endY), String(durationMs)]
    : ['shell', 'input', 'swipe',
       String(startX), String(startY), String(endX), String(endY), String(durationMs)];

  await executeShellOrThrow('adb', args);
}

// Helper
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
