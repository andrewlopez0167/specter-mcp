/**
 * Log Entry Types
 * Structured types for log inspection (logcat, OSLog)
 */

import { Platform } from './constants.js';

/**
 * Log severity levels
 */
export type LogLevel = 'verbose' | 'debug' | 'info' | 'warning' | 'error' | 'fatal' | 'silent';

/**
 * Single log entry
 */
export interface LogEntry {
  /** Log timestamp */
  timestamp: Date;
  /** Log level/priority */
  level: LogLevel;
  /** Tag or category */
  tag: string;
  /** Process ID */
  pid?: number;
  /** Thread ID */
  tid?: number;
  /** Log message */
  message: string;
  /** Raw log line (for reference) */
  raw?: string;
}

/**
 * Log filter options
 */
export interface LogFilter {
  /** Filter by log level (minimum level to include) */
  minLevel?: LogLevel;
  /** Filter by specific tag(s) */
  tags?: string[];
  /** Exclude specific tag(s) */
  excludeTags?: string[];
  /** Filter by process ID */
  pid?: number;
  /** Search pattern (regex or string) */
  pattern?: string;
  /** Case-insensitive pattern matching */
  ignoreCase?: boolean;
  /** Start time */
  since?: Date;
  /** End time */
  until?: Date;
  /** Maximum number of entries */
  limit?: number;
}

/**
 * Log inspection result
 */
export interface LogInspectionResult {
  /** Whether inspection was successful */
  success: boolean;
  /** Target platform */
  platform: Platform;
  /** App package/bundle ID */
  appId?: string;
  /** Device ID */
  deviceId?: string;
  /** Log entries */
  entries: LogEntry[];
  /** Total entries before filtering */
  totalEntries?: number;
  /** Applied filters */
  appliedFilters?: LogFilter;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Log level priority order (lower = more verbose)
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  verbose: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

/**
 * Android logcat priority characters
 */
export const ANDROID_LOG_LEVELS: Record<string, LogLevel> = {
  V: 'verbose',
  D: 'debug',
  I: 'info',
  W: 'warning',
  E: 'error',
  F: 'fatal',
  S: 'silent',
};

/**
 * iOS log levels (unified logging)
 */
export const IOS_LOG_LEVELS: Record<string, LogLevel> = {
  Default: 'info',
  Info: 'info',
  Debug: 'debug',
  Error: 'error',
  Fault: 'fatal',
};

/**
 * Parse Android logcat line
 * Format: "MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE"
 * Or threadtime: "MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: MESSAGE"
 */
export function parseLogcatLine(line: string): LogEntry | null {
  // Threadtime format: "01-15 14:30:00.123  1234  5678 I MyTag  : Message"
  const threadtimeMatch = line.match(
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+(\S+)\s*:\s*(.*)$/
  );

  if (threadtimeMatch) {
    const [, timestamp, pid, tid, level, tag, message] = threadtimeMatch;
    return {
      timestamp: parseLogcatTimestamp(timestamp),
      level: ANDROID_LOG_LEVELS[level] || 'info',
      tag: tag.trim(),
      pid: parseInt(pid, 10),
      tid: parseInt(tid, 10),
      message: message.trim(),
      raw: line,
    };
  }

  // Brief format: "I/MyTag(1234): Message"
  const briefMatch = line.match(/^([VDIWEFS])\/(\S+)\((\d+)\):\s*(.*)$/);

  if (briefMatch) {
    const [, level, tag, pid, message] = briefMatch;
    return {
      timestamp: new Date(),
      level: ANDROID_LOG_LEVELS[level] || 'info',
      tag: tag.trim(),
      pid: parseInt(pid, 10),
      message: message.trim(),
      raw: line,
    };
  }

  return null;
}

/**
 * Parse logcat timestamp
 */
function parseLogcatTimestamp(timestamp: string): Date {
  // Format: "01-15 14:30:00.123"
  const now = new Date();
  const [datePart, timePart] = timestamp.trim().split(/\s+/);
  const [month, day] = datePart.split('-').map(Number);
  const [hours, minutes, rest] = timePart.split(':');
  const [seconds, millis] = rest.split('.').map(Number);

  return new Date(
    now.getFullYear(),
    month - 1,
    day,
    parseInt(hours, 10),
    parseInt(minutes, 10),
    seconds,
    millis
  );
}

/**
 * Parse iOS unified log line (from `log show` command)
 * Format: "YYYY-MM-DD HH:MM:SS.ffffff+ZZZZ  thread  type  activity  pid  ttl  process[pid]: subsystem  category  message"
 */
export function parseOSLogLine(line: string): LogEntry | null {
  // Simplified format: "2025-01-15 14:30:00.123456+0000 MyApp[1234] Default: Message"
  const match = line.match(
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+[+-]\d{4})\s+(\S+)\[(\d+)\]\s+(\S+):\s*(.*)$/
  );

  if (match) {
    const [, timestamp, process, pid, level, message] = match;
    return {
      timestamp: new Date(timestamp),
      level: IOS_LOG_LEVELS[level] || 'info',
      tag: process,
      pid: parseInt(pid, 10),
      message: message.trim(),
      raw: line,
    };
  }

  // Alternative format from log stream: "process[pid]: message"
  const streamMatch = line.match(/^(\S+)\[(\d+)\]:\s*(.*)$/);

  if (streamMatch) {
    const [, process, pid, message] = streamMatch;
    return {
      timestamp: new Date(),
      level: 'info',
      tag: process,
      pid: parseInt(pid, 10),
      message: message.trim(),
      raw: line,
    };
  }

  return null;
}

/**
 * Apply filters to log entries
 */
export function filterLogEntries(entries: LogEntry[], filter: LogFilter): LogEntry[] {
  let filtered = [...entries];

  // Filter by minimum level
  if (filter.minLevel) {
    const minPriority = LOG_LEVEL_PRIORITY[filter.minLevel];
    filtered = filtered.filter(
      (e) => LOG_LEVEL_PRIORITY[e.level] >= minPriority
    );
  }

  // Filter by tags (include)
  if (filter.tags && filter.tags.length > 0) {
    const tagSet = new Set(filter.tags.map((t) => t.toLowerCase()));
    filtered = filtered.filter((e) => tagSet.has(e.tag.toLowerCase()));
  }

  // Filter by tags (exclude)
  if (filter.excludeTags && filter.excludeTags.length > 0) {
    const excludeSet = new Set(filter.excludeTags.map((t) => t.toLowerCase()));
    filtered = filtered.filter((e) => !excludeSet.has(e.tag.toLowerCase()));
  }

  // Filter by PID
  if (filter.pid !== undefined) {
    filtered = filtered.filter((e) => e.pid === filter.pid);
  }

  // Filter by pattern
  if (filter.pattern) {
    const regex = new RegExp(filter.pattern, filter.ignoreCase ? 'i' : '');
    filtered = filtered.filter(
      (e) => regex.test(e.message) || regex.test(e.tag)
    );
  }

  // Filter by time range
  if (filter.since) {
    filtered = filtered.filter((e) => e.timestamp >= filter.since!);
  }
  if (filter.until) {
    filtered = filtered.filter((e) => e.timestamp <= filter.until!);
  }

  // Apply limit
  if (filter.limit && filter.limit > 0) {
    filtered = filtered.slice(-filter.limit);
  }

  return filtered;
}

/**
 * Generate AI-friendly log summary
 */
export function generateLogSummary(result: LogInspectionResult): string {
  const lines: string[] = [];

  lines.push(`## Log Inspection`);
  lines.push(``);
  lines.push(`**Platform**: ${result.platform}`);
  if (result.appId) {
    lines.push(`**App**: ${result.appId}`);
  }
  lines.push(`**Entries**: ${result.entries.length}`);
  lines.push(``);

  // Count by level
  const levelCounts = new Map<LogLevel, number>();
  for (const entry of result.entries) {
    levelCounts.set(entry.level, (levelCounts.get(entry.level) || 0) + 1);
  }

  if (levelCounts.size > 0) {
    lines.push(`### Level Distribution`);
    lines.push(``);
    for (const [level, count] of levelCounts) {
      const icon = getLogLevelIcon(level);
      lines.push(`- ${icon} ${level}: ${count}`);
    }
    lines.push(``);
  }

  // Show recent errors
  const errors = result.entries.filter((e) => e.level === 'error' || e.level === 'fatal');
  if (errors.length > 0) {
    lines.push(`### Recent Errors`);
    lines.push(``);
    for (const error of errors.slice(-5)) {
      lines.push(`- **${error.tag}**: ${truncate(error.message, 80)}`);
    }
    lines.push(``);
  }

  // Show last few entries
  const recent = result.entries.slice(-10);
  if (recent.length > 0) {
    lines.push(`### Recent Entries`);
    lines.push(``);
    for (const entry of recent) {
      const time = entry.timestamp.toISOString().split('T')[1]?.slice(0, 12) || '';
      const icon = getLogLevelIcon(entry.level);
      lines.push(`\`${time}\` ${icon} **${entry.tag}**: ${truncate(entry.message, 60)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get icon for log level
 */
function getLogLevelIcon(level: LogLevel): string {
  switch (level) {
    case 'verbose':
      return '⚪';
    case 'debug':
      return '🔵';
    case 'info':
      return '🟢';
    case 'warning':
      return '🟡';
    case 'error':
      return '🔴';
    case 'fatal':
      return '💀';
    default:
      return '⚫';
  }
}

/**
 * Truncate string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}
