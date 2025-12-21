/**
 * iOS UserDefaults/Preferences Reader
 * Reads app preferences from simulator via simctl
 */

import { ShellExecutor, defaultShellExecutor } from '../../utils/shell-executor.js';
import {
  PreferencesFile,
  parsePlistXml,
} from '../../models/app-state.js';

/**
 * Options for reading preferences
 */
export interface ReadPreferencesOptions {
  /** Device ID (default: booted) */
  deviceId?: string;
  /** Specific preferences file name */
  fileName?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Shell executor for dependency injection */
  shell?: ShellExecutor;
}

/**
 * Read UserDefaults for an iOS app
 */
export async function readUserDefaults(
  bundleId: string,
  options: ReadPreferencesOptions = {}
): Promise<PreferencesFile[]> {
  const { deviceId = 'booted', fileName, timeoutMs = 10000, shell = defaultShellExecutor } = options;

  // Get app container path
  const containerPath = await getAppContainerPath(bundleId, deviceId, timeoutMs, shell);

  if (!containerPath) {
    return [];
  }

  // UserDefaults are stored in Library/Preferences
  const prefsDir = `${containerPath}/Library/Preferences`;

  // List plist files
  const files = await listPlistFiles(prefsDir, deviceId, timeoutMs, shell);

  if (files.length === 0) {
    // Try the bundle ID plist directly
    const defaultPlist = `${bundleId}.plist`;
    const content = await readPlistFile(`${prefsDir}/${defaultPlist}`, deviceId, timeoutMs, shell);
    if (content) {
      const entries = parsePlistXml(content);
      return [{
        name: bundleId,
        path: `${prefsDir}/${defaultPlist}`,
        entries,
      }];
    }
    return [];
  }

  // Filter to specific file if requested
  const targetFiles = fileName
    ? files.filter((f) => f === fileName || f === `${fileName}.plist`)
    : files;

  // Read each plist file
  const results: PreferencesFile[] = [];

  for (const file of targetFiles) {
    const filePath = `${prefsDir}/${file}`;
    const content = await readPlistFile(filePath, deviceId, timeoutMs, shell);

    if (content) {
      const entries = parsePlistXml(content);
      results.push({
        name: file.replace('.plist', ''),
        path: filePath,
        entries,
      });
    }
  }

  return results;
}

/**
 * Get app container path on simulator
 */
export async function getAppContainerPath(
  bundleId: string,
  deviceId: string = 'booted',
  timeoutMs: number = 5000,
  shell: ShellExecutor = defaultShellExecutor
): Promise<string | null> {
  const args = [
    'simctl', 'get_app_container', deviceId, bundleId, 'data',
  ];

  try {
    const result = await shell.execute('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return null;
    }

    return result.stdout.trim();
  } catch {
    return null;
  }
}

/**
 * List plist files in a directory
 */
async function listPlistFiles(
  directory: string,
  deviceId: string,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string[]> {
  const args = [
    'simctl', 'spawn', deviceId, 'ls', directory,
  ];

  try {
    const result = await shell.execute('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.endsWith('.plist'));
  } catch {
    return [];
  }
}

/**
 * Read a plist file from simulator
 */
async function readPlistFile(
  filePath: string,
  deviceId: string,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string | null> {
  // First convert binary plist to XML if needed
  const convertArgs = [
    'simctl', 'spawn', deviceId,
    'plutil', '-convert', 'xml1', '-o', '-', filePath,
  ];

  try {
    const result = await shell.execute('xcrun', convertArgs, { timeoutMs });

    if (result.exitCode === 0) {
      return result.stdout;
    }

    // Try reading directly (might already be XML)
    const catArgs = ['simctl', 'spawn', deviceId, 'cat', filePath];
    const catResult = await shell.execute('xcrun', catArgs, { timeoutMs });

    return catResult.exitCode === 0 ? catResult.stdout : null;
  } catch {
    return null;
  }
}

/**
 * Read NSUserDefaults using defaults command
 * This reads the standard UserDefaults domain
 */
export async function readDefaultsDomain(
  bundleId: string,
  deviceId: string = 'booted',
  timeoutMs: number = 10000,
  shell: ShellExecutor = defaultShellExecutor
): Promise<PreferencesFile | null> {
  const args = [
    'simctl', 'spawn', deviceId,
    'defaults', 'read', bundleId,
  ];

  try {
    const result = await shell.execute('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return null;
    }

    // Parse defaults output (it's not XML, but a property list text format)
    const entries = parseDefaultsOutput(result.stdout);

    return {
      name: bundleId,
      entries,
    };
  } catch {
    return null;
  }
}

/**
 * Parse output from defaults read command
 */
function parseDefaultsOutput(output: string): Array<{ key: string; value: string | number | boolean; type: 'string' | 'int' | 'float' | 'boolean' }> {
  const entries: Array<{ key: string; value: string | number | boolean; type: 'string' | 'int' | 'float' | 'boolean' }> = [];

  // Output format: "key = value;"
  const lines = output.split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*"?([^"=]+)"?\s*=\s*(.+?);?\s*$/);
    if (match) {
      const key = match[1].trim();
      let valueStr = match[2].trim();

      // Remove quotes
      if (valueStr.startsWith('"') && valueStr.endsWith('"')) {
        entries.push({ key, value: valueStr.slice(1, -1), type: 'string' });
      } else if (valueStr === '1' || valueStr === '0') {
        // Could be boolean or int - assume boolean for common patterns
        if (key.toLowerCase().includes('enable') || key.toLowerCase().includes('is')) {
          entries.push({ key, value: valueStr === '1', type: 'boolean' });
        } else {
          entries.push({ key, value: parseInt(valueStr, 10), type: 'int' });
        }
      } else if (/^-?\d+$/.test(valueStr)) {
        entries.push({ key, value: parseInt(valueStr, 10), type: 'int' });
      } else if (/^-?\d+\.\d+$/.test(valueStr)) {
        entries.push({ key, value: parseFloat(valueStr), type: 'float' });
      } else {
        entries.push({ key, value: valueStr, type: 'string' });
      }
    }
  }

  return entries;
}

/**
 * Get all installed apps on simulator
 */
export async function listInstalledApps(
  deviceId: string = 'booted',
  timeoutMs: number = 10000,
  shell: ShellExecutor = defaultShellExecutor
): Promise<string[]> {
  const args = ['simctl', 'listapps', deviceId];

  try {
    const result = await shell.execute('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    // Parse the output to extract bundle IDs
    const bundleIds: string[] = [];
    const matches = result.stdout.matchAll(/CFBundleIdentifier\s*=\s*"([^"]+)"/g);

    for (const match of matches) {
      bundleIds.push(match[1]);
    }

    return bundleIds;
  } catch {
    return [];
  }
}

/**
 * Check if app is installed on simulator
 */
export async function isAppInstalled(
  bundleId: string,
  deviceId: string = 'booted',
  shell: ShellExecutor = defaultShellExecutor
): Promise<boolean> {
  const containerPath = await getAppContainerPath(bundleId, deviceId, 5000, shell);
  return containerPath !== null;
}
