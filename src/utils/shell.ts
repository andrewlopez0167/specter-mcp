/**
 * Safe shell command execution with timeout handling
 */
import { spawn, SpawnOptions } from 'child_process';
import { Errors } from '../models/errors.js';
import { DEFAULTS } from '../models/constants.js';

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
  silent?: boolean;
}

/**
 * Execute a shell command with timeout and proper error handling
 */
export async function executeShell(
  command: string,
  args: string[] = [],
  options: ShellOptions = {}
): Promise<ShellResult> {
  const { timeoutMs = DEFAULTS.SHELL_TIMEOUT_MS, cwd, env, silent = false } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let killed = false;

    const spawnOptions: SpawnOptions = {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
    };

    const child = spawn(command, args, spawnOptions);

    // Set up timeout
    const timeout = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
      // Give process time to clean up, then force kill
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 1000);
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('error', (error: Error) => {
      clearTimeout(timeout);
      reject(
        Errors.shellExecutionFailed(
          `${command} ${args.join(' ')}`,
          error.message
        )
      );
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timeout);

      if (killed) {
        reject(Errors.timeout(`${command} ${args.join(' ')}`, timeoutMs));
        return;
      }

      const exitCode = code ?? 1;

      // Log if not silent and there's stderr
      if (!silent && stderr && exitCode !== 0) {
        console.error(`[shell] Command failed: ${command} ${args.join(' ')}`);
        console.error(`[shell] stderr: ${stderr.slice(0, 500)}`);
      }

      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode,
      });
    });
  });
}

/**
 * Execute a shell command and throw if it fails
 */
export async function executeShellOrThrow(
  command: string,
  args: string[] = [],
  options: ShellOptions = {}
): Promise<ShellResult> {
  const result = await executeShell(command, args, options);

  if (result.exitCode !== 0) {
    throw Errors.shellExecutionFailed(
      `${command} ${args.join(' ')}`,
      result.stderr || `Exit code: ${result.exitCode}`
    );
  }

  return result;
}

/**
 * Check if a command exists in PATH
 */
export async function commandExists(command: string): Promise<boolean> {
  try {
    const result = await executeShell('which', [command], { silent: true });
    return result.exitCode === 0 && result.stdout.length > 0;
  } catch {
    return false;
  }
}

/**
 * Parse command output into lines, filtering empty lines
 */
export function parseLines(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Execute multiple commands in sequence, stopping on first failure
 */
export async function executeSequence(
  commands: Array<{ command: string; args: string[]; options?: ShellOptions }>
): Promise<ShellResult[]> {
  const results: ShellResult[] = [];

  for (const { command, args, options } of commands) {
    const result = await executeShellOrThrow(command, args, options);
    results.push(result);
  }

  return results;
}
