/**
 * Android Test Runner Integration Tests
 * Tests against real KMM project (specter-test-subject)
 *
 * Prerequisites:
 * - Java/JDK installed
 * - Android SDK installed
 * - specter-test-subject project exists with unit tests
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import { runGradleTests, parseTestResults } from '../../../src/platforms/android/test-runner.js';
import * as path from 'path';

const TEST_PROJECT_PATH = path.resolve(__dirname, '../../../test-apps/specter-test-subject');

async function isGradleAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('java', ['-version']);
    return result.exitCode === 0 || result.stderr.includes('version');
  } catch {
    return false;
  }
}

async function projectExists(): Promise<boolean> {
  try {
    const result = await executeShell('ls', [path.join(TEST_PROJECT_PATH, 'build.gradle.kts')]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

describe('Android Test Runner Integration', () => {
  let gradleAvailable = false;
  let projectReady = false;

  beforeAll(async () => {
    gradleAvailable = await isGradleAvailable();
    projectReady = await projectExists();

    console.log(`Gradle available: ${gradleAvailable}`);
    console.log(`Project ready: ${projectReady}`);
    console.log(`Project path: ${TEST_PROJECT_PATH}`);
  });

  describe('runGradleTests', () => {
    it('should run shared module tests', async () => {
      expect(gradleAvailable, 'Gradle/Java not available').toBe(true);
      expect(projectReady, `Project not found at ${TEST_PROJECT_PATH}`).toBe(true);

      const result = await runGradleTests({
        projectPath: TEST_PROJECT_PATH,
        module: 'shared',
        sourceSet: 'commonTest',
        timeoutMs: 300000, // 5 minutes
      });

      console.log(`Tests run: ${result.success}`);
      console.log(`Total: ${result.total}, Passed: ${result.passed}, Failed: ${result.failed}`);

      if (result.failures && result.failures.length > 0) {
        console.log('Failures:');
        for (const failure of result.failures.slice(0, 3)) {
          console.log(`  - ${failure.testName}: ${failure.message}`);
        }
      }

      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('failed');
    }, 300000);

    it('should run specific test class', async () => {
      expect(gradleAvailable, 'Gradle/Java not available').toBe(true);
      expect(projectReady, `Project not found at ${TEST_PROJECT_PATH}`).toBe(true);

      const result = await runGradleTests({
        projectPath: TEST_PROJECT_PATH,
        module: 'shared',
        sourceSet: 'commonTest',
        testClass: 'CounterTest',
        timeoutMs: 180000, // 3 minutes
      });

      console.log(`Counter tests: ${result.passed}/${result.total} passed`);

      expect(result).toHaveProperty('total');
    }, 180000);
  });

  describe('parseTestResults', () => {
    it('should parse Gradle test output', () => {
      const output = `
> Task :shared:jvmTest

com.specter.testsubject.CounterTest > increment PASSED
com.specter.testsubject.CounterTest > decrement PASSED
com.specter.testsubject.CounterTest > reset PASSED
com.specter.testsubject.FormValidatorTest > validateEmail PASSED
com.specter.testsubject.FormValidatorTest > validateUsername FAILED

5 tests completed, 1 failed
`;

      const results = parseTestResults(output);

      expect(results.total).toBe(5);
      expect(results.passed).toBe(4);
      expect(results.failed).toBe(1);
    });

    it('should parse test output with all passing', () => {
      const output = `
> Task :shared:jvmTest

com.specter.testsubject.CounterTest > increment PASSED
com.specter.testsubject.CounterTest > decrement PASSED

2 tests completed, 0 failed

BUILD SUCCESSFUL
`;

      const results = parseTestResults(output);

      expect(results.total).toBe(2);
      expect(results.passed).toBe(2);
      expect(results.failed).toBe(0);
      expect(results.success).toBe(true);
    });

    it('should extract failure details', () => {
      const output = `
> Task :shared:jvmTest

com.specter.testsubject.CounterTest > testBoundary FAILED
    java.lang.AssertionError: expected:<1000> but was:<999>
        at org.junit.Assert.fail(Assert.java:89)
        at com.specter.testsubject.CounterTest.testBoundary(CounterTest.kt:45)

1 tests completed, 1 failed
`;

      const results = parseTestResults(output);

      expect(results.failed).toBe(1);
      expect(results.failures).toBeDefined();
      if (results.failures && results.failures.length > 0) {
        expect(results.failures[0].testName).toContain('testBoundary');
      }
    });
  });
});
