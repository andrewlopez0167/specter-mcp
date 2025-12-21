/**
 * Gradle Build Executor Unit Tests
 * Tests using dependency-injected shell executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildGradle,
  cleanGradle,
  parseGradleOutput,
  hasGradleWrapper,
  GradleBuildOptions,
} from '../../../../src/platforms/android/gradle.js';
import { ShellExecutor, ShellResult } from '../../../../src/utils/shell-executor.js';
import * as fs from 'fs/promises';

// Mock fs module for file system operations
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readdir: vi.fn(),
}));

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

describe('Gradle Build Executor', () => {
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShell = createMockShell();
    // Default: gradlew exists
    mockedFs.access.mockResolvedValue(undefined);
  });

  describe('buildGradle', () => {
    const baseOptions: GradleBuildOptions = {
      variant: 'debug',
      cwd: '/project',
    };

    it('should build debug variant successfully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL in 10s',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir.mockResolvedValue(['app-debug.apk'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await buildGradle(baseOptions, mockShell);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('android');
      expect(result.variant).toBe('debug');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        [':androidApp:assembleDebug', '--stacktrace'],
        expect.objectContaining({ cwd: '/project' })
      );
    });

    it('should build release variant successfully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir.mockResolvedValue(['app-release.apk'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await buildGradle({ ...baseOptions, variant: 'release' }, mockShell);

      expect(result.success).toBe(true);
      expect(result.variant).toBe('release');
      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        [':androidApp:assembleRelease', '--stacktrace'],
        expect.any(Object)
      );
    });

    it('should include clean task when clean option is true', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await buildGradle({ ...baseOptions, clean: true }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        ['clean', ':androidApp:assembleDebug', '--stacktrace'],
        expect.any(Object)
      );
    });

    it('should use custom module name', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await buildGradle({ ...baseOptions, moduleName: 'app' }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        [':app:assembleDebug', '--stacktrace'],
        expect.any(Object)
      );
    });

    it('should pass extra arguments', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await buildGradle(
        { ...baseOptions, extraArgs: ['--offline', '--no-daemon'] },
        mockShell
      );

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        [':androidApp:assembleDebug', '--stacktrace', '--offline', '--no-daemon'],
        expect.any(Object)
      );
    });

    it('should handle build failure with error parsing', async () => {
      const errorOutput = `
> Task :androidApp:compileDebugKotlin FAILED
e: file:///project/src/Main.kt:15:10 Unresolved reference: foo
e: file:///project/src/Main.kt:20:5 Type mismatch: inferred type is String but Int was expected

FAILURE: Build failed with an exception.
`;
      mockShell.execute.mockResolvedValue({
        stdout: errorOutput,
        stderr: '',
        exitCode: 1,
      });

      const result = await buildGradle(baseOptions, mockShell);

      expect(result.success).toBe(false);
      expect(result.errorSummary).toBeDefined();
      expect(result.errorSummary!.errorCount).toBeGreaterThanOrEqual(2);
      // First two errors should be the Kotlin compiler errors
      const kotlinErrors = result.errorSummary!.topErrors.filter(e => e.file);
      expect(kotlinErrors[0].file).toContain('Main.kt');
      expect(kotlinErrors[0].line).toBe(15);
    });

    it('should fall back to global gradle when wrapper not found', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await buildGradle(baseOptions, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'gradle',
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('should find APK artifact path on success', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir.mockResolvedValue(['app-debug.apk'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await buildGradle(baseOptions, mockShell);

      expect(result.artifactPath).toContain('app-debug.apk');
    });

    it('should handle missing APK directory gracefully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const result = await buildGradle(baseOptions, mockShell);

      expect(result.success).toBe(true);
      expect(result.artifactPath).toBeUndefined();
    });

    it('should respect custom timeout', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await buildGradle({ ...baseOptions, timeoutMs: 300000 }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 300000 })
      );
    });
  });

  describe('cleanGradle', () => {
    it('should execute gradle clean', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await cleanGradle('/project', mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        './gradlew',
        ['clean'],
        expect.objectContaining({ cwd: '/project', timeoutMs: 60000 })
      );
    });

    it('should use current directory when cwd not specified', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      await cleanGradle(undefined, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        expect.any(String),
        ['clean'],
        expect.objectContaining({ cwd: process.cwd() })
      );
    });
  });

  describe('parseGradleOutput', () => {
    it('should parse Kotlin compiler errors', () => {
      const output = `
> Task :shared:compileKotlinJvm FAILED
e: file:///project/src/Main.kt:15:10 Unresolved reference: foo
e: file:///project/src/Utils.kt:25:5 Type mismatch: inferred type is String but Int was expected

FAILURE: Build failed with an exception.
`;

      const summary = parseGradleOutput(output);

      // At least 2 Kotlin errors (may also include FAILURE message)
      expect(summary.errorCount).toBeGreaterThanOrEqual(2);

      // Check the Kotlin compiler errors (those with file paths)
      const kotlinErrors = summary.topErrors.filter(e => e.file);
      expect(kotlinErrors).toHaveLength(2);
      expect(kotlinErrors[0]).toMatchObject({
        file: '/project/src/Main.kt',
        line: 15,
        column: 10,
        message: 'Unresolved reference: foo',
        severity: 'error',
      });
      expect(kotlinErrors[1]).toMatchObject({
        file: '/project/src/Utils.kt',
        line: 25,
        column: 5,
        severity: 'error',
      });
    });

    it('should parse warnings', () => {
      const output = `
> Task :shared:compileKotlinJvm
w: file:///project/src/Utils.kt:10:5 Variable 'unused' is never used

BUILD SUCCESSFUL in 5s
`;

      const summary = parseGradleOutput(output);

      expect(summary.warningCount).toBe(1);
      expect(summary.errorCount).toBe(0);
    });

    it('should parse generic FAILURE messages', () => {
      const output = `
> Task :app:processDebugManifest FAILED

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:processDebugManifest'.
`;

      const summary = parseGradleOutput(output);

      expect(summary.errorCount).toBeGreaterThan(0);
    });

    it('should handle empty output', () => {
      const summary = parseGradleOutput('');

      expect(summary.errorCount).toBe(0);
      expect(summary.warningCount).toBe(0);
      expect(summary.topErrors).toHaveLength(0);
    });

    it('should limit topErrors to 5', () => {
      const errors = Array.from({ length: 10 }, (_, i) =>
        `e: file:///project/src/File${i}.kt:${i + 1}:1 Error ${i}`
      ).join('\n');

      const summary = parseGradleOutput(errors);

      expect(summary.topErrors).toHaveLength(5);
    });

    it('should include log tail', () => {
      const output = 'Line 1\nLine 2\nLine 3\n';

      const summary = parseGradleOutput(output);

      expect(summary.logTail).toBeDefined();
      expect(summary.logTail).toContain('Line 1');
    });

    it('should categorize errors and generate suggestions', () => {
      const output = `
e: file:///project/src/Main.kt:10:5 Unresolved reference: unknownFunction

FAILURE: Build failed with an exception.
`;

      const summary = parseGradleOutput(output);

      expect(summary.errorCategories.length).toBeGreaterThan(0);
      expect(summary.suggestions).toBeDefined();
    });

    it('should handle file:// prefix in paths', () => {
      const output = 'e: file:///Users/dev/project/src/Main.kt:10:5 Some error';

      const summary = parseGradleOutput(output);

      expect(summary.topErrors[0].file).toBe('/Users/dev/project/src/Main.kt');
    });

    it('should handle paths without file:// prefix', () => {
      const output = 'e: /project/src/Main.kt:10:5 Some error';

      const summary = parseGradleOutput(output);

      expect(summary.topErrors[0].file).toBe('/project/src/Main.kt');
    });
  });

  describe('hasGradleWrapper', () => {
    it('should return true when gradlew exists', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      const result = await hasGradleWrapper('/project');

      expect(result).toBe(true);
    });

    it('should return false when gradlew does not exist', async () => {
      mockedFs.access.mockRejectedValue(new Error('ENOENT'));

      const result = await hasGradleWrapper('/project');

      expect(result).toBe(false);
    });

    it('should use current directory when not specified', async () => {
      mockedFs.access.mockResolvedValue(undefined);

      await hasGradleWrapper();

      expect(mockedFs.access).toHaveBeenCalledWith(
        expect.stringContaining('gradlew')
      );
    });
  });
});
