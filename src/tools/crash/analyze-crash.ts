/**
 * analyze_crash Tool Handler
 * MCP tool for analyzing crash logs with symbolication and pattern detection
 * Supports both Android (logcat) and iOS (crash files + oslog) platforms
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  CrashReport,
  CrashAnalysisResult,
  CrashException,
  ThreadInfo,
  generateCrashSummary,
  detectCrashPatterns,
} from '../../models/crash-report.js';
import { LogEntry } from '../../models/log-entry.js';
import { isPlatform, Platform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import { parseCrashLog, findAppBinary } from '../../platforms/ios/crash-parser.js';
import {
  symbolicateCrashReport,
  findDSYMFile,
  findDSYMInCommonLocations,
  verifyDSYMMatch,
} from '../../platforms/ios/symbolicate.js';
import { captureLogcat } from '../../platforms/android/logcat.js';
import { captureOSLog, getCrashLogs as getIOSCrashLogs } from '../../platforms/ios/oslog.js';
import { listDevices as listAndroidDevices } from '../../platforms/android/adb.js';
import { getBootedDevice } from '../../platforms/ios/simctl.js';
import {
  analyzePatterns,
  generateCrashDescription,
  getTopSuspects,
  isLikelyReproducible,
} from './pattern-detector.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for analyze_crash tool
 */
export interface AnalyzeCrashArgs {
  /** Target platform (required) */
  platform: string;
  /** Path to the crash log file (.ips or .crash) - iOS only, optional for live analysis */
  crashLogPath?: string;
  /** App ID (Android package name or iOS bundle ID) for live device log analysis */
  appId?: string;
  /** Device ID for live device log analysis (optional, uses first available) */
  deviceId?: string;
  /** Path to dSYM file or directory (optional, iOS only) */
  dsymPath?: string;
  /** Time range in seconds to search logs (default: 300 = 5 minutes) */
  timeRangeSeconds?: number;
  /** Skip symbolication (faster, less detailed) - iOS only */
  skipSymbolication?: boolean;
  /** Include raw crash log in output */
  includeRawLog?: boolean;
}

/**
 * Extended analysis result with additional context
 */
export interface ExtendedCrashAnalysis extends CrashAnalysisResult {
  /** Target platform */
  platform: Platform;
  /** Crash description */
  description: string;
  /** Top suspect functions */
  suspects: string[];
  /** Whether crash is likely reproducible */
  reproducible: boolean;
  /** Crash category */
  category: string;
  /** dSYM status (iOS only) */
  dsymStatus: 'found' | 'not_found' | 'skipped' | 'mismatch' | 'n/a';
  /** Device ID used for analysis */
  deviceId?: string;
  /** App ID analyzed */
  appId?: string;
  /** Device log entries (for live analysis) */
  deviceLogs?: DeviceLogSummary;
}

/**
 * Summary of device logs for crash analysis
 */
export interface DeviceLogSummary {
  /** Total entries analyzed */
  totalEntries: number;
  /** Error entries */
  errorCount: number;
  /** Fatal/crash entries */
  fatalCount: number;
  /** Key error messages */
  keyErrors: string[];
  /** Exception stack traces found */
  stackTraces: string[];
  /** Crash indicators detected */
  crashIndicators: CrashIndicator[];
}

/**
 * Crash indicator found in logs
 */
export interface CrashIndicator {
  /** Type of crash */
  type: 'exception' | 'anr' | 'native_crash' | 'oom' | 'signal' | 'assertion';
  /** Crash message */
  message: string;
  /** Timestamp */
  timestamp?: Date;
  /** Associated stack trace */
  stackTrace?: string;
  /** Severity */
  severity: 'critical' | 'high' | 'medium';
}

/**
 * Analyze crash log tool handler
 * Supports both file-based analysis (iOS) and live device log analysis (Android/iOS)
 */
export async function analyzeCrash(args: AnalyzeCrashArgs): Promise<ExtendedCrashAnalysis> {
  const {
    platform,
    crashLogPath,
    appId,
    deviceId,
    dsymPath,
    timeRangeSeconds = 300,
    skipSymbolication = false,
    includeRawLog = false,
  } = args;

  const startTime = Date.now();

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  const targetPlatform = platform as Platform;

  // Determine analysis mode
  if (targetPlatform === 'android') {
    // Android: Always use live device log analysis
    return analyzeAndroidCrash({
      appId,
      deviceId,
      timeRangeSeconds,
      includeRawLog,
      startTime,
    });
  } else {
    // iOS: Use crash log file if provided, otherwise live analysis
    if (crashLogPath) {
      return analyzeIOSCrashFile({
        crashLogPath,
        dsymPath,
        bundleId: appId,
        skipSymbolication,
        includeRawLog,
        startTime,
      });
    } else {
      return analyzeIOSDeviceLogs({
        appId,
        deviceId,
        timeRangeSeconds,
        includeRawLog,
        startTime,
      });
    }
  }
}

/**
 * Analyze Android crash via logcat
 */
async function analyzeAndroidCrash(options: {
  appId?: string;
  deviceId?: string;
  timeRangeSeconds: number;
  includeRawLog: boolean;
  startTime: number;
}): Promise<ExtendedCrashAnalysis> {
  const { appId, deviceId, includeRawLog, startTime } = options;

  // Get device if not specified
  let targetDeviceId = deviceId;
  if (!targetDeviceId) {
    const devices = await listAndroidDevices();
    const bootedDevice = devices.find((d) => d.status === 'booted');
    if (!bootedDevice) {
      throw Errors.invalidArguments('No Android device connected. Please connect a device or emulator.');
    }
    targetDeviceId = bootedDevice.id;
  }

  // Capture logcat with crash buffer
  const logs = await captureLogcat({
    deviceId: targetDeviceId,
    packageName: appId,
    maxLines: 1000,
    includeCrashes: true,
    timeoutMs: 30000,
  });

  // Analyze logs for crash indicators
  const deviceLogSummary = analyzeDeviceLogs(logs, 'android');
  const crashIndicators = deviceLogSummary.crashIndicators;

  // Generate report from logs
  const report = generateReportFromLogs(logs, crashIndicators, 'android', appId);

  // Detect patterns
  const patterns = detectCrashPatterns(report);
  report.patterns = patterns;

  // Analyze patterns
  const analysis = analyzePatterns(report);
  const summary = generateCrashSummary(report);
  const description = crashIndicators.length > 0
    ? `Android crash detected: ${crashIndicators[0].type} - ${crashIndicators[0].message}`
    : 'Android log analysis complete (no crash detected)';

  if (!includeRawLog) {
    report.rawLog = undefined;
  }

  return {
    success: crashIndicators.length > 0 || deviceLogSummary.errorCount > 0,
    platform: 'android',
    report,
    summary,
    patterns: analysis.patterns,
    suggestions: generateAndroidSuggestions(crashIndicators, deviceLogSummary),
    durationMs: Date.now() - startTime,
    description,
    suspects: deviceLogSummary.keyErrors.slice(0, 5),
    reproducible: crashIndicators.length > 0,
    category: crashIndicators.length > 0 ? crashIndicators[0].type : 'none',
    dsymStatus: 'n/a',
    deviceId: targetDeviceId,
    appId,
    deviceLogs: deviceLogSummary,
  };
}

/**
 * Analyze iOS crash from file
 */
async function analyzeIOSCrashFile(options: {
  crashLogPath: string;
  dsymPath?: string;
  bundleId?: string;
  skipSymbolication: boolean;
  includeRawLog: boolean;
  startTime: number;
}): Promise<ExtendedCrashAnalysis> {
  const { crashLogPath, dsymPath, bundleId, skipSymbolication, includeRawLog, startTime } = options;

  // Validate crash log exists
  const resolvedPath = resolve(crashLogPath);
  if (!existsSync(resolvedPath)) {
    throw Errors.noCrashLogs(crashLogPath);
  }

  // Parse crash log
  let report: CrashReport;
  try {
    report = parseCrashLog(resolvedPath);
  } catch (error) {
    return {
      success: false,
      platform: 'ios',
      error: `Failed to parse crash log: ${error}`,
      summary: '',
      patterns: [],
      suggestions: ['Ensure the crash log file is a valid .ips or .crash format'],
      durationMs: Date.now() - startTime,
      description: 'Parse Error',
      suspects: [],
      reproducible: false,
      category: 'unknown',
      dsymStatus: 'skipped',
    };
  }

  // Update bundle ID if provided
  if (bundleId && !report.bundleId) {
    report.bundleId = bundleId;
  }

  // Try to symbolicate
  let dsymStatus: 'found' | 'not_found' | 'skipped' | 'mismatch' = 'skipped';

  if (!skipSymbolication) {
    const symbolicationResult = await attemptSymbolication(report, dsymPath, bundleId);
    report = symbolicationResult.report;
    dsymStatus = symbolicationResult.status;
  }

  // Detect patterns
  const patterns = detectCrashPatterns(report);
  report.patterns = patterns;

  // Analyze patterns for extended info
  const analysis = analyzePatterns(report);

  // Generate summary
  const summary = generateCrashSummary(report);

  // Get description and suspects
  const description = generateCrashDescription(report);
  const suspects = getTopSuspects(report);
  const reproducible = isLikelyReproducible(report);

  // Clean up raw log if not requested
  if (!includeRawLog) {
    report.rawLog = undefined;
  }

  return {
    success: true,
    platform: 'ios',
    report,
    summary,
    patterns: analysis.patterns,
    suggestions: analysis.suggestions,
    durationMs: Date.now() - startTime,
    description,
    suspects,
    reproducible,
    category: analysis.category,
    dsymStatus,
    appId: bundleId,
  };
}

/**
 * Analyze iOS device logs
 */
async function analyzeIOSDeviceLogs(options: {
  appId?: string;
  deviceId?: string;
  timeRangeSeconds: number;
  includeRawLog: boolean;
  startTime: number;
}): Promise<ExtendedCrashAnalysis> {
  const { appId, deviceId, timeRangeSeconds, includeRawLog, startTime } = options;

  // Get device if not specified
  let targetDeviceId = deviceId;
  if (!targetDeviceId) {
    const bootedDevice = await getBootedDevice();
    if (!bootedDevice) {
      throw Errors.invalidArguments('No iOS simulator running. Please boot a simulator.');
    }
    targetDeviceId = bootedDevice.id;
  }

  // Capture OS logs
  const logs = await captureOSLog({
    deviceId: targetDeviceId,
    bundleId: appId,
    maxEntries: 1000,
    lastSeconds: timeRangeSeconds,
    timeoutMs: 30000,
  });

  // Also get crash-specific logs
  const crashLogs = appId
    ? await getIOSCrashLogs(appId, targetDeviceId)
    : [];

  // Combine logs
  const allLogs = [...logs, ...crashLogs];

  // Analyze logs for crash indicators
  const deviceLogSummary = analyzeDeviceLogs(allLogs, 'ios');
  const crashIndicators = deviceLogSummary.crashIndicators;

  // Generate report from logs
  const report = generateReportFromLogs(allLogs, crashIndicators, 'ios', appId);

  // Detect patterns
  const patterns = detectCrashPatterns(report);
  report.patterns = patterns;

  // Analyze patterns
  const analysis = analyzePatterns(report);
  const summary = generateCrashSummary(report);
  const description = crashIndicators.length > 0
    ? `iOS crash detected: ${crashIndicators[0].type} - ${crashIndicators[0].message}`
    : 'iOS log analysis complete (no crash detected)';

  if (!includeRawLog) {
    report.rawLog = undefined;
  }

  return {
    success: crashIndicators.length > 0 || deviceLogSummary.errorCount > 0,
    platform: 'ios',
    report,
    summary,
    patterns: analysis.patterns,
    suggestions: generateIOSSuggestions(crashIndicators, deviceLogSummary),
    durationMs: Date.now() - startTime,
    description,
    suspects: deviceLogSummary.keyErrors.slice(0, 5),
    reproducible: crashIndicators.length > 0,
    category: crashIndicators.length > 0 ? crashIndicators[0].type : 'none',
    dsymStatus: 'n/a',
    deviceId: targetDeviceId,
    appId,
    deviceLogs: deviceLogSummary,
  };
}

/**
 * Analyze device logs and extract crash indicators
 */
function analyzeDeviceLogs(logs: LogEntry[], platform: Platform): DeviceLogSummary {
  const summary: DeviceLogSummary = {
    totalEntries: logs.length,
    errorCount: 0,
    fatalCount: 0,
    keyErrors: [],
    stackTraces: [],
    crashIndicators: [],
  };

  let currentStackTrace: string[] = [];
  let inStackTrace = false;

  for (const log of logs) {
    // Count by level
    if (log.level === 'error') summary.errorCount++;
    if (log.level === 'fatal') summary.fatalCount++;

    const message = log.message || '';
    const tag = log.tag || '';

    // Detect crash indicators
    if (platform === 'android') {
      // Android-specific patterns
      // Check both tag (AndroidRuntime) and message (FATAL EXCEPTION, exception types)
      const isAndroidRuntimeCrash = tag === 'AndroidRuntime' || tag.includes('AndroidRuntime');
      const isFatalException = message.includes('FATAL EXCEPTION');
      const isJavaException = /\b(NullPointerException|IllegalStateException|IllegalArgumentException|ClassCastException|IndexOutOfBoundsException|RuntimeException|Exception)\b/.test(message);

      if (isAndroidRuntimeCrash || isFatalException) {
        summary.crashIndicators.push({
          type: 'exception',
          message: `[${tag}] ${message}`.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'critical',
        });
        inStackTrace = true;
      } else if (isJavaException && (log.level === 'error' || log.level === 'fatal')) {
        // Java exception in error log
        summary.crashIndicators.push({
          type: 'exception',
          message: `[${tag}] ${message}`.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'high',
        });
        inStackTrace = true;
      } else if (message.includes('ANR in') || message.includes('not responding')) {
        summary.crashIndicators.push({
          type: 'anr',
          message: `[${tag}] ${message}`.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'high',
        });
      } else if (message.includes('signal') && (message.includes('SIGSEGV') || message.includes('SIGABRT'))) {
        summary.crashIndicators.push({
          type: 'native_crash',
          message: `[${tag}] ${message}`.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'critical',
        });
      } else if (message.includes('OutOfMemoryError') || message.includes('OOM')) {
        summary.crashIndicators.push({
          type: 'oom',
          message: `[${tag}] ${message}`.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'high',
        });
      }
    } else {
      // iOS-specific patterns
      if (message.includes('*** Terminating') || message.includes('*** assertion failed')) {
        summary.crashIndicators.push({
          type: 'assertion',
          message: message.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'critical',
        });
        inStackTrace = true;
      } else if (message.includes('EXC_BAD_ACCESS') || message.includes('EXC_CRASH')) {
        summary.crashIndicators.push({
          type: 'signal',
          message: message.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'critical',
        });
      } else if (log.level === 'fatal') {
        summary.crashIndicators.push({
          type: 'exception',
          message: message.slice(0, 200),
          timestamp: log.timestamp,
          severity: 'high',
        });
      }
    }

    // Collect stack traces
    if (inStackTrace) {
      if (message.match(/^\s+at\s/) || message.match(/^\s*\d+\s+\w+/)) {
        currentStackTrace.push(message);
      } else if (currentStackTrace.length > 0) {
        summary.stackTraces.push(currentStackTrace.join('\n'));
        currentStackTrace = [];
        inStackTrace = false;
      }
    }

    // Collect key errors
    if (log.level === 'error' || log.level === 'fatal') {
      if (!summary.keyErrors.includes(message) && message.length > 0) {
        summary.keyErrors.push(message.slice(0, 300));
      }
    }
  }

  // Limit key errors
  summary.keyErrors = summary.keyErrors.slice(0, 20);

  return summary;
}

/**
 * Generate crash report from device logs
 */
function generateReportFromLogs(
  logs: LogEntry[],
  crashIndicators: CrashIndicator[],
  targetPlatform: Platform,
  appId?: string
): CrashReport {
  const now = new Date();

  // Build raw log from entries
  const rawLog = logs
    .map((l) => `${l.timestamp?.toISOString() || ''} [${l.level}] ${l.tag || ''}: ${l.message}`)
    .join('\n');

  // Build exception from crash indicators
  const exception: CrashException = crashIndicators.length > 0
    ? {
        type: crashIndicators[0].type,
        codes: crashIndicators[0].message,
        signal: crashIndicators[0].type === 'signal' ? 'SIGSEGV' : undefined,
      }
    : {
        type: 'unknown',
      };

  // Create empty crashed thread (no stack trace from logs typically)
  const crashedThread: ThreadInfo = {
    index: 0,
    crashed: true,
    frames: [],
  };

  return {
    timestamp: now,
    platform: targetPlatform,
    bundleId: appId,
    processName: appId || 'unknown',
    exception,
    threads: [crashedThread],
    crashedThread,
    binaryImages: [],
    isSymbolicated: false,
    patterns: [],
    rawLog,
  };
}

/**
 * Generate Android-specific suggestions
 */
function generateAndroidSuggestions(
  crashIndicators: CrashIndicator[],
  logs: DeviceLogSummary
): string[] {
  const suggestions: string[] = [];

  for (const indicator of crashIndicators) {
    switch (indicator.type) {
      case 'exception':
        suggestions.push('Check the exception stack trace for the root cause');
        suggestions.push('Look for NullPointerException, ClassCastException, or similar common exceptions');
        break;
      case 'anr':
        suggestions.push('Application Not Responding - check for long-running operations on the main thread');
        suggestions.push('Use StrictMode to detect slow operations during development');
        suggestions.push('Consider moving heavy operations to background threads');
        break;
      case 'native_crash':
        suggestions.push('Native crash detected - check NDK code and native libraries');
        suggestions.push('Use addr2line or ndk-stack to symbolicate the native stack trace');
        break;
      case 'oom':
        suggestions.push('Out of memory - profile memory usage with Android Profiler');
        suggestions.push('Check for memory leaks with LeakCanary');
        suggestions.push('Optimize bitmap and large object handling');
        break;
    }
  }

  if (logs.errorCount > 10) {
    suggestions.push(`High error count (${logs.errorCount}) - review error logs for recurring issues`);
  }

  if (suggestions.length === 0) {
    suggestions.push('No crash detected in recent logs');
    suggestions.push('Try reproducing the issue and run analysis again');
  }

  return suggestions;
}

/**
 * Generate iOS-specific suggestions
 */
function generateIOSSuggestions(
  crashIndicators: CrashIndicator[],
  logs: DeviceLogSummary
): string[] {
  const suggestions: string[] = [];

  for (const indicator of crashIndicators) {
    switch (indicator.type) {
      case 'assertion':
        suggestions.push('Assertion failure - check the assertion condition and fix the code logic');
        break;
      case 'signal':
        suggestions.push('Signal crash (memory access) - check for null pointer dereference or use-after-free');
        suggestions.push('Enable Address Sanitizer in Xcode for detailed memory debugging');
        break;
      case 'exception':
        suggestions.push('Exception thrown - check the exception message for details');
        suggestions.push('Use breakpoints on exceptions in Xcode to catch them at runtime');
        break;
    }
  }

  if (logs.errorCount > 10) {
    suggestions.push(`High error count (${logs.errorCount}) - review error logs for recurring issues`);
  }

  if (suggestions.length === 0) {
    suggestions.push('No crash detected in recent logs');
    suggestions.push('Try reproducing the issue and run analysis again');
    suggestions.push('Check ~/Library/Logs/DiagnosticReports for crash files');
  }

  return suggestions;
}

/**
 * Attempt to symbolicate the crash report
 */
async function attemptSymbolication(
  report: CrashReport,
  dsymPath?: string,
  bundleId?: string
): Promise<{ report: CrashReport; status: 'found' | 'not_found' | 'mismatch' }> {
  // Already symbolicated?
  if (report.isSymbolicated) {
    return { report, status: 'found' };
  }

  // Find app binary
  const appBinary = findAppBinary(report);
  if (!appBinary) {
    return { report, status: 'not_found' };
  }

  // Try to find dSYM
  let dsymFile: string | undefined;

  if (dsymPath) {
    dsymFile = findDSYMFile(dsymPath, appBinary.name);
    if (!dsymFile) {
      console.error(`[analyze_crash] dSYM not found at specified path: ${dsymPath}`);
    }
  }

  // Search common locations if not found
  if (!dsymFile) {
    const searchBundleId = bundleId || report.bundleId;
    if (searchBundleId) {
      dsymFile = findDSYMInCommonLocations(searchBundleId, appBinary.uuid);
    }
  }

  if (!dsymFile) {
    return { report, status: 'not_found' };
  }

  // Verify UUID match (optional but recommended)
  const uuidMatches = await verifyDSYMMatch(dsymFile, appBinary.uuid);
  if (!uuidMatches) {
    console.error(
      `[analyze_crash] dSYM UUID mismatch. Expected: ${appBinary.uuid}`
    );
    // Continue anyway - user may have provided correct dSYM
  }

  // Symbolicate
  try {
    const symbolicated = await symbolicateCrashReport(report, {
      dsymPath: dsymFile,
      arch: appBinary.arch,
      timeoutMs: 30000,
    });

    return {
      report: symbolicated,
      status: uuidMatches || symbolicated.isSymbolicated ? 'found' : 'mismatch',
    };
  } catch (error) {
    console.error(`[analyze_crash] Symbolication failed: ${error}`);
    return { report, status: 'not_found' };
  }
}

/**
 * Create AI-friendly output for the crash analysis
 */
export function formatAnalysisForAI(result: ExtendedCrashAnalysis): string {
  const lines: string[] = [];

  if (!result.success && !result.deviceLogs) {
    lines.push(`## Crash Analysis Failed`);
    lines.push(``);
    lines.push(`**Error**: ${result.error}`);
    lines.push(``);
    lines.push(`**Suggestions**:`);
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    return lines.join('\n');
  }

  lines.push(`## Crash Analysis - ${result.platform.toUpperCase()}`);
  lines.push(``);
  lines.push(`**Description**: ${result.description}`);
  lines.push(`**Category**: ${result.category}`);
  lines.push(`**Severity**: ${result.patterns[0]?.severity || (result.deviceLogs?.crashIndicators[0]?.severity) || 'unknown'}`);
  lines.push(`**Reproducible**: ${result.reproducible ? 'Likely' : 'May be flaky'}`);

  if (result.dsymStatus !== 'n/a') {
    lines.push(`**Symbolication**: ${result.dsymStatus}`);
  }

  if (result.deviceId) {
    lines.push(`**Device**: ${result.deviceId}`);
  }
  if (result.appId) {
    lines.push(`**App ID**: ${result.appId}`);
  }
  lines.push(``);

  // Device log summary
  if (result.deviceLogs) {
    lines.push(`### Device Log Analysis`);
    lines.push(``);
    lines.push(`- Total entries analyzed: ${result.deviceLogs.totalEntries}`);
    lines.push(`- Errors found: ${result.deviceLogs.errorCount}`);
    lines.push(`- Fatal/crash entries: ${result.deviceLogs.fatalCount}`);
    lines.push(`- Crash indicators detected: ${result.deviceLogs.crashIndicators.length}`);
    lines.push(``);

    if (result.deviceLogs.crashIndicators.length > 0) {
      lines.push(`### Crash Indicators`);
      lines.push(``);
      for (const indicator of result.deviceLogs.crashIndicators.slice(0, 5)) {
        lines.push(`- **[${indicator.severity.toUpperCase()}] ${indicator.type}**: ${indicator.message}`);
      }
      lines.push(``);
    }

    if (result.deviceLogs.stackTraces.length > 0) {
      lines.push(`### Stack Traces`);
      lines.push(``);
      lines.push('```');
      lines.push(result.deviceLogs.stackTraces[0].slice(0, 1000));
      lines.push('```');
      lines.push(``);
    }
  }

  if (result.suspects.length > 0) {
    lines.push(`### Key Errors/Suspects`);
    lines.push(``);
    for (const suspect of result.suspects.slice(0, 5)) {
      lines.push(`- \`${suspect.slice(0, 150)}\``);
    }
    lines.push(``);
  }

  if (result.summary) {
    lines.push(result.summary);
  }

  if (result.suggestions.length > 0) {
    lines.push(``);
    lines.push(`### Recommended Actions`);
    lines.push(``);
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Register the analyze_crash tool
 */
export function registerAnalyzeCrashTool(): void {
  getToolRegistry().register(
    'analyze_crash',
    {
      description:
        'Analyze crash logs and device logs to identify crash patterns and root causes. ' +
        'Supports both Android (logcat) and iOS (crash files + oslog). ' +
        'For live device analysis, checks device logs automatically. ' +
        'For iOS, can also analyze .ips/.crash files with symbolication.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform to analyze',
          },
          appId: {
            type: 'string',
            description: 'App ID (Android package name or iOS bundle ID) for live device log analysis',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID for analysis (optional, uses first available device)',
          },
          crashLogPath: {
            type: 'string',
            description: 'Path to iOS crash log file (.ips or .crash) - iOS only, optional for live analysis',
          },
          dsymPath: {
            type: 'string',
            description: 'Path to dSYM file or directory - iOS only (optional, searches common locations)',
          },
          timeRangeSeconds: {
            type: 'number',
            description: 'Time range in seconds to search device logs (default: 300 = 5 minutes)',
          },
          skipSymbolication: {
            type: 'boolean',
            description: 'Skip symbolication for faster analysis - iOS only (default: false)',
          },
          includeRawLog: {
            type: 'boolean',
            description: 'Include raw log data in output (default: false)',
          },
        },
        ['platform']
      ),
    },
    async (args) => {
      const result = await analyzeCrash(args as unknown as AnalyzeCrashArgs);
      return {
        ...result,
        formattedOutput: formatAnalysisForAI(result),
      };
    }
  );
}
