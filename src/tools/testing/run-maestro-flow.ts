/**
 * run_maestro_flow Tool Handler
 * MCP tool for running Maestro E2E test flows
 */

import { isPlatform, Platform } from '../../models/constants.js';
import { FlowResult } from '../../models/failure-bundle.js';
import { Errors } from '../../models/errors.js';
import { runMaestroFlow, isMaestroAvailable, MaestroRunOptions } from './maestro-executor.js';
import { generateFailureBundle, getFailureBundleSummary } from './failure-bundle.js';
import { getToolRegistry, createInputSchema } from '../register.js';
import { listDevices as listAndroidDevices } from '../../platforms/android/adb.js';
import { getBootedDevice } from '../../platforms/ios/simctl.js';

/**
 * Input arguments for run_maestro_flow tool
 */
export interface RunMaestroFlowArgs {
  /** Path to the Maestro flow YAML file */
  flowPath: string;
  /** Target platform */
  platform: string;
  /** Device ID (optional, uses first available) */
  deviceId?: string;
  /** App package/bundle ID */
  appId?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Generate failure bundle on failure */
  generateFailureBundle?: boolean;
  /** Environment variables for the flow */
  env?: Record<string, string>;
}

/**
 * Result structure for run_maestro_flow
 */
export interface RunMaestroFlowResult {
  /** Flow execution result */
  flowResult: FlowResult;
  /** Failure bundle if test failed and generateFailureBundle is true */
  failureBundle?: ReturnType<typeof getFailureBundleSummary>;
  /** Summary for AI consumption */
  summary: string;
}

/**
 * Run Maestro flow tool handler
 */
export async function runMaestroFlowTool(args: RunMaestroFlowArgs): Promise<RunMaestroFlowResult> {
  const {
    flowPath,
    platform,
    deviceId,
    appId,
    timeoutMs = 300000,
    generateFailureBundle: shouldGenerateBundle = true,
    env = {},
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Check if Maestro is available
  const maestroAvailable = await isMaestroAvailable();
  if (!maestroAvailable) {
    throw Errors.invalidArguments(
      'Maestro CLI not found. Install from https://maestro.mobile.dev/'
    );
  }

  // Get target device
  const resolvedDeviceId = await resolveDevice(platform as Platform, deviceId);
  if (!resolvedDeviceId) {
    throw Errors.invalidArguments(`No ${platform} device found`);
  }

  // Run the flow
  const maestroOptions: MaestroRunOptions = {
    flowPath,
    platform: platform as Platform,
    deviceId: resolvedDeviceId,
    appId,
    timeoutMs,
    env,
  };

  const flowResult = await runMaestroFlow(maestroOptions);

  // Build result
  const result: RunMaestroFlowResult = {
    flowResult,
    summary: createFlowSummary(flowResult),
  };

  // Generate failure bundle if flow failed
  if (!flowResult.success && shouldGenerateBundle) {
    try {
      const bundle = await generateFailureBundle({
        flowResult,
        platform: platform as Platform,
        deviceId: resolvedDeviceId,
        appIdentifier: appId,
        includeScreenshot: true,
        includeLogs: platform === 'android',
      });
      result.failureBundle = getFailureBundleSummary(bundle);
    } catch (error) {
      console.error('[run_maestro_flow] Failed to generate failure bundle:', error);
    }
  }

  return result;
}

/**
 * Resolve device ID for the target platform
 */
async function resolveDevice(platform: Platform, deviceId?: string): Promise<string | null> {
  if (platform === 'android') {
    const devices = await listAndroidDevices();

    if (deviceId) {
      const found = devices.find(
        (d) => d.id === deviceId || d.name === deviceId || d.model === deviceId
      );
      return found?.id || null;
    }

    const booted = devices.find((d) => d.status === 'booted');
    return booted?.id || null;
  } else {
    if (deviceId) {
      // Assume deviceId is a UDID
      return deviceId;
    }

    const booted = await getBootedDevice();
    return booted?.id || null;
  }
}

/**
 * Create summary for AI consumption
 */
function createFlowSummary(flowResult: FlowResult): string {
  const lines: string[] = [
    `Flow: ${flowResult.flowName}`,
    `Status: ${flowResult.success ? 'PASSED' : 'FAILED'}`,
    `Steps: ${flowResult.passedSteps}/${flowResult.totalSteps} passed`,
    `Duration: ${(flowResult.durationMs / 1000).toFixed(2)}s`,
  ];

  if (!flowResult.success) {
    if (flowResult.failedAtStep >= 0 && flowResult.steps[flowResult.failedAtStep]) {
      const failedStep = flowResult.steps[flowResult.failedAtStep];
      lines.push(`Failed at step ${failedStep.index + 1}: ${failedStep.command}`);
      if (failedStep.error) {
        lines.push(`Error: ${failedStep.error}`);
      }
    } else if (flowResult.error) {
      lines.push(`Error: ${flowResult.error}`);
    }
  }

  return lines.join('\n');
}

/**
 * Register the run_maestro_flow tool
 */
export function registerRunMaestroFlowTool(): void {
  getToolRegistry().register(
    'run_maestro_flow',
    {
      description:
        'Run a Maestro E2E test flow. Returns structured results with step-by-step status. On failure, generates a failure bundle with screenshot and logs for debugging.',
      inputSchema: createInputSchema(
        {
          flowPath: {
            type: 'string',
            description: 'Path to the Maestro flow YAML file',
          },
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID or name (optional, uses first available)',
          },
          appId: {
            type: 'string',
            description: 'App package (Android) or bundle ID (iOS)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 300000)',
          },
          generateFailureBundle: {
            type: 'boolean',
            description: 'Generate failure bundle with screenshot and logs on failure (default: true)',
          },
          env: {
            type: 'object',
            description: 'Environment variables for the flow',
            additionalProperties: { type: 'string' },
          },
        },
        ['flowPath', 'platform']
      ),
    },
    (args) => runMaestroFlowTool(args as unknown as RunMaestroFlowArgs)
  );
}
