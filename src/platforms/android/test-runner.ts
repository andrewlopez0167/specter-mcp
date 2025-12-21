/**
 * Android Test Runner
 * Executes Gradle test tasks and parses results
 */

import { join } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { ShellExecutor, defaultShellExecutor } from '../../utils/shell-executor.js';
import { TestResult, TestSuite, parseJUnitXml, createTestSummary } from '../../models/test-result.js';

/**
 * Options for running tests
 */
export interface TestRunOptions {
  /** Project root directory */
  projectPath: string;
  /** Source set to test (commonTest, androidTest, etc.) */
  sourceSet?: string;
  /** Specific test class to run */
  testClass?: string;
  /** Specific test method to run */
  testMethod?: string;
  /** Gradle module (e.g., :shared, :app) */
  module?: string;
  /** Additional Gradle arguments */
  gradleArgs?: string[];
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Shell executor for dependency injection */
  shell?: ShellExecutor;
}

/**
 * Run Gradle unit tests
 */
export async function runGradleTests(options: TestRunOptions): Promise<TestResult> {
  const {
    projectPath,
    sourceSet = 'test',
    testClass,
    testMethod,
    module = '',
    gradleArgs = [],
    timeoutMs = 300000, // 5 minutes default
    shell = defaultShellExecutor,
  } = options;

  const startTime = Date.now();

  // Build test task name
  let taskName = `${module}:${sourceSet}`;
  if (sourceSet === 'commonTest') {
    taskName = `${module}:allTests`;
  } else if (sourceSet === 'androidTest') {
    taskName = `${module}:connectedAndroidTest`;
  }

  // Build command arguments
  const args = [taskName, '--continue', ...gradleArgs];

  // Add test filtering if specified
  if (testClass) {
    const filter = testMethod ? `${testClass}.${testMethod}` : testClass;
    args.push('--tests', filter);
  }

  // Determine Gradle wrapper path
  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

  // Run tests
  const result = await shell.execute(gradlew, args, {
    cwd: projectPath,
    timeoutMs,
    silent: false,
  });

  // Parse test results from XML reports
  const suites = await collectTestResults(projectPath, module, sourceSet);

  // Calculate totals
  const totalTests = suites.reduce((sum, s) => sum + s.totalTests, 0);
  const passed = suites.reduce((sum, s) => sum + s.passed, 0);
  const failed = suites.reduce((sum, s) => sum + s.failed, 0);
  const skipped = suites.reduce((sum, s) => sum + s.skipped, 0);
  const errors = suites.reduce((sum, s) => sum + s.errors, 0);

  const testResult: TestResult = {
    platform: 'android',
    testType: sourceSet === 'androidTest' ? 'integration' : 'unit',
    sourceSet,
    success: result.exitCode === 0 && failed === 0 && errors === 0,
    totalTests,
    passed,
    failed,
    skipped,
    errors,
    durationMs: Date.now() - startTime,
    suites,
    rawOutput: result.stdout.slice(0, 10000), // Truncate
    timestamp: Date.now(),
  };

  return testResult;
}

/**
 * Collect test results from Gradle XML reports
 */
async function collectTestResults(
  projectPath: string,
  module: string,
  sourceSet: string
): Promise<TestSuite[]> {
  const suites: TestSuite[] = [];

  // Common report locations
  const reportPaths = [
    join(projectPath, module.replace(':', '/'), 'build', 'test-results', sourceSet),
    join(projectPath, module.replace(':', '/'), 'build', 'test-results', 'testDebugUnitTest'),
    join(projectPath, module.replace(':', '/'), 'build', 'test-results', 'testReleaseUnitTest'),
    join(projectPath, 'build', 'test-results', sourceSet),
  ];

  for (const reportPath of reportPaths) {
    if (!existsSync(reportPath)) continue;

    try {
      const files = readdirSync(reportPath).filter((f) => f.endsWith('.xml'));

      for (const file of files) {
        const xmlPath = join(reportPath, file);
        const xmlContent = readFileSync(xmlPath, 'utf-8');
        const parsedSuites = parseJUnitXml(xmlContent);
        suites.push(...parsedSuites);
      }
    } catch {
      // Skip directories that can't be read
    }
  }

  return suites;
}

/**
 * Run KMM common tests on both platforms
 */
export async function runKmmCommonTests(
  projectPath: string,
  module: string = ':shared',
  shell: ShellExecutor = defaultShellExecutor
): Promise<{ android: TestResult; ios: TestResult | null }> {
  // Run Android tests
  const androidResult = await runGradleTests({
    projectPath,
    sourceSet: 'test',
    module,
    shell,
  });

  // iOS tests would require XCTest or Kotlin/Native test runner
  // For now, we return null for iOS
  return {
    android: androidResult,
    ios: null,
  };
}

/**
 * Create test summary for AI
 */
export function formatTestResults(result: TestResult): string {
  return createTestSummary(result);
}
