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
  /** Output format */
  format?: 'json' | 'junit';
  /** Output path for reports */
  outputPath?: string;
  /** Environment variables for the flow */
  env?: Record<string, string>;
}

/**
 * Maestro CLI output structure
 */
interface MaestroOutput {
  status: 'SUCCESS' | 'ERROR' | 'CANCELED';
  errorMessage?: string;
  steps?: Array<{
    command: string;
    status: 'COMPLETED' | 'FAILED' | 'SKIPPED';
    duration: number;
    error?: string;
  }>;
  duration?: number;
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
    format = 'json',
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

  // Build Maestro command
  const args: string[] = ['test', flowPath];

  // Add device selection
  if (deviceId) {
    args.push('--device', deviceId);
  }

  // Add platform-specific options
  if (platform === 'android') {
    args.push('--platform', 'android');
  } else {
    args.push('--platform', 'ios');
  }

  // Add format and output
  if (format === 'json') {
    args.push('--format', 'json');
  }

  if (outputPath) {
    args.push('--output', outputPath);
  }

  // Build environment
  const envVars: Record<string, string> = {
    ...process.env as Record<string, string>,
    ...env,
  };

  if (appId) {
    envVars['APP_ID'] = appId;
  }

  // Run Maestro
  const result = await executeShell('maestro', args, {
    timeoutMs,
    silent: false,
    env: envVars,
  });

  const durationMs = Date.now() - startTime;

  // Parse output
  let maestroOutput: MaestroOutput | null = null;
  try {
    // Try to parse JSON output from stdout
    const jsonMatch = result.stdout.match(/\{[\s\S]*"status"[\s\S]*\}/);
    if (jsonMatch) {
      maestroOutput = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Output parsing failed, use raw output
  }

  // Build FlowResult
  const steps: FlowStep[] = [];
  let failedAtStep = -1;
  let passedSteps = 0;

  if (maestroOutput?.steps) {
    for (let i = 0; i < maestroOutput.steps.length; i++) {
      const step = maestroOutput.steps[i];
      const status = step.status === 'COMPLETED' ? 'passed' :
                     step.status === 'FAILED' ? 'failed' : 'skipped';

      if (status === 'passed') passedSteps++;
      if (status === 'failed' && failedAtStep === -1) failedAtStep = i;

      steps.push({
        index: i,
        command: step.command,
        args: {},
        status,
        durationMs: step.duration || 0,
        error: step.error,
      });
    }
  } else {
    // Parse steps from raw output if JSON not available
    const parsedSteps = parseStepsFromOutput(result.stdout);
    for (let i = 0; i < parsedSteps.length; i++) {
      const step = parsedSteps[i];
      if (step.status === 'passed') passedSteps++;
      if (step.status === 'failed' && failedAtStep === -1) failedAtStep = i;
      steps.push(step);
    }
  }

  const success = result.exitCode === 0 &&
                  (maestroOutput?.status === 'SUCCESS' || failedAtStep === -1);

  return {
    flowName,
    flowPath,
    success,
    totalSteps: steps.length,
    passedSteps,
    failedAtStep,
    durationMs,
    steps,
    error: !success ? (maestroOutput?.errorMessage || result.stderr || 'Flow execution failed') : undefined,
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
