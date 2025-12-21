/**
 * Failure Bundle Generator
 * Creates comprehensive failure bundles for E2E test debugging
 */

import { Platform } from '../../models/constants.js';
import {
  FailureBundle,
  FlowResult,
  CapturedLog,
  generateBundleId,
  analyzeFailure,
  filterLogsAroundFailure,
} from '../../models/failure-bundle.js';
import { ScreenshotData } from '../../models/ui-context.js';
import { takeScreenshot as takeAndroidScreenshot, captureLogcat } from '../../platforms/android/adb.js';
import { takeScreenshot as takeIOSScreenshot } from '../../platforms/ios/simctl.js';
import { compressScreenshot } from '../../utils/image.js';

/**
 * Options for generating failure bundle
 */
export interface FailureBundleOptions {
  /** Flow execution result */
  flowResult: FlowResult;
  /** Target platform */
  platform: Platform;
  /** Device ID */
  deviceId: string;
  /** App package/bundle ID */
  appIdentifier?: string;
  /** Include screenshot */
  includeScreenshot?: boolean;
  /** Include logs */
  includeLogs?: boolean;
  /** Log window in milliseconds (before and after failure) */
  logWindowMs?: number;
  /** Include UI hierarchy */
  includeUiHierarchy?: boolean;
}

/**
 * Generate a failure bundle for debugging
 */
export async function generateFailureBundle(
  options: FailureBundleOptions
): Promise<FailureBundle> {
  const {
    flowResult,
    platform,
    deviceId,
    appIdentifier,
    includeScreenshot = true,
    includeLogs = true,
    logWindowMs = 10000,
    includeUiHierarchy = false,
  } = options;

  const bundle: FailureBundle = {
    id: generateBundleId(),
    timestamp: Date.now(),
    platform,
    deviceId,
    flowResult,
    logs: [],
    suggestions: [],
  };

  // Add app identifier
  if (appIdentifier) {
    bundle.appIdentifier = appIdentifier;
  }

  // Capture screenshot at failure point
  if (includeScreenshot && !flowResult.success) {
    try {
      bundle.failureScreenshot = await captureFailureScreenshot(platform, deviceId);
    } catch (error) {
      console.error('[failure-bundle] Failed to capture screenshot:', error);
    }
  }

  // Capture logs around failure time
  if (includeLogs && platform === 'android') {
    try {
      const failureTime = bundle.timestamp;
      const logs = await captureRecentLogs(deviceId, appIdentifier, logWindowMs);
      bundle.logs = filterLogsAroundFailure(logs, failureTime, logWindowMs);
    } catch (error) {
      console.error('[failure-bundle] Failed to capture logs:', error);
    }
  }

  // Capture UI hierarchy (if requested)
  if (includeUiHierarchy) {
    // UI hierarchy capture would be done here
    // Currently skipped as it requires additional implementation
  }

  // Analyze failure and generate suggestions
  bundle.suggestions = analyzeFailure(bundle);

  return bundle;
}

/**
 * Capture screenshot at failure point
 */
async function captureFailureScreenshot(
  platform: Platform,
  deviceId: string
): Promise<ScreenshotData> {
  let screenshotBuffer: Buffer;

  if (platform === 'android') {
    screenshotBuffer = await takeAndroidScreenshot(deviceId);
  } else {
    screenshotBuffer = await takeIOSScreenshot(deviceId);
  }

  return compressScreenshot(screenshotBuffer, {
    quality: 60,
    format: 'jpeg',
  });
}

/**
 * Capture recent logs from device
 */
async function captureRecentLogs(
  deviceId: string,
  appIdentifier?: string,
  windowMs: number = 10000
): Promise<CapturedLog[]> {
  const logs: CapturedLog[] = [];

  // Capture logcat output
  const logcatOutput = await captureLogcat(deviceId, {
    filterByPackage: appIdentifier,
    maxLines: 500,
    since: new Date(Date.now() - windowMs),
  });

  // Parse logcat output into structured logs
  const lines = logcatOutput.split('\n');
  for (const line of lines) {
    const parsed = parseLogcatLine(line);
    if (parsed) {
      logs.push(parsed);
    }
  }

  return logs;
}

/**
 * Parse a single logcat line
 */
function parseLogcatLine(line: string): CapturedLog | null {
  // Logcat format: "MM-DD HH:MM:SS.mmm PID TID LEVEL TAG: message"
  const match = line.match(
    /^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^:]+):\s*(.*)$/
  );

  if (!match) return null;

  const [, timestamp, pid, level, tag, message] = match;

  // Parse timestamp to epoch (approximate, uses current year)
  const now = new Date();
  const [monthDay, time] = timestamp.split(/\s+/);
  const [month, day] = monthDay.split('-').map(Number);
  const [hours, minutes, secondsMs] = time.split(':');
  const [seconds, ms] = secondsMs.split('.').map(Number);

  const logDate = new Date(
    now.getFullYear(),
    month - 1,
    day,
    Number(hours),
    Number(minutes),
    seconds,
    ms
  );

  return {
    timestamp: logDate.getTime(),
    level: mapLogLevel(level),
    tag: tag.trim(),
    message: message.trim(),
    pid: parseInt(pid),
  };
}

/**
 * Map logcat level character to CapturedLog level
 */
function mapLogLevel(level: string): CapturedLog['level'] {
  switch (level) {
    case 'V': return 'verbose';
    case 'D': return 'debug';
    case 'I': return 'info';
    case 'W': return 'warn';
    case 'E':
    case 'F': return 'error';
    default: return 'info';
  }
}

/**
 * Create a minimal failure bundle (no screenshots or logs)
 */
export function createMinimalFailureBundle(
  flowResult: FlowResult,
  platform: Platform,
  deviceId: string
): FailureBundle {
  const bundle: FailureBundle = {
    id: generateBundleId(),
    timestamp: Date.now(),
    platform,
    deviceId,
    flowResult,
    logs: [],
    suggestions: [],
  };

  bundle.suggestions = analyzeFailure(bundle);

  return bundle;
}

/**
 * Serialize failure bundle for storage/transmission
 */
export function serializeFailureBundle(bundle: FailureBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/**
 * Get summary of failure bundle for AI consumption
 */
export function getFailureBundleSummary(bundle: FailureBundle): string {
  const lines: string[] = [
    `Failure Bundle: ${bundle.id}`,
    `Platform: ${bundle.platform}`,
    `Device: ${bundle.deviceId}`,
    `Flow: ${bundle.flowResult.flowName}`,
    `Status: ${bundle.flowResult.success ? 'SUCCESS' : 'FAILED'}`,
    '',
  ];

  if (!bundle.flowResult.success) {
    lines.push(`Failed at step: ${bundle.flowResult.failedAtStep + 1} of ${bundle.flowResult.totalSteps}`);

    if (bundle.flowResult.failedAtStep >= 0) {
      const failedStep = bundle.flowResult.steps[bundle.flowResult.failedAtStep];
      if (failedStep) {
        lines.push(`Failed command: ${failedStep.command}`);
        if (failedStep.error) {
          lines.push(`Error: ${failedStep.error}`);
        }
      }
    }

    lines.push('');
  }

  if (bundle.suggestions.length > 0) {
    lines.push('Suggestions:');
    for (const suggestion of bundle.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
    lines.push('');
  }

  if (bundle.logs.length > 0) {
    const errorLogs = bundle.logs.filter((l) => l.level === 'error');
    if (errorLogs.length > 0) {
      lines.push(`Error logs: ${errorLogs.length} entries`);
      for (const log of errorLogs.slice(0, 3)) {
        lines.push(`  [${log.tag}] ${log.message.slice(0, 80)}`);
      }
    }
  }

  if (bundle.failureScreenshot) {
    lines.push(`Screenshot: ${bundle.failureScreenshot.width}x${bundle.failureScreenshot.height}`);
  }

  return lines.join('\n');
}
