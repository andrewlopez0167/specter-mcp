/**
 * Test Result Models
 * Unified test result types for unit tests across platforms
 */

import { Platform } from './constants.js';

/**
 * Individual test case result
 */
export interface TestCase {
  /** Test name */
  name: string;
  /** Test class or suite name */
  className: string;
  /** Test status */
  status: 'passed' | 'failed' | 'skipped' | 'error';
  /** Duration in milliseconds */
  durationMs: number;
  /** Failure message if failed */
  failureMessage?: string;
  /** Stack trace if failed */
  stackTrace?: string;
  /** Expected value (for assertion failures) */
  expected?: string;
  /** Actual value (for assertion failures) */
  actual?: string;
}

/**
 * Test suite result (group of test cases)
 */
export interface TestSuite {
  /** Suite name */
  name: string;
  /** Total tests in suite */
  totalTests: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Skipped tests */
  skipped: number;
  /** Error tests (setup/teardown failures) */
  errors: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Individual test cases */
  testCases: TestCase[];
}

/**
 * Overall test run result
 */
export interface TestResult {
  /** Target platform */
  platform: Platform;
  /** Test type */
  testType: 'unit' | 'integration' | 'e2e';
  /** Source set for KMM (commonMain, androidMain, iosMain) */
  sourceSet?: string;
  /** Overall success */
  success: boolean;
  /** Total tests run */
  totalTests: number;
  /** Passed tests */
  passed: number;
  /** Failed tests */
  failed: number;
  /** Skipped tests */
  skipped: number;
  /** Error tests */
  errors: number;
  /** Total duration in milliseconds */
  durationMs: number;
  /** Test suites */
  suites: TestSuite[];
  /** Raw output (truncated if too long) */
  rawOutput?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Test failure details for AI analysis
 */
export interface TestFailure {
  /** Test name */
  testName: string;
  /** Test class */
  className: string;
  /** Failure type */
  failureType: 'assertion' | 'exception' | 'timeout' | 'setup' | 'teardown';
  /** Error message */
  message: string;
  /** Stack trace */
  stackTrace?: string;
  /** Source file if identifiable */
  sourceFile?: string;
  /** Line number if identifiable */
  lineNumber?: number;
  /** Suggested fix based on common patterns */
  suggestion?: string;
}

/**
 * Parse JUnit XML test results
 */
export function parseJUnitXml(xml: string): TestSuite[] {
  // Simplified parsing - real implementation would use xml2js
  const suites: TestSuite[] = [];

  // Match testsuite elements with their content (not testsuites wrapper)
  const suiteMatches = xml.matchAll(/<testsuite\s([^>]*)>([\s\S]*?)<\/testsuite>/g);

  for (const suiteMatch of suiteMatches) {
    const suiteAttrs = suiteMatch[1];
    const content = suiteMatch[2];

    // Extract suite attributes flexibly
    const getAttr = (attr: string): string => {
      const match = suiteAttrs.match(new RegExp(`${attr}="([^"]*)"`));
      return match ? match[1] : '';
    };

    const name = getAttr('name');
    const tests = parseInt(getAttr('tests') || '0');
    const failures = parseInt(getAttr('failures') || '0');
    const errors = parseInt(getAttr('errors') || '0');
    const skipped = parseInt(getAttr('skipped') || '0');
    const time = parseFloat(getAttr('time') || '0');

    const testCases: TestCase[] = [];

    // Match all testcase elements by finding opening tags and their content/closure
    // Handles both: <testcase attrs/> and <testcase attrs>content</testcase>
    const caseMatches = content.matchAll(/<testcase\s+([^>]*?)(\/?)>([^]*?)(?:<\/testcase>|(?=<testcase\s)|$)/g);

    for (const caseMatch of caseMatches) {
      const caseAttrs = caseMatch[1].trim();
      const selfClosing = caseMatch[2] === '/';
      const caseContent = selfClosing ? '' : (caseMatch[3] || '').trim();

      const getCaseAttr = (attr: string): string => {
        const match = caseAttrs.match(new RegExp(`${attr}="([^"]*)"`));
        return match ? match[1] : '';
      };

      const caseName = getCaseAttr('name');
      const className = getCaseAttr('classname');
      const caseTime = parseFloat(getCaseAttr('time') || '0');

      let status: TestCase['status'] = 'passed';
      let failureMessage: string | undefined;
      let stackTrace: string | undefined;

      if (caseContent.includes('<failure')) {
        status = 'failed';
        const failureMatch = caseContent.match(/<failure[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/failure>/);
        if (failureMatch) {
          failureMessage = failureMatch[1];
          stackTrace = failureMatch[2].trim();
        }
      } else if (caseContent.includes('<error')) {
        status = 'error';
        const errorMatch = caseContent.match(/<error[^>]*message="([^"]*)"[^>]*>([\s\S]*?)<\/error>/);
        if (errorMatch) {
          failureMessage = errorMatch[1];
          stackTrace = errorMatch[2].trim();
        }
      } else if (caseContent.includes('<skipped')) {
        status = 'skipped';
      }

      testCases.push({
        name: caseName,
        className,
        status,
        durationMs: caseTime * 1000,
        failureMessage,
        stackTrace,
      });
    }

    suites.push({
      name,
      totalTests: tests,
      passed: tests - failures - errors - skipped,
      failed: failures,
      skipped,
      errors,
      durationMs: time * 1000,
      testCases,
    });
  }

  return suites;
}

/**
 * Extract test failures for AI analysis
 */
export function extractTestFailures(result: TestResult): TestFailure[] {
  const failures: TestFailure[] = [];

  for (const suite of result.suites) {
    for (const testCase of suite.testCases) {
      if (testCase.status === 'failed' || testCase.status === 'error') {
        const failure: TestFailure = {
          testName: testCase.name,
          className: testCase.className,
          failureType: categorizeFailure(testCase),
          message: testCase.failureMessage || 'Unknown failure',
          stackTrace: testCase.stackTrace,
        };

        // Try to extract source location from stack trace
        if (testCase.stackTrace) {
          const sourceMatch = testCase.stackTrace.match(/at\s+[\w.]+\(([\w.]+):(\d+)\)/);
          if (sourceMatch) {
            failure.sourceFile = sourceMatch[1];
            failure.lineNumber = parseInt(sourceMatch[2]);
          }
        }

        // Add suggestion based on failure pattern
        failure.suggestion = suggestFix(failure);

        failures.push(failure);
      }
    }
  }

  return failures;
}

/**
 * Categorize failure type from test case
 */
function categorizeFailure(testCase: TestCase): TestFailure['failureType'] {
  const message = (testCase.failureMessage || '').toLowerCase();
  const stackTrace = (testCase.stackTrace || '').toLowerCase();

  if (message.includes('assert') || message.includes('expected') || message.includes('actual')) {
    return 'assertion';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (stackTrace.includes('setup') || stackTrace.includes('@before')) {
    return 'setup';
  }
  if (stackTrace.includes('teardown') || stackTrace.includes('@after')) {
    return 'teardown';
  }
  return 'exception';
}

/**
 * Suggest fix based on common failure patterns
 */
function suggestFix(failure: TestFailure): string {
  const message = failure.message.toLowerCase();

  if (message.includes('nullpointerexception') || message.includes('null')) {
    return 'Check for null values in the test setup or the code under test. Consider using null-safe operators or adding null checks.';
  }
  if (message.includes('expected') && message.includes('actual')) {
    return 'Assertion mismatch. Verify the expected value matches the current implementation behavior.';
  }
  if (message.includes('timeout')) {
    return 'Test timed out. Consider increasing timeout, using async/await properly, or checking for infinite loops.';
  }
  if (message.includes('not found') || message.includes('no such')) {
    return 'Resource or dependency not found. Verify test fixtures and mock setup.';
  }
  if (message.includes('mock') || message.includes('stub')) {
    return 'Mock configuration issue. Verify mock setup matches the expected interactions.';
  }

  return 'Review the stack trace and error message for details on the failure cause.';
}

/**
 * Create summary for AI consumption
 */
export function createTestSummary(result: TestResult): string {
  const lines: string[] = [
    `Test Results: ${result.success ? 'PASSED' : 'FAILED'}`,
    `Platform: ${result.platform}${result.sourceSet ? ` (${result.sourceSet})` : ''}`,
    `Total: ${result.totalTests} | Passed: ${result.passed} | Failed: ${result.failed} | Skipped: ${result.skipped}`,
    `Duration: ${(result.durationMs / 1000).toFixed(2)}s`,
  ];

  if (result.failed > 0 || result.errors > 0) {
    lines.push('', 'Failures:');
    const failures = extractTestFailures(result);
    for (const failure of failures.slice(0, 5)) {
      lines.push(`  - ${failure.className}.${failure.testName}: ${failure.message.slice(0, 100)}`);
    }
    if (failures.length > 5) {
      lines.push(`  ... and ${failures.length - 5} more failures`);
    }
  }

  return lines.join('\n');
}
