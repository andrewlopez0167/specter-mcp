/**
 * Gradle Build Executor
 * Handles Android builds via Gradle with structured output parsing
 */

import { ShellExecutor, defaultShellExecutor } from '../../utils/shell-executor.js';
import { DEFAULTS, BuildVariant } from '../../models/constants.js';
import {
  BuildResult,
  BuildError,
  BuildErrorSummary,
  ErrorCategory,
  categorizeError,
  generateSuggestions,
} from '../../models/build-result.js';
import { Errors } from '../../models/errors.js';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface GradleBuildOptions {
  /** Build variant (debug or release) */
  variant: BuildVariant;
  /** Clean before build */
  clean?: boolean;
  /** Additional Gradle arguments */
  extraArgs?: string[];
  /** Build timeout in milliseconds */
  timeoutMs?: number;
  /** Working directory (project root) */
  cwd?: string;
  /** Custom module name (default: 'androidApp') */
  moduleName?: string;
}

/**
 * Execute a Gradle build
 * @param options Build configuration options
 * @param shell Shell executor for dependency injection (defaults to real shell)
 */
export async function buildGradle(
  options: GradleBuildOptions,
  shell: ShellExecutor = defaultShellExecutor
): Promise<BuildResult> {
  const {
    variant,
    clean = false,
    extraArgs = [],
    timeoutMs = DEFAULTS.BUILD_TIMEOUT_MS,
    cwd = process.cwd(),
    moduleName = 'androidApp',
  } = options;

  const startTime = Date.now();

  // Build the Gradle command
  const gradleCommand = await getGradleCommand(cwd);
  const tasks: string[] = [];

  if (clean) {
    tasks.push('clean');
  }

  // Determine the assemble task based on variant
  const assembleTask = variant === 'release' ? 'assembleRelease' : 'assembleDebug';
  tasks.push(`:${moduleName}:${assembleTask}`);

  const args = [...tasks, '--stacktrace', ...extraArgs];

  try {
    const result = await shell.execute(gradleCommand, args, {
      timeoutMs,
      cwd,
    });

    const durationMs = Date.now() - startTime;
    const success = result.exitCode === 0;

    // Parse errors if build failed
    let errorSummary: BuildErrorSummary | undefined;
    if (!success) {
      errorSummary = parseGradleOutput(result.stdout + '\n' + result.stderr);
    }

    // Find artifact path
    let artifactPath: string | undefined;
    if (success) {
      artifactPath = await findApkPath(cwd, moduleName, variant);
    }

    return {
      success,
      platform: 'android',
      variant,
      durationMs,
      artifactPath,
      errorSummary,
      command: `${gradleCommand} ${args.join(' ')}`,
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      throw Errors.buildTimeout('android', timeoutMs);
    }
    throw error;
  }
}

/**
 * Get the correct Gradle command for the platform
 */
async function getGradleCommand(cwd: string): Promise<string> {
  const gradlewPath = path.join(cwd, 'gradlew');

  try {
    await fs.access(gradlewPath);
    return './gradlew';
  } catch {
    // Fall back to global gradle
    return 'gradle';
  }
}

/**
 * Find the built APK path
 */
async function findApkPath(
  cwd: string,
  moduleName: string,
  variant: BuildVariant
): Promise<string | undefined> {
  const apkDir = path.join(cwd, moduleName, 'build', 'outputs', 'apk', variant);

  try {
    const files = await fs.readdir(apkDir);
    const apkFile = files.find((f) => f.endsWith('.apk'));
    if (apkFile) {
      return path.join(apkDir, apkFile);
    }
  } catch {
    // APK directory doesn't exist
  }

  return undefined;
}

/**
 * Parse Gradle build output into structured errors
 */
export function parseGradleOutput(output: string): BuildErrorSummary {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  // Kotlin/Java error pattern: e: file:///path/file.kt:line:col message
  const kotlinErrorPattern = /^([ew]):\s*(?:file:\/\/)?([^:]+):(\d+):(\d+)\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Kotlin/Java compiler errors
    const kotlinMatch = trimmed.match(kotlinErrorPattern);
    if (kotlinMatch) {
      const [, severity, filePath, lineStr, colStr, message] = kotlinMatch;
      errors.push({
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity === 'w' ? 'warning' : 'error',
      });
      continue;
    }

    // Match generic error lines
    if (
      trimmed.startsWith('error:') ||
      trimmed.includes('ERROR:') ||
      trimmed.includes('FAILURE:')
    ) {
      const existing = errors.find((e) => trimmed.includes(e.message));
      if (!existing) {
        errors.push({
          message: trimmed.replace(/^(error:|ERROR:)\s*/i, ''),
          severity: 'error',
        });
      }
    }
  }

  // Categorize errors
  const categoryMap = new Map<string, { errors: BuildError[]; example: BuildError }>();

  for (const error of errors) {
    if (error.severity === 'error') {
      const category = categorizeError(error);
      const existing = categoryMap.get(category);
      if (existing) {
        existing.errors.push(error);
      } else {
        categoryMap.set(category, { errors: [error], example: error });
      }
    }
  }

  const errorCategories: ErrorCategory[] = Array.from(categoryMap.entries()).map(
    ([category, data]) => ({
      category,
      count: data.errors.length,
      example: data.example,
    })
  );

  // Count errors and warnings
  const actualErrors = errors.filter((e) => e.severity === 'error');
  const warnings = errors.filter((e) => e.severity === 'warning');

  // Get log tail (last 50 lines)
  const logTail = lines.slice(-50).join('\n');

  return {
    errorCount: actualErrors.length,
    warningCount: warnings.length,
    topErrors: actualErrors.slice(0, 5),
    errorCategories,
    suggestions: generateSuggestions(errorCategories),
    logTail,
  };
}

/**
 * Run Gradle clean
 * @param cwd Working directory
 * @param shell Shell executor for dependency injection (defaults to real shell)
 */
export async function cleanGradle(
  cwd?: string,
  shell: ShellExecutor = defaultShellExecutor
): Promise<void> {
  const workingDir = cwd ?? process.cwd();
  const gradleCommand = await getGradleCommand(workingDir);

  await shell.execute(gradleCommand, ['clean'], {
    cwd: workingDir,
    timeoutMs: 60000,
  });
}

/**
 * Check if Gradle wrapper exists
 */
export async function hasGradleWrapper(cwd?: string): Promise<boolean> {
  const workingDir = cwd ?? process.cwd();
  const gradlewPath = path.join(workingDir, 'gradlew');

  try {
    await fs.access(gradlewPath);
    return true;
  } catch {
    return false;
  }
}
