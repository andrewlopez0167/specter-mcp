/**
 * run_linter Tool Handler
 * MCP tool for running code linters (Detekt, Android Lint, SwiftLint)
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { isPlatform } from '../../models/constants.js';
import {
  LintResult,
  LintIssue,
  parseDetektXml,
  parseAndroidLintXml,
  parseSwiftLintJson,
  groupIssuesByFile,
  createLintSummary,
  getLintSuggestions,
} from '../../models/lint-result.js';
import { Errors } from '../../models/errors.js';
import { executeShell } from '../../utils/shell.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Supported linter types
 */
export type LinterType = 'detekt' | 'android-lint' | 'swiftlint' | 'ktlint';

/**
 * Input arguments for run_linter tool
 */
export interface RunLinterArgs {
  /** Target platform */
  platform: string;
  /** Project root directory */
  projectPath: string;
  /** Linter to run */
  linter?: LinterType;
  /** Gradle module for Android linters */
  module?: string;
  /** Configuration file path */
  configPath?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Auto-fix issues (if supported) */
  autoFix?: boolean;
}

/**
 * Result structure for run_linter
 */
export interface RunLinterResult {
  /** Lint execution result */
  result: LintResult;
  /** Human-readable summary */
  summary: string;
  /** Top issues with suggestions */
  topIssues: Array<LintIssue & { suggestion?: string }>;
}

/**
 * Run linter tool handler
 */
export async function runLinter(args: RunLinterArgs): Promise<RunLinterResult> {
  const {
    platform,
    projectPath,
    linter,
    module = '',
    configPath,
    timeoutMs = 300000,
    autoFix = false,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Determine linter based on platform if not specified
  const selectedLinter = linter || (platform === 'android' ? 'detekt' : 'swiftlint');

  let result: LintResult;

  switch (selectedLinter) {
    case 'detekt':
      result = await runDetekt(projectPath, module, configPath, timeoutMs, autoFix);
      break;
    case 'android-lint':
      result = await runAndroidLint(projectPath, module, timeoutMs);
      break;
    case 'swiftlint':
      result = await runSwiftLint(projectPath, configPath, timeoutMs, autoFix);
      break;
    case 'ktlint':
      result = await runKtlint(projectPath, timeoutMs, autoFix);
      break;
    default:
      throw Errors.invalidArguments(`Unknown linter: ${selectedLinter}`);
  }

  const summary = createLintSummary(result);

  // Get top issues with suggestions
  const allIssues = result.files.flatMap((f) => f.issues);
  const topIssues = allIssues
    .filter((i) => i.severity === 'error' || i.severity === 'warning')
    .slice(0, 10)
    .map((issue) => ({
      ...issue,
      suggestion: getLintSuggestions(issue),
    }));

  return { result, summary, topIssues };
}

/**
 * Run Detekt linter
 */
async function runDetekt(
  projectPath: string,
  module: string,
  _configPath?: string, // TODO: Support custom Detekt config
  timeoutMs: number = 300000,
  autoFix: boolean = false
): Promise<LintResult> {
  const startTime = Date.now();

  // Build Gradle command
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const task = module ? `${module}:detekt` : 'detekt';
  const args = [task];

  if (autoFix) {
    args.push('--auto-correct');
  }

  const result = await executeShell(gradlew, args, {
    cwd: projectPath,
    timeoutMs,
    silent: false,
  });

  // Find and parse Detekt XML report
  const reportPaths = [
    join(projectPath, module.replace(':', '/'), 'build', 'reports', 'detekt', 'detekt.xml'),
    join(projectPath, 'build', 'reports', 'detekt', 'detekt.xml'),
  ];

  let issues: LintIssue[] = [];
  for (const reportPath of reportPaths) {
    if (existsSync(reportPath)) {
      const xml = readFileSync(reportPath, 'utf-8');
      issues = parseDetektXml(xml);
      break;
    }
  }

  const files = groupIssuesByFile(issues);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    platform: 'android',
    linter: 'detekt',
    success: result.exitCode === 0 && errorCount === 0,
    totalIssues: issues.length,
    errorCount,
    warningCount,
    infoCount: issues.filter((i) => i.severity === 'info').length,
    styleCount: issues.filter((i) => i.severity === 'style').length,
    files,
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
    rawOutput: result.stdout.slice(0, 5000),
  };
}

/**
 * Run Android Lint
 */
async function runAndroidLint(
  projectPath: string,
  module: string,
  timeoutMs: number = 300000
): Promise<LintResult> {
  const startTime = Date.now();

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const task = module ? `${module}:lint` : 'lint';

  const result = await executeShell(gradlew, [task], {
    cwd: projectPath,
    timeoutMs,
    silent: false,
  });

  // Find and parse Android Lint XML report
  const reportPaths = [
    join(projectPath, module.replace(':', '/'), 'build', 'reports', 'lint-results.xml'),
    join(projectPath, module.replace(':', '/'), 'build', 'reports', 'lint-results-debug.xml'),
    join(projectPath, 'app', 'build', 'reports', 'lint-results.xml'),
  ];

  let issues: LintIssue[] = [];
  for (const reportPath of reportPaths) {
    if (existsSync(reportPath)) {
      const xml = readFileSync(reportPath, 'utf-8');
      issues = parseAndroidLintXml(xml);
      break;
    }
  }

  const files = groupIssuesByFile(issues);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    platform: 'android',
    linter: 'android-lint',
    success: result.exitCode === 0 && errorCount === 0,
    totalIssues: issues.length,
    errorCount,
    warningCount,
    infoCount: issues.filter((i) => i.severity === 'info').length,
    styleCount: 0,
    files,
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
    rawOutput: result.stdout.slice(0, 5000),
  };
}

/**
 * Run SwiftLint
 */
async function runSwiftLint(
  projectPath: string,
  configPath?: string,
  timeoutMs: number = 300000,
  autoFix: boolean = false
): Promise<LintResult> {
  const startTime = Date.now();

  const args = ['lint', '--reporter', 'json'];

  if (configPath && existsSync(configPath)) {
    args.push('--config', configPath);
  }

  if (autoFix) {
    // SwiftLint uses 'swiftlint --fix' for autocorrect
    args[0] = '--fix';
  }

  const result = await executeShell('swiftlint', args, {
    cwd: projectPath,
    timeoutMs,
    silent: false,
  });

  const issues = parseSwiftLintJson(result.stdout);
  const files = groupIssuesByFile(issues);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    platform: 'ios',
    linter: 'swiftlint',
    success: result.exitCode === 0 && errorCount === 0,
    totalIssues: issues.length,
    errorCount,
    warningCount,
    infoCount: issues.filter((i) => i.severity === 'info').length,
    styleCount: issues.filter((i) => i.severity === 'style').length,
    files,
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
    rawOutput: result.stdout.slice(0, 5000),
  };
}

/**
 * Run ktlint
 */
async function runKtlint(
  projectPath: string,
  timeoutMs: number = 300000,
  autoFix: boolean = false
): Promise<LintResult> {
  const startTime = Date.now();

  // Try Gradle ktlintCheck task first
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const task = autoFix ? 'ktlintFormat' : 'ktlintCheck';

  const result = await executeShell(gradlew, [task], {
    cwd: projectPath,
    timeoutMs,
    silent: false,
  });

  // ktlint outputs in checkstyle format similar to detekt
  const reportPaths = [
    join(projectPath, 'build', 'reports', 'ktlint', 'ktlintMainSourceSetCheck.xml'),
    join(projectPath, 'build', 'reports', 'ktlint', 'ktlint.xml'),
  ];

  let issues: LintIssue[] = [];
  for (const reportPath of reportPaths) {
    if (existsSync(reportPath)) {
      const xml = readFileSync(reportPath, 'utf-8');
      issues = parseDetektXml(xml); // Same format as Detekt
      break;
    }
  }

  const files = groupIssuesByFile(issues);
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return {
    platform: 'android',
    linter: 'ktlint',
    success: result.exitCode === 0 && errorCount === 0,
    totalIssues: issues.length,
    errorCount,
    warningCount,
    infoCount: 0,
    styleCount: issues.filter((i) => i.severity === 'style').length,
    files,
    durationMs: Date.now() - startTime,
    timestamp: Date.now(),
    rawOutput: result.stdout.slice(0, 5000),
  };
}

/**
 * Register the run_linter tool
 */
export function registerRunLinterTool(): void {
  getToolRegistry().register(
    'run_linter',
    {
      description:
        'Run code linter (Detekt, Android Lint, SwiftLint, ktlint). Returns structured lint results with issue locations and suggestions.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          projectPath: {
            type: 'string',
            description: 'Path to the project root directory',
          },
          linter: {
            type: 'string',
            enum: ['detekt', 'android-lint', 'swiftlint', 'ktlint'],
            description: 'Linter to run (default: detekt for Android, swiftlint for iOS)',
          },
          module: {
            type: 'string',
            description: 'Gradle module for Android linters (e.g., :app)',
          },
          configPath: {
            type: 'string',
            description: 'Path to linter configuration file',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 300000)',
          },
          autoFix: {
            type: 'boolean',
            description: 'Auto-fix issues if supported by the linter (default: false)',
          },
        },
        ['platform', 'projectPath']
      ),
    },
    (args) => runLinter(args as unknown as RunLinterArgs)
  );
}
