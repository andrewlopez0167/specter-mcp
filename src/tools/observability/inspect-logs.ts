/**
 * inspect_logs Tool Handler
 * MCP tool for inspecting device logs (logcat, OSLog)
 */

import { isPlatform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import {
  LogEntry,
  LogFilter,
  LogLevel,
  LogInspectionResult,
  generateLogSummary,
} from '../../models/log-entry.js';
import { captureLogcat, getLogsByTag as getAndroidLogsByTag } from '../../platforms/android/logcat.js';
import { captureOSLog, getAppLogs as getIOSAppLogs } from '../../platforms/ios/oslog.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for inspect_logs tool
 */
export interface InspectLogsArgs {
  /** Target platform */
  platform: string;
  /** App package/bundle ID (optional) */
  appId?: string;
  /** Device ID */
  deviceId?: string;
  /** Minimum log level to include */
  minLevel?: string;
  /** Tags to include (Android) */
  tags?: string[];
  /** Tags to exclude */
  excludeTags?: string[];
  /** Search pattern (regex) */
  pattern?: string;
  /** Case insensitive search */
  ignoreCase?: boolean;
  /** Subsystem filter (iOS) */
  subsystem?: string;
  /** Category filter (iOS) */
  category?: string;
  /** Maximum entries to return */
  maxEntries?: number;
  /** Time range - last N seconds */
  lastSeconds?: number;
  /** Clear log buffer before capture (Android) */
  clear?: boolean;
  /** Include crash/fault logs */
  includeCrashes?: boolean;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Inspect logs tool handler
 */
export async function inspectLogs(args: InspectLogsArgs): Promise<LogInspectionResult> {
  const {
    platform,
    appId,
    deviceId,
    minLevel,
    tags,
    excludeTags,
    pattern,
    ignoreCase = true,
    subsystem,
    category,
    maxEntries = 200,
    lastSeconds = 300,
    clear = false,
    includeCrashes = true,
    timeoutMs = 30000,
  } = args;

  const startTime = Date.now();

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate log level if provided
  if (minLevel && !isValidLogLevel(minLevel)) {
    throw Errors.invalidArguments(
      `Invalid log level: ${minLevel}. Must be one of: verbose, debug, info, warning, error, fatal`
    );
  }

  try {
    let entries: LogEntry[];

    // Build filter
    const filter: LogFilter = {};
    if (minLevel) {
      filter.minLevel = minLevel as LogLevel;
    }
    if (tags && tags.length > 0) {
      filter.tags = tags;
    }
    if (excludeTags && excludeTags.length > 0) {
      filter.excludeTags = excludeTags;
    }
    if (pattern) {
      filter.pattern = pattern;
      filter.ignoreCase = ignoreCase;
    }
    if (maxEntries > 0) {
      filter.limit = maxEntries;
    }

    // Capture logs based on platform
    if (platform === 'android') {
      entries = await captureAndroidLogs({
        deviceId,
        appId,
        tags,
        maxEntries,
        clear,
        includeCrashes,
        timeoutMs,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
    } else {
      entries = await captureIOSLogs({
        deviceId,
        appId,
        subsystem,
        category,
        maxEntries,
        lastSeconds,
        timeoutMs,
        filter: Object.keys(filter).length > 0 ? filter : undefined,
      });
    }

    return {
      success: true,
      platform,
      appId,
      deviceId,
      entries,
      totalEntries: entries.length,
      appliedFilters: Object.keys(filter).length > 0 ? filter : undefined,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      platform,
      appId,
      deviceId,
      entries: [],
      error: String(error),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Capture Android logs
 */
async function captureAndroidLogs(options: {
  deviceId?: string;
  appId?: string;
  tags?: string[];
  maxEntries: number;
  clear: boolean;
  includeCrashes: boolean;
  timeoutMs: number;
  filter?: LogFilter;
}): Promise<LogEntry[]> {
  const { deviceId, appId, tags, maxEntries, clear, includeCrashes, timeoutMs, filter } = options;

  // If specific tags requested, use tag-based capture
  if (tags && tags.length > 0) {
    return getAndroidLogsByTag(tags, {
      deviceId,
      maxLines: maxEntries,
      timeoutMs,
    });
  }

  // Otherwise use general capture
  return captureLogcat({
    deviceId,
    packageName: appId,
    maxLines: maxEntries,
    filter,
    includeCrashes,
    timeoutMs,
    clear,
  });
}

/**
 * Capture iOS logs
 */
async function captureIOSLogs(options: {
  deviceId?: string;
  appId?: string;
  subsystem?: string;
  category?: string;
  maxEntries: number;
  lastSeconds: number;
  timeoutMs: number;
  filter?: LogFilter;
}): Promise<LogEntry[]> {
  const { deviceId, appId, subsystem, category, maxEntries, lastSeconds, timeoutMs, filter } =
    options;

  // If app ID provided, use app-specific capture
  if (appId) {
    return getIOSAppLogs(appId, {
      deviceId,
      maxEntries,
      lastSeconds,
      subsystem,
      category,
      filter,
      timeoutMs,
    });
  }

  // Otherwise use general capture
  return captureOSLog({
    deviceId,
    maxEntries,
    lastSeconds,
    subsystem,
    category,
    filter,
    timeoutMs,
  });
}

/**
 * Check if log level is valid
 */
function isValidLogLevel(level: string): boolean {
  const validLevels = ['verbose', 'debug', 'info', 'warning', 'error', 'fatal', 'silent'];
  return validLevels.includes(level.toLowerCase());
}

/**
 * Format log inspection result for AI
 */
export function formatLogResult(result: LogInspectionResult): string {
  if (!result.success) {
    const lines = [
      `## Log Inspection: Failed`,
      ``,
      `**Error**: ${result.error}`,
    ];
    return lines.join('\n');
  }

  return generateLogSummary(result);
}

/**
 * Register the inspect_logs tool
 */
export function registerInspectLogsTool(): void {
  getToolRegistry().register(
    'inspect_logs',
    {
      description:
        'Inspect device logs (Android logcat or iOS unified logs). ' +
        'Can filter by app, log level, tags, patterns, and time range.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          appId: {
            type: 'string',
            description: 'App package name (Android) or bundle ID (iOS) to filter logs',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID (optional, uses first available)',
          },
          minLevel: {
            type: 'string',
            enum: ['verbose', 'debug', 'info', 'warning', 'error', 'fatal'],
            description: 'Minimum log level to include',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to include (Android logcat)',
          },
          excludeTags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Tags to exclude from results',
          },
          pattern: {
            type: 'string',
            description: 'Search pattern (regex) to filter messages',
          },
          ignoreCase: {
            type: 'boolean',
            description: 'Case insensitive pattern matching (default: true)',
          },
          subsystem: {
            type: 'string',
            description: 'Subsystem filter (iOS only)',
          },
          category: {
            type: 'string',
            description: 'Category filter (iOS only)',
          },
          maxEntries: {
            type: 'number',
            description: 'Maximum log entries to return (default: 200)',
          },
          lastSeconds: {
            type: 'number',
            description: 'Time range - logs from last N seconds (iOS, default: 300)',
          },
          clear: {
            type: 'boolean',
            description: 'Clear log buffer before capture (Android only)',
          },
          includeCrashes: {
            type: 'boolean',
            description: 'Include crash/fault logs (default: true)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000)',
          },
        },
        ['platform']
      ),
    },
    async (args) => {
      const result = await inspectLogs(args as unknown as InspectLogsArgs);
      return {
        ...result,
        formattedOutput: formatLogResult(result),
      };
    }
  );
}
