/**
 * Android Test Runner Unit Tests
 * Tests using dependency-injected shell executor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runGradleTests,
  runKmmCommonTests,
  formatTestResults,
  TestRunOptions,
} from '../../../../src/platforms/android/test-runner.js';
import { ShellExecutor } from '../../../../src/utils/shell-executor.js';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs module for test result reading
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const mockedFs = vi.mocked(fs);

// Create a mock shell executor
function createMockShell(): ShellExecutor & {
  execute: ReturnType<typeof vi.fn>;
  executeOrThrow: ReturnType<typeof vi.fn>;
  commandExists: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(),
    executeOrThrow: vi.fn(),
    commandExists: vi.fn(),
  };
}

// Sample JUnit XML for testing
const sampleJUnitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="com.example.MainTest" tests="3" failures="1" errors="0" skipped="0" time="0.5">
  <testcase name="testSuccess" classname="com.example.MainTest" time="0.1"/>
  <testcase name="testFailure" classname="com.example.MainTest" time="0.2">
    <failure message="Expected 1 but got 2" type="AssertionError">
      at com.example.MainTest.testFailure(MainTest.kt:15)
    </failure>
  </testcase>
  <testcase name="testAnother" classname="com.example.MainTest" time="0.2"/>
</testsuite>`;

describe('Android Test Runner', () => {
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShell = createMockShell();
    // Default: no test results
    mockedFs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runGradleTests', () => {
    const baseOptions: TestRunOptions = {
      projectPath: '/project',
      shell: undefined, // Will be replaced with mockShell
    };

    it('should run unit tests with default options', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL in 10s\n3 tests completed',
        stderr: '',
        exitCode: 0,
      });

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.platform).toBe('android');
      expect(result.testType).toBe('unit');
      expect(result.sourceSet).toBe('test');
      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining([':test', '--continue']),
        expect.objectContaining({ cwd: '/project' })
      );
    });

    it('should use correct task for commonTest', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runGradleTests({
        ...baseOptions,
        sourceSet: 'commonTest',
        module: ':shared',
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining([':shared:allTests']),
        expect.any(Object)
      );
    });

    it('should use correct task for androidTest', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      const result = await runGradleTests({
        ...baseOptions,
        sourceSet: 'androidTest',
        module: ':app',
        shell: mockShell,
      });

      expect(result.testType).toBe('integration');
      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining([':app:connectedAndroidTest']),
        expect.any(Object)
      );
    });

    it('should filter by test class', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runGradleTests({
        ...baseOptions,
        testClass: 'com.example.MainTest',
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining(['--tests', 'com.example.MainTest']),
        expect.any(Object)
      );
    });

    it('should filter by test class and method', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runGradleTests({
        ...baseOptions,
        testClass: 'com.example.MainTest',
        testMethod: 'testSuccess',
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining(['--tests', 'com.example.MainTest.testSuccess']),
        expect.any(Object)
      );
    });

    it('should pass additional gradle arguments', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runGradleTests({
        ...baseOptions,
        gradleArgs: ['--offline', '--no-daemon'],
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining(['--offline', '--no-daemon']),
        expect.any(Object)
      );
    });

    it('should respect custom timeout', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runGradleTests({
        ...baseOptions,
        timeoutMs: 600000,
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 600000 })
      );
    });

    it('should parse test results from XML reports', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      // Mock finding test results - only return true for first matching path
      let pathCount = 0;
      mockedFs.existsSync.mockImplementation((p) => {
        const pathStr = String(p);
        if (pathStr.includes('test-results/test') && pathCount === 0) {
          pathCount++;
          return true;
        }
        return false;
      });
      mockedFs.readdirSync.mockReturnValue(['TEST-com.example.MainTest.xml'] as unknown as fs.Dirent[]);
      mockedFs.readFileSync.mockReturnValue(sampleJUnitXml);

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.totalTests).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should report failure when tests fail', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD FAILED\n1 test failed',
        stderr: '',
        exitCode: 1,
      });

      mockedFs.existsSync.mockReturnValue(true);
      mockedFs.readdirSync.mockReturnValue(['TEST-com.example.MainTest.xml'] as unknown as fs.Dirent[]);
      mockedFs.readFileSync.mockReturnValue(sampleJUnitXml);

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.success).toBe(false);
    });

    it('should handle missing test results gracefully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      mockedFs.existsSync.mockReturnValue(false);

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.success).toBe(true);
      expect(result.totalTests).toBe(0);
    });

    it('should truncate raw output', async () => {
      const longOutput = 'x'.repeat(20000);
      mockShell.execute.mockResolvedValue({
        stdout: longOutput,
        stderr: '',
        exitCode: 0,
      });

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.rawOutput.length).toBe(10000);
    });

    it('should track duration', async () => {
      mockShell.execute.mockImplementation(async () => {
        // Small delay to ensure duration > 0
        await new Promise((r) => setTimeout(r, 10));
        return {
          stdout: 'BUILD SUCCESSFUL',
          stderr: '',
          exitCode: 0,
        };
      });

      const result = await runGradleTests({ ...baseOptions, shell: mockShell });

      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should include timestamp', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      const before = Date.now();
      const result = await runGradleTests({ ...baseOptions, shell: mockShell });
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('runKmmCommonTests', () => {
    it('should run Android tests for shared module', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      const result = await runKmmCommonTests('/project', ':shared', mockShell);

      expect(result.android).toBeDefined();
      expect(result.android.platform).toBe('android');
      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining([':shared:test']),
        expect.any(Object)
      );
    });

    it('should return null for iOS', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      const result = await runKmmCommonTests('/project', ':shared', mockShell);

      expect(result.ios).toBeNull();
    });

    it('should use default module :shared', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await runKmmCommonTests('/project', undefined, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        expect.arrayContaining([':shared:test']),
        expect.any(Object)
      );
    });
  });

  describe('formatTestResults', () => {
    it('should format test results as summary string', () => {
      const testResult = {
        platform: 'android' as const,
        testType: 'unit' as const,
        sourceSet: 'test',
        success: true,
        totalTests: 10,
        passed: 8,
        failed: 1,
        skipped: 1,
        errors: 0,
        durationMs: 5000,
        suites: [],
        rawOutput: '',
        timestamp: Date.now(),
      };

      const summary = formatTestResults(testResult);

      expect(typeof summary).toBe('string');
      expect(summary.length).toBeGreaterThan(0);
    });
  });
});
