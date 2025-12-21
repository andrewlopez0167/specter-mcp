/**
 * Failure Bundle Models
 * Comprehensive failure bundles for E2E test debugging
 */

import { ScreenshotData } from './ui-context.js';
import { Platform } from './constants.js';

/**
 * Maestro flow step result
 */
export interface FlowStep {
  /** Step index (0-based) */
  index: number;
  /** Step command (e.g., "tapOn", "assertVisible") */
  command: string;
  /** Step arguments */
  args: Record<string, unknown>;
  /** Step status */
  status: 'passed' | 'failed' | 'skipped';
  /** Duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Screenshot at this step (if captured) */
  screenshot?: ScreenshotData;
}

/**
 * Maestro flow result
 */
export interface FlowResult {
  /** Flow file name */
  flowName: string;
  /** Flow file path */
  flowPath: string;
  /** Overall success */
  success: boolean;
  /** Total steps */
  totalSteps: number;
  /** Passed steps */
  passedSteps: number;
  /** Failed step index (-1 if all passed) */
  failedAtStep: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Individual step results */
  steps: FlowStep[];
  /** Error message if failed */
  error?: string;
}

/**
 * Log entries captured during test
 */
export interface CapturedLog {
  /** Log timestamp */
  timestamp: number;
  /** Log level */
  level: 'verbose' | 'debug' | 'info' | 'warn' | 'error';
  /** Log tag/source */
  tag: string;
  /** Log message */
  message: string;
  /** Process ID */
  pid?: number;
}

/**
 * Failure bundle for comprehensive debugging
 * Contains all context needed to diagnose E2E test failures
 */
export interface FailureBundle {
  /** Unique bundle ID */
  id: string;
  /** Creation timestamp */
  timestamp: number;
  /** Target platform */
  platform: Platform;
  /** Device ID */
  deviceId: string;
  /** Flow result */
  flowResult: FlowResult;
  /** Screenshot at failure point */
  failureScreenshot?: ScreenshotData;
  /** Screenshot before failure (if available) */
  previousScreenshot?: ScreenshotData;
  /** Relevant logs around failure time */
  logs: CapturedLog[];
  /** UI hierarchy at failure (if captured) */
  uiHierarchy?: string;
  /** App package/bundle ID */
  appIdentifier?: string;
  /** Device info */
  deviceInfo?: {
    model: string;
    osVersion: string;
    screenSize: { width: number; height: number };
  };
  /** Analysis suggestions */
  suggestions: string[];
}

/**
 * Generate unique bundle ID
 */
export function generateBundleId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `fb-${timestamp}-${random}`;
}

/**
 * Analyze failure and generate suggestions
 */
export function analyzeFailure(bundle: FailureBundle): string[] {
  const suggestions: string[] = [];
  const flowResult = bundle.flowResult;

  if (!flowResult.success && flowResult.failedAtStep >= 0) {
    const failedStep = flowResult.steps[flowResult.failedAtStep];

    if (failedStep) {
      // Analyze based on command type
      switch (failedStep.command) {
        case 'tapOn':
        case 'tap':
          suggestions.push(
            'Element may not be visible or clickable. Check if the element exists in the UI hierarchy.'
          );
          suggestions.push(
            'Consider adding a wait before the tap to ensure the element is rendered.'
          );
          break;

        case 'assertVisible':
        case 'assertExists':
          suggestions.push(
            'Expected element not found on screen. Verify the element identifier matches the app.'
          );
          suggestions.push(
            'Check if the app navigated to the expected screen before this assertion.'
          );
          break;

        case 'inputText':
        case 'enterText':
          suggestions.push(
            'Text input may have failed. Check if the input field is focused and editable.'
          );
          suggestions.push(
            'Verify no keyboard overlay is blocking the input field.'
          );
          break;

        case 'scroll':
        case 'swipe':
          suggestions.push(
            'Scroll/swipe gesture may not have reached the target. Try adjusting scroll distance.'
          );
          break;

        case 'launchApp':
          suggestions.push(
            'App launch failed. Check if the app is installed and the bundle ID is correct.'
          );
          break;

        default:
          suggestions.push(
            `Step "${failedStep.command}" failed. Review the error message for details.`
          );
      }

      // Check error message patterns
      if (failedStep.error) {
        const error = failedStep.error.toLowerCase();

        if (error.includes('timeout')) {
          suggestions.push(
            'Operation timed out. The app may be slow or unresponsive. Consider increasing timeouts.'
          );
        }
        if (error.includes('not found') || error.includes('no match')) {
          suggestions.push(
            'Element selector may need adjustment. Check for dynamic IDs or changed element structure.'
          );
        }
        if (error.includes('crash') || error.includes('terminated')) {
          suggestions.push(
            'App appears to have crashed. Check crash logs for the root cause.'
          );
        }
      }
    }
  }

  // Analyze logs for additional context
  const errorLogs = bundle.logs.filter((l) => l.level === 'error');
  if (errorLogs.length > 0) {
    suggestions.push(
      `Found ${errorLogs.length} error log entries. Review logs for crash or exception details.`
    );
  }

  // Check for common patterns in logs
  const logText = bundle.logs.map((l) => l.message).join(' ').toLowerCase();
  if (logText.includes('out of memory') || logText.includes('oom') || logText.includes('outofmemory')) {
    suggestions.push('Memory issue detected. The app may be running out of memory.');
  }
  if (logText.includes('network') || logText.includes('connection')) {
    suggestions.push('Network-related issues in logs. Check if the test requires network connectivity.');
  }
  if (logText.includes('permission')) {
    suggestions.push('Permission issue detected. Ensure the app has required permissions granted.');
  }

  return suggestions;
}

/**
 * Create failure summary for AI consumption
 */
export function createFailureSummary(bundle: FailureBundle): string {
  const lines: string[] = [
    `Failure Bundle: ${bundle.id}`,
    `Flow: ${bundle.flowResult.flowName}`,
    `Platform: ${bundle.platform}`,
    `Device: ${bundle.deviceId}`,
    '',
    `Steps: ${bundle.flowResult.passedSteps}/${bundle.flowResult.totalSteps} passed`,
  ];

  if (bundle.flowResult.failedAtStep >= 0) {
    const failedStep = bundle.flowResult.steps[bundle.flowResult.failedAtStep];
    if (failedStep) {
      lines.push(`Failed at step ${failedStep.index + 1}: ${failedStep.command}`);
      if (failedStep.error) {
        lines.push(`Error: ${failedStep.error.slice(0, 200)}`);
      }
    }
  }

  if (bundle.suggestions.length > 0) {
    lines.push('', 'Suggestions:');
    for (const suggestion of bundle.suggestions.slice(0, 3)) {
      lines.push(`  - ${suggestion}`);
    }
  }

  const errorLogs = bundle.logs.filter((l) => l.level === 'error').slice(0, 3);
  if (errorLogs.length > 0) {
    lines.push('', 'Recent Errors:');
    for (const log of errorLogs) {
      lines.push(`  [${log.tag}] ${log.message.slice(0, 100)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Filter logs around failure time
 */
export function filterLogsAroundFailure(
  logs: CapturedLog[],
  failureTime: number,
  windowMs: number = 5000
): CapturedLog[] {
  const startTime = failureTime - windowMs;
  const endTime = failureTime + windowMs;

  return logs.filter((log) => log.timestamp >= startTime && log.timestamp <= endTime);
}
