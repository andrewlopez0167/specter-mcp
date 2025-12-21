/**
 * Shell Executor Interface for Dependency Injection
 *
 * Enables proper unit testing by allowing shell execution to be mocked.
 * Use `defaultShellExecutor` for production, inject mock for tests.
 */

import {
  executeShell,
  executeShellOrThrow,
  commandExists,
  ShellResult,
  ShellOptions,
} from './shell.js';

/**
 * Interface for shell command execution
 * Allows dependency injection for testing
 */
export interface ShellExecutor {
  /**
   * Execute a shell command with timeout handling
   * Returns result even on non-zero exit code
   */
  execute(command: string, args?: string[], options?: ShellOptions): Promise<ShellResult>;

  /**
   * Execute a shell command and throw if it fails (non-zero exit)
   */
  executeOrThrow(command: string, args?: string[], options?: ShellOptions): Promise<ShellResult>;

  /**
   * Check if a command exists in PATH
   */
  commandExists(command: string): Promise<boolean>;
}

/**
 * Default shell executor using real shell commands
 * Use this in production code
 */
export const defaultShellExecutor: ShellExecutor = {
  execute: executeShell,
  executeOrThrow: executeShellOrThrow,
  commandExists: commandExists,
};

/**
 * Create a mock shell executor for testing
 * All methods are vi.fn() mocks that can be configured per test
 *
 * @example
 * ```typescript
 * const mockShell = createMockShellExecutor();
 * mockShell.execute.mockResolvedValue({
 *   stdout: 'BUILD SUCCESSFUL',
 *   stderr: '',
 *   exitCode: 0,
 * });
 *
 * const result = await buildGradle(options, mockShell);
 * expect(mockShell.execute).toHaveBeenCalledWith('gradle', expect.any(Array));
 * ```
 */
export function createMockShellExecutor(): ShellExecutor & {
  execute: ReturnType<typeof import('vitest').vi.fn>;
  executeOrThrow: ReturnType<typeof import('vitest').vi.fn>;
  commandExists: ReturnType<typeof import('vitest').vi.fn>;
} {
  // Dynamic import to avoid vitest dependency in production
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { vi } = require('vitest');

  return {
    execute: vi.fn(),
    executeOrThrow: vi.fn(),
    commandExists: vi.fn(),
  };
}

/**
 * Create a shell executor with preset responses for testing
 * Useful for integration-style tests with predictable outputs
 */
export function createTestShellExecutor(
  responses: Map<string, ShellResult>
): ShellExecutor {
  const findResponse = (command: string, args?: string[]): ShellResult => {
    const key = args ? `${command} ${args.join(' ')}` : command;
    const exactMatch = responses.get(key);
    if (exactMatch) return exactMatch;

    // Try command-only match
    const commandMatch = responses.get(command);
    if (commandMatch) return commandMatch;

    // Default failure response
    return {
      stdout: '',
      stderr: `Mock: No response configured for "${key}"`,
      exitCode: 1,
    };
  };

  return {
    execute: async (command, args, _options) => findResponse(command, args),
    executeOrThrow: async (command, args, _options) => {
      const result = findResponse(command, args);
      if (result.exitCode !== 0) {
        throw new Error(`Command failed: ${command} - ${result.stderr}`);
      }
      return result;
    },
    commandExists: async (command) => {
      const result = findResponse('which', [command]);
      return result.exitCode === 0;
    },
  };
}

// Re-export types for convenience
export type { ShellResult, ShellOptions };
