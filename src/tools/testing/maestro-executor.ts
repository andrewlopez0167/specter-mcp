/**
 * Maestro Flow Executor
 * Runs Maestro E2E test flows and captures results
 */

import { existsSync } from 'fs';
import { basename } from 'path';
import { executeShell } from '../../utils/shell.js';
import { FlowResult, FlowStep } from '../../models/failure-bundle.js';
import { Platform } from '../../models/constants.js';

/**
 * Options for running Maestro flows
 */
export interface MaestroRunOptions {
  /** Path to the flow YAML file */
  flowPath: string;
  /** Target platform */
  platform: Platform;
  /** Device ID */
  deviceId?: string;
  /** App package/bundle ID */
  appId?: string;
  /** Timeout for the entire flow in milliseconds */
  timeoutMs?: number;
  /** Output format (Maestro supports: JUNIT, HTML, NOOP) */
  format?: 'junit' | 'html' | 'noop';
  /** Output path for reports */
  outputPath?: string;
  /** Environment variables for the flow */
  env?: Record<string, string>;
}

/**
 * Run a Maestro flow
 */
export async function runMaestroFlow(options: MaestroRunOptions): Promise<FlowResult> {
  const {
    flowPath,
    platform,
    deviceId,
    appId,
    timeoutMs = 300000, // 5 minutes
    format,
    outputPath,
    env = {},
  } = options;

  // Validate flow file exists
  if (!existsSync(flowPath)) {
    return {
      flowName: basename(flowPath),
      flowPath,
      success: false,
      totalSteps: 0,
      passedSteps: 0,
      failedAtStep: -1,
      durationMs: 0,
      steps: [],
      error: `Flow file not found: ${flowPath}`,
    };
  }

  const startTime = Date.now();
  const flowName = basename(flowPath);

  // Build Maestro command - global options must come BEFORE 'test' subcommand
  const args: string[] = [];

  // Add global device selection (must come before 'test')
  if (deviceId) {
    args.push('--device', deviceId);
  }

  // Add global platform option (must come before 'test')
  args.push('--platform', platform);

  // Now add the test subcommand and flow path
  args.push('test');

  // Add app ID as environment variable via -e flag (required for Maestro)
  if (appId) {
    args.push('-e', `APP_ID=${appId}`);
  }

  // Add custom env vars
  for (const [key, value] of Object.entries(env)) {
    args.push('-e', `${key}=${value}`);
  }

  // Add format and output (Maestro supports: JUNIT, HTML, NOOP)
  if (format) {
    args.push('--format', format.toUpperCase());
  }

  if (outputPath) {
    args.push('--output', outputPath);
  }

  // Add flow path last
  args.push(flowPath);

  // Build environment
  const envVars: Record<string, string> = {
    ...process.env as Record<string, string>,
  };

  // Run Maestro
  const result = await executeShell('maestro', args, {
    timeoutMs,
    silent: false,
    env: envVars,
  });

  const durationMs = Date.now() - startTime;

  // Build FlowResult by parsing steps from raw output
  const steps: FlowStep[] = [];
  let failedAtStep = -1;
  let passedSteps = 0;

  // Parse steps from stdout
  const parsedSteps = parseStepsFromOutput(result.stdout);
  for (let i = 0; i < parsedSteps.length; i++) {
    const step = parsedSteps[i];
    if (step.status === 'passed') passedSteps++;
    if (step.status === 'failed' && failedAtStep === -1) failedAtStep = i;
    steps.push(step);
  }

  const success = result.exitCode === 0 && failedAtStep === -1;

  return {
    flowName,
    flowPath,
    success,
    totalSteps: steps.length,
    passedSteps,
    failedAtStep,
    durationMs,
    steps,
    error: !success ? (result.stderr || 'Flow execution failed') : undefined,
  };
}

/**
 * Parse flow steps from Maestro raw output
 */
function parseStepsFromOutput(output: string): FlowStep[] {
  const steps: FlowStep[] = [];
  const lines = output.split('\n');

  let stepIndex = 0;
  for (const line of lines) {
    // Match Maestro step output patterns
    // Example: "✓ tapOn: Login button (1.2s)"
    // Example: "✗ assertVisible: Welcome text (timeout)"
    const passMatch = line.match(/[✓✅]\s+(\w+)(?::\s+(.+))?\s+\(([^)]+)\)/);
    const failMatch = line.match(/[✗❌]\s+(\w+)(?::\s+(.+))?\s+\(([^)]+)\)/);
    const skipMatch = line.match(/[⊘○]\s+(\w+)(?::\s+(.+))?/);

    if (passMatch) {
      steps.push({
        index: stepIndex++,
        command: passMatch[1],
        args: passMatch[2] ? { target: passMatch[2] } : {},
        status: 'passed',
        durationMs: parseDuration(passMatch[3]),
      });
    } else if (failMatch) {
      steps.push({
        index: stepIndex++,
        command: failMatch[1],
        args: failMatch[2] ? { target: failMatch[2] } : {},
        status: 'failed',
        durationMs: parseDuration(failMatch[3]),
        error: failMatch[3],
      });
    } else if (skipMatch) {
      steps.push({
        index: stepIndex++,
        command: skipMatch[1],
        args: skipMatch[2] ? { target: skipMatch[2] } : {},
        status: 'skipped',
        durationMs: 0,
      });
    }
  }

  return steps;
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(durationStr: string): number {
  const match = durationStr.match(/([\d.]+)\s*(s|ms|m)?/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2] || 's';

  switch (unit) {
    case 'ms': return value;
    case 's': return value * 1000;
    case 'm': return value * 60000;
    default: return value * 1000;
  }
}

/**
 * Check if Maestro CLI is available
 */
export async function isMaestroAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('maestro', ['--version'], {
      timeoutMs: 5000,
      silent: true,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Get Maestro version
 */
export async function getMaestroVersion(): Promise<string | null> {
  try {
    const result = await executeShell('maestro', ['--version'], {
      timeoutMs: 5000,
      silent: true,
    });
    if (result.exitCode === 0) {
      return result.stdout.trim();
    }
  } catch {
    // Maestro not available
  }
  return null;
}
