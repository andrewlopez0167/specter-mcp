/**
 * Specter MCP Error Types
 * Standard error codes and error structure for all tool responses
 */

export type ErrorCode =
  | 'DEVICE_NOT_FOUND'
  | 'DEVICE_NOT_RUNNING'
  | 'BUILD_FAILED'
  | 'BUILD_TIMEOUT'
  | 'TEST_EXECUTION_FAILED'
  | 'ELEMENT_NOT_FOUND'
  | 'MAESTRO_NOT_INSTALLED'
  | 'DSYM_NOT_FOUND'
  | 'NO_CRASH_LOGS'
  | 'PLATFORM_UNAVAILABLE'
  | 'TOOL_BUSY'
  | 'SHELL_EXECUTION_FAILED'
  | 'TIMEOUT'
  | 'INVALID_ARGUMENTS'
  | 'UNKNOWN_ERROR';

export interface SpecterError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export class SpecterToolError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly suggestion?: string;

  constructor(error: SpecterError) {
    super(error.message);
    this.name = 'SpecterToolError';
    this.code = error.code;
    this.details = error.details;
    this.suggestion = error.suggestion;
  }

  toJSON(): SpecterError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      suggestion: this.suggestion,
    };
  }
}

/**
 * Factory functions for common errors
 */
export const Errors = {
  deviceNotFound: (deviceName: string, availableDevices: string[]): SpecterToolError =>
    new SpecterToolError({
      code: 'DEVICE_NOT_FOUND',
      message: `Device '${deviceName}' not found`,
      details: { deviceName, availableDevices },
      suggestion: `Available devices: ${availableDevices.join(', ')}`,
    }),

  deviceNotRunning: (deviceName: string): SpecterToolError =>
    new SpecterToolError({
      code: 'DEVICE_NOT_RUNNING',
      message: `Device '${deviceName}' is not running`,
      suggestion: 'Boot the device first using manage_env with action: "boot"',
    }),

  buildFailed: (platform: string, errorSummary: string): SpecterToolError =>
    new SpecterToolError({
      code: 'BUILD_FAILED',
      message: `Build failed for ${platform}`,
      details: { platform, errorSummary },
    }),

  buildTimeout: (platform: string, timeoutMs: number): SpecterToolError =>
    new SpecterToolError({
      code: 'BUILD_TIMEOUT',
      message: `Build timed out after ${timeoutMs / 1000}s for ${platform}`,
      suggestion: 'Try running with clean: true or check for network issues',
    }),

  elementNotFound: (elementId: string): SpecterToolError =>
    new SpecterToolError({
      code: 'ELEMENT_NOT_FOUND',
      message: `Element '${elementId}' not found in UI hierarchy`,
      suggestion: 'Use get_ui_context to see available elements',
    }),

  maestroNotInstalled: (): SpecterToolError =>
    new SpecterToolError({
      code: 'MAESTRO_NOT_INSTALLED',
      message: 'Maestro CLI is not installed or not in PATH',
      suggestion: 'Install Maestro: brew install maestro (macOS) or see https://maestro.mobile.dev',
    }),

  dsymNotFound: (bundleId: string): SpecterToolError =>
    new SpecterToolError({
      code: 'DSYM_NOT_FOUND',
      message: `dSYM file not found for ${bundleId}`,
      suggestion: 'Build the app first to generate dSYM files',
    }),

  noCrashLogs: (bundleId: string): SpecterToolError =>
    new SpecterToolError({
      code: 'NO_CRASH_LOGS',
      message: `No crash logs found for ${bundleId}`,
    }),

  platformUnavailable: (platform: string): SpecterToolError =>
    new SpecterToolError({
      code: 'PLATFORM_UNAVAILABLE',
      message: `Platform '${platform}' tools are not available on this system`,
      suggestion: platform === 'ios' ? 'iOS tools require macOS with Xcode installed' : 'Ensure Android SDK is installed',
    }),

  toolBusy: (): SpecterToolError =>
    new SpecterToolError({
      code: 'TOOL_BUSY',
      message: 'Another tool is currently executing. Requests are queued sequentially.',
    }),

  shellExecutionFailed: (command: string, stderr: string): SpecterToolError =>
    new SpecterToolError({
      code: 'SHELL_EXECUTION_FAILED',
      message: 'Shell command execution failed',
      details: { command, stderr },
    }),

  timeout: (operation: string, timeoutMs: number): SpecterToolError =>
    new SpecterToolError({
      code: 'TIMEOUT',
      message: `Operation '${operation}' timed out after ${timeoutMs / 1000}s`,
    }),

  invalidArguments: (message: string): SpecterToolError =>
    new SpecterToolError({
      code: 'INVALID_ARGUMENTS',
      message,
    }),
};
