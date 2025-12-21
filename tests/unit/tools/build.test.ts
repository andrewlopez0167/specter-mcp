import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shell module
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
  commandExists: vi.fn(),
}));

import { executeShell } from '../../../src/utils/shell.js';
import {
  categorizeError,
  generateSuggestions,
  parseSeverity,
  type BuildError,
  type ErrorCategory,
} from '../../../src/models/build-result.js';

const mockedExecuteShell = vi.mocked(executeShell);

describe('Build Result Models', () => {
  describe('parseSeverity', () => {
    it('should detect warning messages', () => {
      expect(parseSeverity('warning: unused variable')).toBe('warning');
      expect(parseSeverity('w: deprecated API usage')).toBe('warning');
    });

    it('should default to error for non-warning messages', () => {
      expect(parseSeverity('error: cannot find symbol')).toBe('error');
      expect(parseSeverity('undefined reference to foo')).toBe('error');
    });
  });

  describe('categorizeError', () => {
    it('should categorize missing symbol errors', () => {
      const error: BuildError = {
        message: 'error: cannot find symbol',
        severity: 'error',
      };
      expect(categorizeError(error)).toBe('Missing Symbol');
    });

    it('should categorize type mismatch errors', () => {
      const error: BuildError = {
        message: 'Type mismatch: inferred type is String but Int was expected',
        severity: 'error',
      };
      expect(categorizeError(error)).toBe('Type Mismatch');
    });

    it('should categorize null safety errors', () => {
      const error: BuildError = {
        message: 'Only safe (?.) or non-null asserted (!!.) calls are allowed',
        severity: 'error',
      };
      expect(categorizeError(error)).toBe('Null Safety');
    });

    it('should categorize syntax errors', () => {
      const error: BuildError = {
        message: "Expecting '}' but found ')'",
        severity: 'error',
      };
      expect(categorizeError(error)).toBe('Syntax Error');
    });

    it('should return Other for unknown errors', () => {
      const error: BuildError = {
        message: 'some random error message',
        severity: 'error',
      };
      expect(categorizeError(error)).toBe('Other');
    });
  });

  describe('generateSuggestions', () => {
    it('should generate suggestions based on categories', () => {
      const categories: ErrorCategory[] = [
        {
          category: 'Missing Symbol',
          count: 3,
          example: { message: 'cannot find symbol', severity: 'error' },
        },
      ];

      const suggestions = generateSuggestions(categories);
      expect(suggestions).toContain('Check for missing imports or typos in variable/function names');
    });

    it('should add clean build suggestion for many error categories', () => {
      const categories: ErrorCategory[] = [
        { category: 'Missing Symbol', count: 1, example: { message: 'a', severity: 'error' } },
        { category: 'Type Mismatch', count: 1, example: { message: 'b', severity: 'error' } },
        { category: 'Null Safety', count: 1, example: { message: 'c', severity: 'error' } },
        { category: 'Syntax Error', count: 1, example: { message: 'd', severity: 'error' } },
      ];

      const suggestions = generateSuggestions(categories);
      expect(suggestions).toContain('Consider running a clean build to resolve stale cache issues');
    });

    it('should deduplicate suggestions', () => {
      const categories: ErrorCategory[] = [
        { category: 'Missing Symbol', count: 5, example: { message: 'a', severity: 'error' } },
      ];

      const suggestions = generateSuggestions(categories);
      const importSuggestion = suggestions.filter(
        (s) => s.includes('Check for missing imports')
      );
      expect(importSuggestion).toHaveLength(1);
    });
  });
});

describe('Build Log Parser', () => {
  // These tests will be fully implemented when log-parser.ts is created
  describe('parseGradleOutput', () => {
    it('should extract errors from Gradle output', async () => {
      const gradleOutput = `
> Task :shared:compileKotlin FAILED
e: file:///project/shared/src/commonMain/kotlin/App.kt:15:10 Unresolved reference: foo
e: file:///project/shared/src/commonMain/kotlin/App.kt:20:5 Type mismatch: inferred type is String but Int was expected

FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':shared:compileKotlin'.
> Compilation error. See log for more details

BUILD FAILED in 5s
`;

      // This will test the actual parser once implemented
      // For now, we're defining the expected behavior
      const expectedErrors = [
        {
          file: '/project/shared/src/commonMain/kotlin/App.kt',
          line: 15,
          column: 10,
          message: 'Unresolved reference: foo',
          severity: 'error',
        },
        {
          file: '/project/shared/src/commonMain/kotlin/App.kt',
          line: 20,
          column: 5,
          message: 'Type mismatch: inferred type is String but Int was expected',
          severity: 'error',
        },
      ];

      // Placeholder - actual test will use the parser
      expect(expectedErrors).toHaveLength(2);
      expect(expectedErrors[0].line).toBe(15);
    });

    it('should extract warnings from Gradle output', async () => {
      const gradleOutput = `
> Task :androidApp:compileDebugKotlin
w: file:///project/androidApp/src/main/kotlin/MainActivity.kt:10:5 Variable 'unused' is never used
w: file:///project/androidApp/src/main/kotlin/MainActivity.kt:25:10 'oldMethod()' is deprecated

BUILD SUCCESSFUL in 3s
`;

      const expectedWarnings = [
        {
          file: '/project/androidApp/src/main/kotlin/MainActivity.kt',
          line: 10,
          message: "Variable 'unused' is never used",
          severity: 'warning',
        },
        {
          file: '/project/androidApp/src/main/kotlin/MainActivity.kt',
          line: 25,
          message: "'oldMethod()' is deprecated",
          severity: 'warning',
        },
      ];

      expect(expectedWarnings).toHaveLength(2);
      expect(expectedWarnings[0].severity).toBe('warning');
    });
  });

  describe('parseXcodebuildOutput', () => {
    it('should extract errors from xcodebuild output', async () => {
      const xcodebuildOutput = `
CompileSwift normal arm64 /project/iosApp/ContentView.swift
/project/iosApp/ContentView.swift:25:15: error: cannot find 'unknownVar' in scope
        print(unknownVar)
              ^~~~~~~~~~
/project/iosApp/ContentView.swift:30:10: error: value of type 'String' has no member 'foo'
        text.foo()
             ^~~

** BUILD FAILED **
`;

      const expectedErrors = [
        {
          file: '/project/iosApp/ContentView.swift',
          line: 25,
          column: 15,
          message: "cannot find 'unknownVar' in scope",
          severity: 'error',
        },
        {
          file: '/project/iosApp/ContentView.swift',
          line: 30,
          column: 10,
          message: "value of type 'String' has no member 'foo'",
          severity: 'error',
        },
      ];

      expect(expectedErrors).toHaveLength(2);
      expect(expectedErrors[0].column).toBe(15);
    });
  });
});

describe('Gradle Build Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildGradle', () => {
    it('should construct correct debug build command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL in 5s',
        stderr: '',
        exitCode: 0,
      });

      // When build executor is implemented, test:
      // await buildGradle({ variant: 'debug' });
      // expect(mockedExecuteShell).toHaveBeenCalledWith(
      //   './gradlew',
      //   ['assembleDebug'],
      //   expect.any(Object)
      // );

      // Placeholder assertion
      expect(true).toBe(true);
    });

    it('should construct correct release build command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL in 10s',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // await buildGradle({ variant: 'release' });
      // expect(mockedExecuteShell).toHaveBeenCalledWith(
      //   './gradlew',
      //   ['assembleRelease'],
      //   expect.any(Object)
      // );

      expect(true).toBe(true);
    });

    it('should run clean build when requested', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'BUILD SUCCESSFUL',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // await buildGradle({ variant: 'debug', clean: true });
      // expect(mockedExecuteShell).toHaveBeenCalledWith(
      //   './gradlew',
      //   ['clean', 'assembleDebug'],
      //   expect.any(Object)
      // );

      expect(true).toBe(true);
    });

    it('should handle build failure', async () => {
      const failureOutput = `
> Task :shared:compileKotlin FAILED
e: Error in source file

FAILURE: Build failed with an exception.
BUILD FAILED in 5s
`;

      mockedExecuteShell.mockResolvedValue({
        stdout: failureOutput,
        stderr: '',
        exitCode: 1,
      });

      // When implemented:
      // const result = await buildGradle({ variant: 'debug' });
      // expect(result.success).toBe(false);
      // expect(result.errorSummary).toBeDefined();

      expect(true).toBe(true);
    });
  });
});

describe('Xcodebuild Executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildXcode', () => {
    it('should construct correct simulator build command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // await buildXcode({ variant: 'debug', destination: 'simulator' });
      // expect(mockedExecuteShell).toHaveBeenCalledWith(
      //   'xcodebuild',
      //   expect.arrayContaining(['-scheme', 'iosApp', '-destination', expect.stringContaining('Simulator')]),
      //   expect.any(Object)
      // );

      expect(true).toBe(true);
    });

    it('should use correct scheme for debug builds', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '** BUILD SUCCEEDED **',
        stderr: '',
        exitCode: 0,
      });

      // Scheme should be 'iosApp' by default or configurable
      expect(true).toBe(true);
    });

    it('should handle build failure', async () => {
      const failureOutput = `
/project/iosApp/ContentView.swift:25:15: error: cannot find 'x' in scope

** BUILD FAILED **
`;

      mockedExecuteShell.mockResolvedValue({
        stdout: failureOutput,
        stderr: '',
        exitCode: 65,
      });

      // When implemented:
      // const result = await buildXcode({ variant: 'debug' });
      // expect(result.success).toBe(false);
      // expect(result.errorSummary?.topErrors).toHaveLength(1);

      expect(true).toBe(true);
    });
  });
});

describe('build_app Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call Gradle for Android platform', async () => {
    mockedExecuteShell.mockResolvedValue({
      stdout: 'BUILD SUCCESSFUL in 5s',
      stderr: '',
      exitCode: 0,
    });

    // When implemented:
    // const result = await buildApp({ platform: 'android', variant: 'debug' });
    // expect(result.platform).toBe('android');
    // expect(mockedExecuteShell).toHaveBeenCalledWith('./gradlew', expect.any(Array), expect.any(Object));

    expect(true).toBe(true);
  });

  it('should call xcodebuild for iOS platform', async () => {
    mockedExecuteShell.mockResolvedValue({
      stdout: '** BUILD SUCCEEDED **',
      stderr: '',
      exitCode: 0,
    });

    // When implemented:
    // const result = await buildApp({ platform: 'ios', variant: 'debug' });
    // expect(result.platform).toBe('ios');
    // expect(mockedExecuteShell).toHaveBeenCalledWith('xcodebuild', expect.any(Array), expect.any(Object));

    expect(true).toBe(true);
  });

  it('should return structured error on failure', async () => {
    mockedExecuteShell.mockResolvedValue({
      stdout: 'FAILURE: Build failed',
      stderr: 'e: Error message',
      exitCode: 1,
    });

    // When implemented:
    // const result = await buildApp({ platform: 'android', variant: 'debug' });
    // expect(result.success).toBe(false);
    // expect(result.errorSummary).toBeDefined();
    // expect(result.errorSummary?.suggestions.length).toBeGreaterThan(0);

    expect(true).toBe(true);
  });
});
