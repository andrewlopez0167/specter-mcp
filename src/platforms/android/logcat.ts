/**
 * Android Logcat Capture
 * Captures and streams logcat output from Android devices
 */

import { executeShell } from '../../utils/shell.js';
import {
  LogEntry,
  LogFilter,
  LogLevel,
  parseLogcatLine,
  filterLogEntries,
} from '../../models/log-entry.js';

/**
 * Options for logcat capture
 */
export interface LogcatOptions {
  /** Device ID */
  deviceId?: string;
  /** App package name to filter */
  packageName?: string;
  /** Maximum number of lines to capture */
  maxLines?: number;
  /** Log filter */
  filter?: LogFilter;
  /** Include crash/ANR logs */
  includeCrashes?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Clear logcat buffer before capture */
  clear?: boolean;
}

/**
 * Capture logcat output
 */
export async function captureLogcat(
  options: LogcatOptions = {}
): Promise<LogEntry[]> {
  const {
    deviceId,
    packageName,
    maxLines = 500,
    filter,
    includeCrashes = true,
    timeoutMs = 30000,
    clear = false,
  } = options;

  // Clear logcat if requested
  if (clear) {
    await clearLogcat(deviceId);
  }

  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('logcat', '-d');

  // Use threadtime format for complete information
  args.push('-v', 'threadtime');

  // Add line limit
  args.push('-t', String(maxLines));

  // If package name provided, get PID and filter
  let targetPid: number | undefined;
  if (packageName) {
    targetPid = await getAppPid(packageName, deviceId);
    if (targetPid) {
      args.push('--pid', String(targetPid));
    }
  }

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0 && !result.stdout) {
      return [];
    }

    // Parse log lines
    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseLogcatLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    // Apply filters
    let filtered = entries;
    if (filter) {
      filtered = filterLogEntries(entries, filter);
    }

    // Include crash logs if requested
    if (includeCrashes && packageName) {
      const crashes = await getCrashLogs(packageName, deviceId, timeoutMs);
      filtered = [...filtered, ...crashes];
    }

    return filtered;
  } catch {
    return [];
  }
}

/**
 * Get app PID
 */
async function getAppPid(
  packageName: string,
  deviceId?: string
): Promise<number | undefined> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('shell', 'pidof', packageName);

  try {
    const result = await executeShell('adb', args, { timeoutMs: 5000 });

    if (result.exitCode === 0 && result.stdout.trim()) {
      const pids = result.stdout.trim().split(/\s+/);
      return parseInt(pids[0], 10);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Clear logcat buffer
 */
export async function clearLogcat(deviceId?: string): Promise<boolean> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('logcat', '-c');

  try {
    const result = await executeShell('adb', args, { timeoutMs: 5000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get crash/ANR logs
 */
async function getCrashLogs(
  packageName: string,
  deviceId?: string,
  timeoutMs: number = 10000
): Promise<LogEntry[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  // Read from crash buffer
  args.push('logcat', '-b', 'crash', '-d', '-v', 'threadtime', '-t', '100');

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      // Check if line relates to our package
      if (!line.includes(packageName)) continue;

      const entry = parseLogcatLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Get logs by tag
 */
export async function getLogsByTag(
  tags: string[],
  options: Omit<LogcatOptions, 'filter'> = {}
): Promise<LogEntry[]> {
  const { deviceId, maxLines = 200, timeoutMs = 15000 } = options;

  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('logcat', '-d', '-v', 'threadtime', '-t', String(maxLines));

  // Add tag filters (TAG:LEVEL format, *:S silences everything else)
  for (const tag of tags) {
    args.push(`${tag}:V`);
  }
  args.push('*:S');

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseLogcatLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Get logs by level
 */
export async function getLogsByLevel(
  minLevel: LogLevel,
  options: Omit<LogcatOptions, 'filter'> = {}
): Promise<LogEntry[]> {
  const logs = await captureLogcat(options);

  return filterLogEntries(logs, { minLevel });
}

/**
 * Search logs by pattern
 */
export async function searchLogs(
  pattern: string,
  options: Omit<LogcatOptions, 'filter'> = {}
): Promise<LogEntry[]> {
  const logs = await captureLogcat(options);

  return filterLogEntries(logs, { pattern, ignoreCase: true });
}

/**
 * Get logcat buffer statistics
 */
export async function getLogcatStats(
  deviceId?: string
): Promise<{ main: number; system: number; crash: number; events: number } | null> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  args.push('logcat', '-g');

  try {
    const result = await executeShell('adb', args, { timeoutMs: 5000 });

    if (result.exitCode !== 0) {
      return null;
    }

    const stats = { main: 0, system: 0, crash: 0, events: 0 };
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      const match = line.match(/(\w+):\s*ring buffer is\s*([\d.]+)\s*([KMG]?B)/i);
      if (match) {
        const [, buffer, size, unit] = match;
        let bytes = parseFloat(size);
        if (unit === 'KB' || unit === 'K') bytes *= 1024;
        if (unit === 'MB' || unit === 'M') bytes *= 1024 * 1024;
        if (unit === 'GB' || unit === 'G') bytes *= 1024 * 1024 * 1024;

        if (buffer.toLowerCase() in stats) {
          stats[buffer.toLowerCase() as keyof typeof stats] = bytes;
        }
      }
    }

    return stats;
  } catch {
    return null;
  }
}
