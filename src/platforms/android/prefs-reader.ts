/**
 * Android SharedPreferences Reader
 * Reads app preferences from device via adb
 */

import { ShellExecutor, defaultShellExecutor } from '../../utils/shell-executor.js';
import {
  PreferencesFile,
  PreferenceEntry,
  parseSharedPreferencesXml,
} from '../../models/app-state.js';

/**
 * Options for reading preferences
 */
export interface ReadPreferencesOptions {
  /** Device ID */
  deviceId?: string;
  /** Specific preferences file name */
  fileName?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Shell executor for dependency injection */
  shell?: ShellExecutor;
}

/**
 * Read all SharedPreferences files for an app
 * @param packageName Android package name
 * @param options Read options including optional shell executor
 */
export async function readSharedPreferences(
  packageName: string,
  options: ReadPreferencesOptions = {}
): Promise<PreferencesFile[]> {
  const { deviceId, fileName, timeoutMs = 10000, shell = defaultShellExecutor } = options;

  const prefsDir = `/data/data/${packageName}/shared_prefs`;

  // List preferences files
  const files = await listPreferencesFiles(packageName, deviceId, timeoutMs, shell);

  if (files.length === 0) {
    return [];
  }

  // Filter to specific file if requested
  const targetFiles = fileName
    ? files.filter((f) => f === fileName || f === `${fileName}.xml`)
    : files;

  // Read each preferences file
  const results: PreferencesFile[] = [];

  for (const file of targetFiles) {
    const filePath = `${prefsDir}/${file}`;
    const content = await readPreferencesFile(filePath, deviceId, timeoutMs, shell);

    if (content) {
      const entries = parseSharedPreferencesXml(content);
      results.push({
        name: file.replace('.xml', ''),
        path: filePath,
        entries,
      });
    }
  }

  return results;
}

/**
 * List SharedPreferences files for an app
 */
async function listPreferencesFiles(
  packageName: string,
  deviceId: string | undefined,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const prefsDir = `/data/data/${packageName}/shared_prefs`;
  args.push('shell', 'run-as', packageName, 'ls', prefsDir);

  try {
    const result = await shell.execute('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      // Try alternative method for debuggable apps
      return await listPreferencesFilesAlt(packageName, deviceId, timeoutMs, shell);
    }

    return result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.endsWith('.xml'));
  } catch {
    return [];
  }
}

/**
 * Alternative method to list preferences files (for rooted devices or debuggable apps)
 */
async function listPreferencesFilesAlt(
  packageName: string,
  deviceId: string | undefined,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const prefsDir = `/data/data/${packageName}/shared_prefs`;
  args.push('shell', 'su', '-c', `ls ${prefsDir}`);

  try {
    const result = await shell.execute('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    return result.stdout
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.endsWith('.xml'));
  } catch {
    return [];
  }
}

/**
 * Read a single preferences file
 */
async function readPreferencesFile(
  filePath: string,
  deviceId: string | undefined,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string | null> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  // Extract package name from path
  const packageMatch = filePath.match(/\/data\/data\/([^/]+)\//);
  const packageName = packageMatch ? packageMatch[1] : '';

  if (!packageName) {
    return null;
  }

  // Use run-as to read the file
  args.push('shell', 'run-as', packageName, 'cat', filePath);

  try {
    const result = await shell.execute('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      // Try alternative method
      return await readPreferencesFileAlt(filePath, deviceId, timeoutMs, shell);
    }

    return result.stdout;
  } catch {
    return null;
  }
}

/**
 * Alternative method to read preferences file
 */
async function readPreferencesFileAlt(
  filePath: string,
  deviceId: string | undefined,
  timeoutMs: number,
  shell: ShellExecutor
): Promise<string | null> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'su', '-c', `cat "${filePath}"`);

  try {
    const result = await shell.execute('adb', args, { timeoutMs });
    return result.exitCode === 0 ? result.stdout : null;
  } catch {
    return null;
  }
}

/**
 * Read a specific preference value
 * @param packageName Android package name
 * @param prefsFileName Preferences file name
 * @param key Key to read
 * @param options Options including optional shell executor
 */
export async function readPreference(
  packageName: string,
  prefsFileName: string,
  key: string,
  options: { deviceId?: string; timeoutMs?: number; shell?: ShellExecutor } = {}
): Promise<PreferenceEntry | null> {
  const prefs = await readSharedPreferences(packageName, {
    ...options,
    fileName: prefsFileName,
  });

  if (prefs.length === 0) {
    return null;
  }

  const entry = prefs[0].entries.find((e) => e.key === key);
  return entry || null;
}

/**
 * Check if app is debuggable (run-as accessible)
 * @param packageName Android package name
 * @param deviceId Device ID
 * @param shell Shell executor for dependency injection (defaults to real shell)
 */
export async function isAppDebuggable(
  packageName: string,
  deviceId?: string,
  shell: ShellExecutor = defaultShellExecutor
): Promise<boolean> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'run-as', packageName, 'id');

  try {
    const result = await shell.execute('adb', args, { timeoutMs: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get app data directory path
 */
export function getAppDataPath(packageName: string): string {
  return `/data/data/${packageName}`;
}

/**
 * Get shared preferences directory path
 */
export function getSharedPrefsPath(packageName: string): string {
  return `/data/data/${packageName}/shared_prefs`;
}
