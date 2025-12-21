/**
 * Xcodebuild Executor
 * Handles iOS builds via xcodebuild with structured output parsing
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

export interface XcodeBuildOptions {
  /** Build variant (debug or release) */
  variant: BuildVariant;
  /** Clean before build */
  clean?: boolean;
  /** Destination (simulator name or device) */
  destination?: string;
  /** Additional xcodebuild arguments */
  extraArgs?: string[];
  /** Build timeout in milliseconds */
  timeoutMs?: number;
  /** Working directory (project root) */
  cwd?: string;
  /** Scheme name (default: 'iosApp') */
  scheme?: string;
  /** Workspace path (optional, auto-detected) */
  workspace?: string;
  /** Project path (optional, auto-detected) */
  project?: string;
}

/**
 * Execute an xcodebuild build
 * @param options Build configuration options
 * @param shell Shell executor for dependency injection (defaults to real shell)
 */
export async function buildXcode(
  options: XcodeBuildOptions,
  shell: ShellExecutor = defaultShellExecutor
): Promise<BuildResult> {
  const {
    variant,
    clean = false,
    destination = 'platform=iOS Simulator,name=iPhone 15 Pro',
    extraArgs = [],
    timeoutMs = DEFAULTS.BUILD_TIMEOUT_MS,
    cwd = process.cwd(),
    scheme = 'iosApp',
  } = options;

  const startTime = Date.now();

  // Find workspace or project
  const { workspace, project } = await findXcodeProject(cwd);

  // Build the xcodebuild command
  const args: string[] = [];

  // Add clean action if requested
  if (clean) {
    args.push('clean');
  }

  // Add build action
  args.push('build');

  // Add workspace or project
  if (workspace) {
    args.push('-workspace', workspace);
  } else if (project) {
    args.push('-project', project);
  }

  // Add scheme
  args.push('-scheme', scheme);

  // Add configuration
  const configuration = variant === 'release' ? 'Release' : 'Debug';
  args.push('-configuration', configuration);

  // Add destination
  args.push('-destination', destination);

  // Add derived data path for predictable output location
  const derivedDataPath = path.join(cwd, 'build', 'DerivedData');
  args.push('-derivedDataPath', derivedDataPath);

  // Add extra args
  args.push(...extraArgs);

  try {
    const result = await shell.execute('xcodebuild', args, {
      timeoutMs,
      cwd,
    });

    const durationMs = Date.now() - startTime;
    const success = result.exitCode === 0;

    // Parse errors if build failed
    let errorSummary: BuildErrorSummary | undefined;
    if (!success) {
      errorSummary = parseXcodebuildOutput(result.stdout + '\n' + result.stderr);
    }

    // Find artifact path
    let artifactPath: string | undefined;
    if (success) {
      artifactPath = await findAppPath(derivedDataPath, scheme, configuration);
    }

    return {
      success,
      platform: 'ios',
      variant,
      durationMs,
      artifactPath,
      errorSummary,
      command: `xcodebuild ${args.join(' ')}`,
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      throw Errors.buildTimeout('ios', timeoutMs);
    }
    throw error;
  }
}

/**
 * Find Xcode workspace or project in directory
 */
async function findXcodeProject(
  cwd: string
): Promise<{ workspace?: string; project?: string }> {
  try {
    const files = await fs.readdir(cwd);

    // Prefer workspace over project
    const workspace = files.find((f) => f.endsWith('.xcworkspace'));
    if (workspace) {
      return { workspace: path.join(cwd, workspace) };
    }

    const project = files.find((f) => f.endsWith('.xcodeproj'));
    if (project) {
      return { project: path.join(cwd, project) };
    }

    // Check iosApp subdirectory (common in KMM projects)
    const iosAppDir = path.join(cwd, 'iosApp');
    try {
      const iosFiles = await fs.readdir(iosAppDir);
      const iosWorkspace = iosFiles.find((f) => f.endsWith('.xcworkspace'));
      if (iosWorkspace) {
        return { workspace: path.join(iosAppDir, iosWorkspace) };
      }
      const iosProject = iosFiles.find((f) => f.endsWith('.xcodeproj'));
      if (iosProject) {
        return { project: path.join(iosAppDir, iosProject) };
      }
    } catch {
      // iosApp directory doesn't exist
    }
  } catch {
    // Directory read failed
  }

  return {};
}

/**
 * Find the built .app path
 */
async function findAppPath(
  derivedDataPath: string,
  _scheme: string,
  configuration: string
): Promise<string | undefined> {
  const productsDir = path.join(
    derivedDataPath,
    'Build',
    'Products',
    `${configuration}-iphonesimulator`
  );

  try {
    const files = await fs.readdir(productsDir);
    const appFile = files.find((f) => f.endsWith('.app'));
    if (appFile) {
      return path.join(productsDir, appFile);
    }
  } catch {
    // Products directory doesn't exist
  }

  return undefined;
}

/**
 * Parse xcodebuild output into structured errors
 */
export function parseXcodebuildOutput(output: string): BuildErrorSummary {
  const errors: BuildError[] = [];
  const lines = output.split('\n');

  // Swift/Clang error pattern: /path/file.swift:line:col: error: message
  const swiftErrorPattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/;

  // Linker error pattern
  const linkerErrorPattern = /^(ld|clang):\s*(error|warning):\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Swift/Clang compiler errors
    const swiftMatch = trimmed.match(swiftErrorPattern);
    if (swiftMatch) {
      const [, filePath, lineStr, colStr, severity, message] = swiftMatch;
      errors.push({
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity as 'error' | 'warning',
      });
      continue;
    }

    // Match linker errors
    const linkerMatch = trimmed.match(linkerErrorPattern);
    if (linkerMatch) {
      const [, , severity, message] = linkerMatch;
      errors.push({
        message: message.trim(),
        severity: severity as 'error' | 'warning',
      });
      continue;
    }

    // Match generic xcodebuild errors
    if (trimmed.includes('error:')) {
      const existing = errors.find((e) => trimmed.includes(e.message));
      if (!existing) {
        errors.push({
          message: trimmed.replace(/^.*error:\s*/i, ''),
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
 * Clean DerivedData for the project
 */
export async function cleanXcodeDerivedData(cwd?: string): Promise<void> {
  const workingDir = cwd ?? process.cwd();
  const derivedDataPath = path.join(workingDir, 'build', 'DerivedData');

  try {
    await fs.rm(derivedDataPath, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist or can't be removed
  }
}

/**
 * Check if xcodebuild is available
 * @param shell Shell executor for dependency injection (defaults to real shell)
 */
export async function isXcodebuildAvailable(
  shell: ShellExecutor = defaultShellExecutor
): Promise<boolean> {
  if (process.platform !== 'darwin') {
    return false;
  }

  try {
    const result = await shell.execute('xcodebuild', ['-version'], { silent: true });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
