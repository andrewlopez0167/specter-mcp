/**
 * Xcodebuild Executor Unit Tests
 * Tests using dependency-injected shell executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildXcode,
  parseXcodebuildOutput,
  cleanXcodeDerivedData,
  isXcodebuildAvailable,
  XcodeBuildOptions,
} from '../../../../src/platforms/ios/xcodebuild.js';
import { ShellExecutor } from '../../../../src/utils/shell-executor.js';
import * as fs from 'fs/promises';

// Mock fs module for file system operations
vi.mock('fs/promises', () => ({
  readdir: vi.fn(),
  rm: vi.fn(),
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

describe('Xcodebuild Executor', () => {
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShell = createMockShell();
    // Default: workspace exists
    mockedFs.readdir.mockResolvedValue(['App.xcworkspace'] as unknown as Awaited<
      ReturnType<typeof fs.readdir>
    >);
  });

  describe('buildXcode', () => {
    const baseOptions: XcodeBuildOptions = {
      variant: 'debug',
      cwd: '/project/iosApp',
    };

    it('should build debug variant successfully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir
        .mockResolvedValueOnce(['App.xcworkspace'] as unknown as Awaited<
          ReturnType<typeof fs.readdir>
        >)
        .mockResolvedValueOnce(['App.app'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await buildXcode(baseOptions, mockShell);

      expect(result.success).toBe(true);
      expect(result.platform).toBe('ios');
      expect(result.variant).toBe('debug');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['build', '-configuration', 'Debug']),
        expect.objectContaining({ cwd: '/project/iosApp' })
      );
    });

    it('should build release variant successfully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      const result = await buildXcode({ ...baseOptions, variant: 'release' }, mockShell);

      expect(result.success).toBe(true);
      expect(result.variant).toBe('release');
      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-configuration', 'Release']),
        expect.any(Object)
      );
    });

    it('should include clean action when clean option is true', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode({ ...baseOptions, clean: true }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['clean', 'build']),
        expect.any(Object)
      );
    });

    it('should use workspace when found', async () => {
      mockedFs.readdir.mockResolvedValue(['MyApp.xcworkspace'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode(baseOptions, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-workspace']),
        expect.any(Object)
      );
    });

    it('should use project when no workspace found', async () => {
      mockedFs.readdir.mockResolvedValue(['MyApp.xcodeproj'] as unknown as Awaited<
        ReturnType<typeof fs.readdir>
      >);
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode(baseOptions, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-project']),
        expect.any(Object)
      );
    });

    it('should pass extra arguments', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode(
        { ...baseOptions, extraArgs: ['-allowProvisioningUpdates', 'CODE_SIGN_IDENTITY=""'] },
        mockShell
      );

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-allowProvisioningUpdates', 'CODE_SIGN_IDENTITY=""']),
        expect.any(Object)
      );
    });

    it('should handle build failure with error parsing', async () => {
      const errorOutput = `
/project/iosApp/Sources/ContentView.swift:15:10: error: cannot find 'unknownVariable' in scope
/project/iosApp/Sources/ContentView.swift:20:5: error: type 'String' has no member 'nonExistent'

** BUILD FAILED **
`;
      mockShell.execute.mockResolvedValue({
        stdout: errorOutput,
        stderr: '',
        exitCode: 65,
      });

      const result = await buildXcode(baseOptions, mockShell);

      expect(result.success).toBe(false);
      expect(result.errorSummary).toBeDefined();
      expect(result.errorSummary!.errorCount).toBeGreaterThanOrEqual(2);
    });

    it('should find .app artifact path on success', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir
        .mockResolvedValueOnce(['App.xcworkspace'] as unknown as Awaited<
          ReturnType<typeof fs.readdir>
        >)
        .mockResolvedValueOnce(['MyApp.app'] as unknown as Awaited<ReturnType<typeof fs.readdir>>);

      const result = await buildXcode(baseOptions, mockShell);

      expect(result.success).toBe(true);
      expect(result.artifactPath).toContain('MyApp.app');
    });

    it('should handle missing products directory gracefully', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });
      mockedFs.readdir
        .mockResolvedValueOnce(['App.xcworkspace'] as unknown as Awaited<
          ReturnType<typeof fs.readdir>
        >)
        .mockRejectedValueOnce(new Error('ENOENT'));

      const result = await buildXcode(baseOptions, mockShell);

      expect(result.success).toBe(true);
      expect(result.artifactPath).toBeUndefined();
    });

    it('should respect custom timeout', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode({ ...baseOptions, timeoutMs: 600000 }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 600000 })
      );
    });

    it('should use custom scheme', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode({ ...baseOptions, scheme: 'MyCustomScheme' }, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-scheme', 'MyCustomScheme']),
        expect.any(Object)
      );
    });

    it('should use custom destination', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      await buildXcode(
        { ...baseOptions, destination: 'platform=iOS Simulator,name=iPhone 14' },
        mockShell
      );

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcodebuild',
        expect.arrayContaining(['-destination', 'platform=iOS Simulator,name=iPhone 14']),
        expect.any(Object)
      );
    });
  });

  describe('parseXcodebuildOutput', () => {
    it('should parse Swift compiler errors', () => {
      const output = `
Compiling Swift source files
/project/Sources/ContentView.swift:15:10: error: cannot find 'foo' in scope
/project/Sources/AppDelegate.swift:25:5: error: type 'String' has no member 'bar'

** BUILD FAILED **
`;

      const summary = parseXcodebuildOutput(output);

      // At least 2 Swift errors (may also include BUILD FAILED)
      expect(summary.errorCount).toBeGreaterThanOrEqual(2);

      // Check the Swift compiler errors (those with file paths)
      const swiftErrors = summary.topErrors.filter((e) => e.file);
      expect(swiftErrors).toHaveLength(2);
      expect(swiftErrors[0]).toMatchObject({
        file: '/project/Sources/ContentView.swift',
        line: 15,
        column: 10,
        message: "cannot find 'foo' in scope",
        severity: 'error',
      });
    });

    it('should parse warnings', () => {
      const output = `
/project/Sources/Utils.swift:10:5: warning: variable 'unused' was never used
/project/Sources/Utils.swift:15:3: warning: expression result unused

** BUILD SUCCEEDED **
`;

      const summary = parseXcodebuildOutput(output);

      expect(summary.warningCount).toBe(2);
      expect(summary.errorCount).toBe(0);
    });

    it('should parse linker errors', () => {
      const output = `
ld: error: undefined symbol: _someFunction
clang: error: linker command failed with exit code 1

** BUILD FAILED **
`;

      const summary = parseXcodebuildOutput(output);

      expect(summary.errorCount).toBeGreaterThan(0);
      expect(summary.topErrors.some((e) => e.message.includes('undefined symbol'))).toBe(true);
    });

    it('should handle empty output', () => {
      const summary = parseXcodebuildOutput('');

      expect(summary.errorCount).toBe(0);
      expect(summary.warningCount).toBe(0);
      expect(summary.topErrors).toHaveLength(0);
    });

    it('should limit topErrors to 5', () => {
      const errors = Array.from(
        { length: 10 },
        (_, i) => `/project/File${i}.swift:${i + 1}:1: error: Error ${i}`
      ).join('\n');

      const summary = parseXcodebuildOutput(errors);

      expect(summary.topErrors).toHaveLength(5);
    });

    it('should include log tail', () => {
      const output = 'Line 1\nLine 2\nLine 3\n** BUILD FAILED **';

      const summary = parseXcodebuildOutput(output);

      expect(summary.logTail).toBeDefined();
      expect(summary.logTail).toContain('Line 1');
    });

    it('should categorize errors and generate suggestions', () => {
      const output = `
/project/Sources/Main.swift:10:5: error: use of undeclared type 'UnknownType'

** BUILD FAILED **
`;

      const summary = parseXcodebuildOutput(output);

      expect(summary.errorCategories.length).toBeGreaterThan(0);
      expect(summary.suggestions).toBeDefined();
    });

    it('should distinguish between errors and warnings in severity', () => {
      const output = `
/project/Sources/File.swift:10:5: error: some error
/project/Sources/File.swift:15:5: warning: some warning
`;

      const summary = parseXcodebuildOutput(output);

      expect(summary.errorCount).toBe(1);
      expect(summary.warningCount).toBe(1);
    });
  });

  describe('cleanXcodeDerivedData', () => {
    it('should remove DerivedData directory', async () => {
      mockedFs.rm.mockResolvedValue(undefined);

      await cleanXcodeDerivedData('/project');

      expect(mockedFs.rm).toHaveBeenCalledWith(
        expect.stringContaining('DerivedData'),
        expect.objectContaining({ recursive: true, force: true })
      );
    });

    it('should use current directory when cwd not specified', async () => {
      mockedFs.rm.mockResolvedValue(undefined);

      await cleanXcodeDerivedData();

      expect(mockedFs.rm).toHaveBeenCalled();
    });

    it('should handle non-existent directory gracefully', async () => {
      mockedFs.rm.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(cleanXcodeDerivedData('/project')).resolves.not.toThrow();
    });
  });

  describe('isXcodebuildAvailable', () => {
    it('should return true when xcodebuild is available', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: 'Xcode 15.0\nBuild version 15A240d',
        stderr: '',
        exitCode: 0,
      });

      const result = await isXcodebuildAvailable(mockShell);

      expect(result).toBe(true);
      expect(mockShell.execute).toHaveBeenCalledWith('xcodebuild', ['-version'], { silent: true });
    });

    it('should return false when xcodebuild is not available', async () => {
      mockShell.execute.mockResolvedValue({
        stdout: '',
        stderr: 'xcodebuild: command not found',
        exitCode: 127,
      });

      const result = await isXcodebuildAvailable(mockShell);

      expect(result).toBe(false);
    });

    it('should return false when execution throws', async () => {
      mockShell.execute.mockRejectedValue(new Error('Command failed'));

      const result = await isXcodebuildAvailable(mockShell);

      expect(result).toBe(false);
    });
  });
});
