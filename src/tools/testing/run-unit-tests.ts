/**
 * run_unit_tests Tool Handler
 * MCP tool for running unit tests on Android/iOS
 */

import { isPlatform } from '../../models/constants.js';
import { TestResult, createTestSummary, extractTestFailures } from '../../models/test-result.js';
import { Errors } from '../../models/errors.js';
import { runGradleTests, TestRunOptions } from '../../platforms/android/test-runner.js';
import { isAdbAvailable } from '../../platforms/android/adb.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for run_unit_tests tool
 */
export interface RunUnitTestsArgs {
  /** Target platform */
  platform: string;
  /** Project root directory */
  projectPath: string;
  /** Source set (commonTest, androidTest, iosTest) */
  sourceSet?: string;
  /** Specific test class to run */
  testClass?: string;
  /** Specific test method to run */
  testMethod?: string;
  /** Gradle module for KMM projects */
  module?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Result structure for run_unit_tests
 */
export interface RunUnitTestsResult {
  /** Test execution result */
  result: TestResult;
  /** Human-readable summary */
  summary: string;
  /** Extracted failures with suggestions */
  failures: ReturnType<typeof extractTestFailures>;
}

/**
 * Run unit tests tool handler
 */
export async function runUnitTests(args: RunUnitTestsArgs): Promise<RunUnitTestsResult> {
  const {
    platform,
    projectPath,
    sourceSet = 'test',
    testClass,
    testMethod,
    module = '',
    timeoutMs = 300000,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  if (platform === 'android') {
    return runAndroidTests({
      projectPath,
      sourceSet,
      testClass,
      testMethod,
      module,
      timeoutMs,
    });
  } else {
    return runIOSTests({
      projectPath,
      sourceSet,
      testClass,
      testMethod,
      timeoutMs,
    });
  }
}

/**
 * Run Android unit tests
 */
async function runAndroidTests(options: {
  projectPath: string;
  sourceSet: string;
  testClass?: string;
  testMethod?: string;
  module: string;
  timeoutMs: number;
}): Promise<RunUnitTestsResult> {
  // Check if ADB is available
  const adbAvailable = await isAdbAvailable();
  if (!adbAvailable && options.sourceSet === 'androidTest') {
    throw Errors.platformUnavailable('android');
  }

  const testOptions: TestRunOptions = {
    projectPath: options.projectPath,
    sourceSet: options.sourceSet,
    testClass: options.testClass,
    testMethod: options.testMethod,
    module: options.module,
    timeoutMs: options.timeoutMs,
  };

  const result = await runGradleTests(testOptions);
  const summary = createTestSummary(result);
  const failures = extractTestFailures(result);

  return { result, summary, failures };
}

/**
 * Run iOS unit tests
 * Note: iOS test execution requires xcodebuild and is more complex
 */
async function runIOSTests(options: {
  projectPath: string;
  sourceSet: string;
  testClass?: string;
  testMethod?: string;
  timeoutMs: number;
}): Promise<RunUnitTestsResult> {
  // iOS unit test execution would use xcodebuild test
  // For now, return a placeholder result indicating iOS tests need xcodebuild
  console.warn('[run_unit_tests] iOS unit tests require xcodebuild integration');

  const result: TestResult = {
    platform: 'ios',
    testType: 'unit',
    sourceSet: options.sourceSet,
    success: false,
    totalTests: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: 1,
    durationMs: 0,
    suites: [],
    timestamp: Date.now(),
    rawOutput: 'iOS unit test execution requires xcodebuild integration',
  };

  return {
    result,
    summary: 'iOS unit tests require xcodebuild integration. Use xcodebuild test directly.',
    failures: [],
  };
}

/**
 * Register the run_unit_tests tool
 */
export function registerRunUnitTestsTool(): void {
  getToolRegistry().register(
    'run_unit_tests',
    {
      description:
        'Run unit tests for Android or iOS. Returns structured test results with pass/fail status and failure details.',
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
          sourceSet: {
            type: 'string',
            description: 'Source set to test (test, commonTest, androidTest, iosTest)',
          },
          testClass: {
            type: 'string',
            description: 'Specific test class to run (optional)',
          },
          testMethod: {
            type: 'string',
            description: 'Specific test method to run (requires testClass)',
          },
          module: {
            type: 'string',
            description: 'Gradle module for KMM projects (e.g., :shared)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 300000)',
          },
        },
        ['platform', 'projectPath']
      ),
    },
    (args) => runUnitTests(args as unknown as RunUnitTestsArgs)
  );
}
