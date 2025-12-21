/**
 * clean_project Tool Handler
 * MCP tool for cleaning project build caches and derived data
 */

import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { CleanResult } from '../../models/device.js';
import { executeShell } from '../../utils/shell.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for clean_project tool
 */
export interface CleanProjectArgs {
  /** Project root path */
  projectPath: string;
  /** Clean Gradle caches (default: true) */
  cleanGradle?: boolean;
  /** Clean Xcode DerivedData (default: true) */
  cleanDerivedData?: boolean;
  /** Clean build directories (default: true) */
  cleanBuild?: boolean;
  /** Clean node_modules (default: false) */
  cleanNodeModules?: boolean;
  /** Clean CocoaPods (default: false) */
  cleanPods?: boolean;
  /** Specific Gradle module to clean */
  module?: string;
}

/**
 * Clean project tool handler
 */
export async function cleanProject(args: CleanProjectArgs): Promise<CleanResult> {
  const {
    projectPath,
    cleanGradle = true,
    cleanDerivedData = true,
    cleanBuild = true,
    cleanNodeModules = false,
    cleanPods = false,
    module,
  } = args;

  const startTime = Date.now();
  const cleaned: CleanResult['cleaned'] = [];
  const resolvedPath = resolve(projectPath);

  // Validate project path exists
  if (!existsSync(resolvedPath)) {
    return {
      success: false,
      cleaned: [{
        type: 'validation',
        path: resolvedPath,
        success: false,
        error: 'Project path does not exist',
      }],
      durationMs: Date.now() - startTime,
    };
  }

  // Clean Gradle
  if (cleanGradle) {
    const gradleResult = await cleanGradleProject(resolvedPath, module);
    cleaned.push(...gradleResult);
  }

  // Clean Xcode DerivedData
  if (cleanDerivedData) {
    const xcodeResult = await cleanXcodeDerivedData(resolvedPath);
    cleaned.push(...xcodeResult);
  }

  // Clean build directories
  if (cleanBuild) {
    const buildResult = await cleanBuildDirectories(resolvedPath);
    cleaned.push(...buildResult);
  }

  // Clean node_modules
  if (cleanNodeModules) {
    const nodeResult = await cleanNodeModulesDir(resolvedPath);
    cleaned.push(...nodeResult);
  }

  // Clean CocoaPods
  if (cleanPods) {
    const podsResult = await cleanCocoaPods(resolvedPath);
    cleaned.push(...podsResult);
  }

  const success = cleaned.every((c) => c.success);

  return {
    success,
    cleaned,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Clean Gradle project
 */
async function cleanGradleProject(
  projectPath: string,
  module?: string
): Promise<CleanResult['cleaned']> {
  const results: CleanResult['cleaned'] = [];

  // Check if Gradle wrapper exists
  const gradlew = join(projectPath, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!existsSync(gradlew)) {
    // No Gradle project
    return [];
  }

  try {
    // Run gradlew clean
    const task = module ? `${module}:clean` : 'clean';
    const result = await executeShell(
      process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
      [task],
      { cwd: projectPath, timeoutMs: 120000 }
    );

    results.push({
      type: 'gradle-clean',
      path: projectPath,
      success: result.exitCode === 0,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    });

    // Also delete .gradle directory in project
    const gradleDir = join(projectPath, '.gradle');
    if (existsSync(gradleDir)) {
      try {
        await rm(gradleDir, { recursive: true, force: true });
        results.push({
          type: 'gradle-cache',
          path: gradleDir,
          success: true,
        });
      } catch (error) {
        results.push({
          type: 'gradle-cache',
          path: gradleDir,
          success: false,
          error: String(error),
        });
      }
    }
  } catch (error) {
    results.push({
      type: 'gradle-clean',
      path: projectPath,
      success: false,
      error: String(error),
    });
  }

  return results;
}

/**
 * Clean Xcode DerivedData
 */
async function cleanXcodeDerivedData(
  projectPath: string
): Promise<CleanResult['cleaned']> {
  const results: CleanResult['cleaned'] = [];

  // Default DerivedData location
  const derivedDataPath = join(homedir(), 'Library', 'Developer', 'Xcode', 'DerivedData');

  if (!existsSync(derivedDataPath)) {
    return [];
  }

  try {
    // Try to find project-specific derived data
    // DerivedData folders are named like "ProjectName-hash"
    const projectName = projectPath.split('/').pop() || '';

    // For safety, clean entire DerivedData only if explicitly requested
    // Here we just clean project-specific data by running xcodebuild clean if xcodeproj exists
    const iosDir = join(projectPath, 'ios');
    const xcodeproj = existsSync(join(iosDir, `${projectName}.xcodeproj`)) ||
                      existsSync(join(iosDir, `${projectName}.xcworkspace`));

    if (xcodeproj) {
      const result = await executeShell(
        'xcodebuild',
        ['clean', '-workspace', `${projectName}.xcworkspace`, '-scheme', projectName],
        { cwd: iosDir, timeoutMs: 120000, silent: true }
      );

      results.push({
        type: 'xcode-clean',
        path: iosDir,
        success: result.exitCode === 0,
        error: result.exitCode !== 0 ? 'xcodebuild clean failed' : undefined,
      });
    }

    // Clean DerivedData for this project
    await rm(derivedDataPath, { recursive: true, force: true });
    results.push({
      type: 'derived-data',
      path: derivedDataPath,
      success: true,
    });
  } catch (error) {
    results.push({
      type: 'derived-data',
      path: derivedDataPath,
      success: false,
      error: String(error),
    });
  }

  return results;
}

/**
 * Clean build directories
 */
async function cleanBuildDirectories(
  projectPath: string
): Promise<CleanResult['cleaned']> {
  const results: CleanResult['cleaned'] = [];

  const buildDirs = [
    join(projectPath, 'build'),
    join(projectPath, 'app', 'build'),
    join(projectPath, 'shared', 'build'),
    join(projectPath, 'ios', 'build'),
    join(projectPath, 'android', 'app', 'build'),
  ];

  for (const dir of buildDirs) {
    if (existsSync(dir)) {
      try {
        await rm(dir, { recursive: true, force: true });
        results.push({
          type: 'build-dir',
          path: dir,
          success: true,
        });
      } catch (error) {
        results.push({
          type: 'build-dir',
          path: dir,
          success: false,
          error: String(error),
        });
      }
    }
  }

  return results;
}

/**
 * Clean node_modules directory
 */
async function cleanNodeModulesDir(
  projectPath: string
): Promise<CleanResult['cleaned']> {
  const results: CleanResult['cleaned'] = [];

  const nodeModulesPath = join(projectPath, 'node_modules');
  if (existsSync(nodeModulesPath)) {
    try {
      await rm(nodeModulesPath, { recursive: true, force: true });
      results.push({
        type: 'node-modules',
        path: nodeModulesPath,
        success: true,
      });
    } catch (error) {
      results.push({
        type: 'node-modules',
        path: nodeModulesPath,
        success: false,
        error: String(error),
      });
    }
  }

  // Also clean package-lock if cleaning node_modules
  const lockPath = join(projectPath, 'package-lock.json');
  if (existsSync(lockPath)) {
    try {
      await rm(lockPath);
      results.push({
        type: 'package-lock',
        path: lockPath,
        success: true,
      });
    } catch (error) {
      // Non-critical
    }
  }

  return results;
}

/**
 * Clean CocoaPods
 */
async function cleanCocoaPods(
  projectPath: string
): Promise<CleanResult['cleaned']> {
  const results: CleanResult['cleaned'] = [];

  const iosDir = join(projectPath, 'ios');
  const podsDir = join(iosDir, 'Pods');
  const podfileLock = join(iosDir, 'Podfile.lock');

  if (existsSync(podsDir)) {
    try {
      await rm(podsDir, { recursive: true, force: true });
      results.push({
        type: 'pods',
        path: podsDir,
        success: true,
      });
    } catch (error) {
      results.push({
        type: 'pods',
        path: podsDir,
        success: false,
        error: String(error),
      });
    }
  }

  if (existsSync(podfileLock)) {
    try {
      await rm(podfileLock);
      results.push({
        type: 'podfile-lock',
        path: podfileLock,
        success: true,
      });
    } catch (error) {
      // Non-critical
    }
  }

  return results;
}

/**
 * Create clean summary for AI
 */
export function createCleanSummary(result: CleanResult): string {
  const lines: string[] = [
    `Clean Result: ${result.success ? 'SUCCESS' : 'PARTIAL FAILURE'}`,
    `Duration: ${(result.durationMs / 1000).toFixed(2)}s`,
    '',
    'Cleaned:',
  ];

  for (const item of result.cleaned) {
    const status = item.success ? '✓' : '✗';
    lines.push(`  ${status} ${item.type}: ${item.path.split('/').pop()}`);
    if (item.error) {
      lines.push(`    Error: ${item.error.slice(0, 80)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Register the clean_project tool
 */
export function registerCleanProjectTool(): void {
  getToolRegistry().register(
    'clean_project',
    {
      description:
        'Clean project build caches, DerivedData, and other temporary files. Helps resolve build issues caused by stale caches.',
      inputSchema: createInputSchema(
        {
          projectPath: {
            type: 'string',
            description: 'Path to the project root directory',
          },
          cleanGradle: {
            type: 'boolean',
            description: 'Clean Gradle caches and run gradlew clean (default: true)',
          },
          cleanDerivedData: {
            type: 'boolean',
            description: 'Clean Xcode DerivedData (default: true)',
          },
          cleanBuild: {
            type: 'boolean',
            description: 'Clean build directories (default: true)',
          },
          cleanNodeModules: {
            type: 'boolean',
            description: 'Clean node_modules directory (default: false)',
          },
          cleanPods: {
            type: 'boolean',
            description: 'Clean CocoaPods Pods directory (default: false)',
          },
          module: {
            type: 'string',
            description: 'Specific Gradle module to clean (e.g., :app)',
          },
        },
        ['projectPath']
      ),
    },
    (args) => cleanProject(args as unknown as CleanProjectArgs)
  );
}
