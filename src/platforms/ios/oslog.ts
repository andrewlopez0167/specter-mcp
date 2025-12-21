/**
 * iOS OSLog Capture
 * Captures and streams unified log output from iOS simulators
 */

import { executeShell } from '../../utils/shell.js';
import {
  LogEntry,
  LogFilter,
  LogLevel,
  parseOSLogLine,
  filterLogEntries,
} from '../../models/log-entry.js';

/**
 * Options for OSLog capture
 */
export interface OSLogOptions {
  /** Device ID (default: booted) */
  deviceId?: string;
  /** App bundle ID to filter */
  bundleId?: string;
  /** Maximum number of entries */
  maxEntries?: number;
  /** Log filter */
  filter?: LogFilter;
  /** Time range - last N seconds */
  lastSeconds?: number;
  /** Subsystem to filter */
  subsystem?: string;
  /** Category to filter */
  category?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Capture OSLog output from simulator
 */
export async function captureOSLog(
  options: OSLogOptions = {}
): Promise<LogEntry[]> {
  const {
    deviceId = 'booted',
    bundleId,
    maxEntries = 500,
    filter,
    lastSeconds = 300,
    subsystem,
    category,
    timeoutMs = 30000,
  } = options;

  const args = ['simctl', 'spawn', deviceId, 'log', 'show'];

  // Add time predicate
  args.push('--last', `${lastSeconds}s`);

  // Add style for parsing
  args.push('--style', 'compact');

  // Build predicate
  const predicates: string[] = [];

  if (bundleId) {
    predicates.push(`processImagePath CONTAINS "${bundleId}"`);
  }

  if (subsystem) {
    predicates.push(`subsystem == "${subsystem}"`);
  }

  if (category) {
    predicates.push(`category == "${category}"`);
  }

  if (predicates.length > 0) {
    args.push('--predicate', predicates.join(' AND '));
  }

  try {
    const result = await executeShell('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0 && !result.stdout) {
      return [];
    }

    // Parse log lines
    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseOSLogLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    // Limit entries
    let limited = entries.slice(-maxEntries);

    // Apply filters
    if (filter) {
      limited = filterLogEntries(limited, filter);
    }

    return limited;
  } catch {
    return [];
  }
}

/**
 * Get app logs by bundle ID
 */
export async function getAppLogs(
  bundleId: string,
  options: Omit<OSLogOptions, 'bundleId'> = {}
): Promise<LogEntry[]> {
  return captureOSLog({ ...options, bundleId });
}

/**
 * Get logs by level
 */
export async function getLogsByLevel(
  minLevel: LogLevel,
  options: Omit<OSLogOptions, 'filter'> = {}
): Promise<LogEntry[]> {
  const logs = await captureOSLog(options);

  return filterLogEntries(logs, { minLevel });
}

/**
 * Search logs by pattern
 */
export async function searchLogs(
  pattern: string,
  options: Omit<OSLogOptions, 'filter'> = {}
): Promise<LogEntry[]> {
  const logs = await captureOSLog(options);

  return filterLogEntries(logs, { pattern, ignoreCase: true });
}

/**
 * Get logs by subsystem
 */
export async function getLogsBySubsystem(
  subsystem: string,
  options: Omit<OSLogOptions, 'subsystem'> = {}
): Promise<LogEntry[]> {
  return captureOSLog({ ...options, subsystem });
}

/**
 * Get logs by category
 */
export async function getLogsByCategory(
  subsystem: string,
  category: string,
  options: Omit<OSLogOptions, 'subsystem' | 'category'> = {}
): Promise<LogEntry[]> {
  return captureOSLog({ ...options, subsystem, category });
}

/**
 * Get crash logs from device
 */
export async function getCrashLogs(
  bundleId: string,
  deviceId: string = 'booted',
  timeoutMs: number = 15000
): Promise<LogEntry[]> {
  // Get crash reports from diagnostics
  const args = [
    'simctl', 'spawn', deviceId,
    'log', 'show',
    '--predicate', `processImagePath CONTAINS "${bundleId}" AND messageType == fault`,
    '--last', '1h',
    '--style', 'compact',
  ];

  try {
    const result = await executeShell('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseOSLogLine(line);
      if (entry) {
        // Mark crash logs with fatal level
        entry.level = 'fatal';
        entries.push(entry);
      }
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Stream logs in real-time (returns command for spawning)
 */
export function getStreamCommand(
  bundleId?: string,
  deviceId: string = 'booted'
): { command: string; args: string[] } {
  const args = ['simctl', 'spawn', deviceId, 'log', 'stream'];

  if (bundleId) {
    args.push('--predicate', `processImagePath CONTAINS "${bundleId}"`);
  }

  args.push('--style', 'compact');

  return { command: 'xcrun', args };
}

/**
 * Get log statistics
 */
export async function getLogStats(
  bundleId: string,
  deviceId: string = 'booted',
  timeoutMs: number = 10000
): Promise<{ total: number; byLevel: Record<LogLevel, number> } | null> {
  const logs = await captureOSLog({
    deviceId,
    bundleId,
    maxEntries: 1000,
    timeoutMs,
  });

  if (logs.length === 0) {
    return null;
  }

  const byLevel: Record<LogLevel, number> = {
    verbose: 0,
    debug: 0,
    info: 0,
    warning: 0,
    error: 0,
    fatal: 0,
    silent: 0,
  };

  for (const log of logs) {
    byLevel[log.level]++;
  }

  return {
    total: logs.length,
    byLevel,
  };
}

/**
 * Get recent errors
 */
export async function getRecentErrors(
  bundleId: string,
  limit: number = 10,
  deviceId: string = 'booted',
  timeoutMs: number = 15000
): Promise<LogEntry[]> {
  const logs = await captureOSLog({
    deviceId,
    bundleId,
    maxEntries: 500,
    timeoutMs,
  });

  const errors = logs.filter((l) => l.level === 'error' || l.level === 'fatal');

  return errors.slice(-limit);
}

/**
 * Get system logs (not app-specific)
 */
export async function getSystemLogs(
  deviceId: string = 'booted',
  options: { maxEntries?: number; lastSeconds?: number; timeoutMs?: number } = {}
): Promise<LogEntry[]> {
  const { maxEntries = 200, lastSeconds = 60, timeoutMs = 15000 } = options;

  const args = [
    'simctl', 'spawn', deviceId,
    'log', 'show',
    '--last', `${lastSeconds}s`,
    '--style', 'compact',
    '--predicate', 'subsystem == "com.apple.SpringBoard" OR subsystem == "com.apple.UIKit"',
  ];

  try {
    const result = await executeShell('xcrun', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const entries: LogEntry[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;

      const entry = parseOSLogLine(line);
      if (entry) {
        entries.push(entry);
      }
    }

    return entries.slice(-maxEntries);
  } catch {
    return [];
  }
}
