/**
 * Build Log Parser Unit Tests
 * Tests for unified Gradle and xcodebuild log parsing
 */

import { describe, it, expect } from 'vitest';
import {
  parseBuildLog,
  parseGradleLog,
  parseXcodeLog,
  extractErrorContext,
} from '../../../../src/tools/build/log-parser.js';

describe('Build Log Parser', () => {
  describe('parseBuildLog', () => {
    it('should use Gradle parser for android platform', () => {
      const output = 'e: /project/Main.kt:10:5 Unresolved reference: foo';

      const result = parseBuildLog(output, 'android');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe('/project/Main.kt');
    });

    it('should use Xcode parser for ios platform', () => {
      const output = '/project/Main.swift:10:5: error: cannot find foo';

      const result = parseBuildLog(output, 'ios');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].file).toBe('/project/Main.swift');
    });
  });

  describe('parseGradleLog', () => {
    describe('Kotlin error parsing', () => {
      it('should parse Kotlin compiler errors', () => {
        const output = `
> Task :shared:compileKotlinJvm FAILED
e: file:///project/src/Main.kt:15:10 Unresolved reference: foo
e: /project/src/Utils.kt:25:5 Type mismatch: inferred type is String but Int was expected

FAILURE: Build failed with an exception.
`;

        const result = parseGradleLog(output);

        const kotlinErrors = result.errors.filter((e) => e.file);
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

      it('should parse Kotlin warnings', () => {
        const output = `
w: file:///project/src/Main.kt:10:5 Variable 'unused' is never used
w: /project/src/Utils.kt:15:3 Deprecated function

BUILD SUCCESSFUL in 5s
`;

        const result = parseGradleLog(output);

        expect(result.warnings).toHaveLength(2);
        expect(result.warnings[0]).toMatchObject({
          file: '/project/src/Main.kt',
          line: 10,
          column: 5,
          message: "Variable 'unused' is never used",
          severity: 'warning',
        });
      });

      it('should handle file:// prefix in paths', () => {
        const output = 'e: file:///Users/dev/project/src/Main.kt:10:5 Error message';

        const result = parseGradleLog(output);

        expect(result.errors[0].file).toBe('/Users/dev/project/src/Main.kt');
      });

      it('should handle paths without file:// prefix', () => {
        const output = 'e: /project/src/Main.kt:10:5 Error message';

        const result = parseGradleLog(output);

        expect(result.errors[0].file).toBe('/project/src/Main.kt');
      });
    });

    describe('Java error parsing', () => {
      it('should parse Java compiler errors', () => {
        const output = `
/project/src/Main.java:15: error: cannot find symbol
    int x = foo;
            ^
/project/src/Utils.java:20: error: method does not override
`;

        const result = parseGradleLog(output);

        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]).toMatchObject({
          file: '/project/src/Main.java',
          line: 15,
          message: 'cannot find symbol',
          severity: 'error',
        });
      });

      it('should parse Java compiler warnings', () => {
        const output = `/project/src/Main.java:10: warning: unchecked cast`;

        const result = parseGradleLog(output);

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toMatchObject({
          file: '/project/src/Main.java',
          line: 10,
          message: 'unchecked cast',
          severity: 'warning',
        });
      });
    });

    describe('Generic error parsing', () => {
      it('should parse FAILURE messages', () => {
        const output = `
FAILURE: Build failed with an exception.

* What went wrong:
Execution failed for task ':app:compileDebugKotlin'.
`;

        const result = parseGradleLog(output);

        expect(result.errors.some((e) => e.message.includes('FAILURE'))).toBe(true);
        expect(result.errors.some((e) => e.message.includes('Execution failed'))).toBe(true);
      });
    });

    describe('Summary generation', () => {
      it('should count errors and warnings correctly', () => {
        const output = `
e: /project/Main.kt:10:5 Error 1
e: /project/Main.kt:15:5 Error 2
w: /project/Main.kt:20:5 Warning 1
`;

        const result = parseGradleLog(output);

        expect(result.summary.errorCount).toBe(2);
        expect(result.summary.warningCount).toBe(1);
      });

      it('should limit topErrors to 5', () => {
        const errors = Array.from(
          { length: 10 },
          (_, i) => `e: /project/File${i}.kt:${i + 1}:1 Error ${i}`
        ).join('\n');

        const result = parseGradleLog(errors);

        expect(result.summary.topErrors).toHaveLength(5);
      });

      it('should include log tail', () => {
        const output = 'Line 1\nLine 2\nLine 3\nFAILURE: Build failed';

        const result = parseGradleLog(output);

        expect(result.summary.logTail).toContain('Line 1');
        expect(result.summary.logTail).toContain('FAILURE');
      });

      it('should categorize errors', () => {
        const output = `
e: /project/Main.kt:10:5 Unresolved reference: foo
e: /project/Main.kt:15:5 Unresolved reference: bar
e: /project/Utils.kt:20:5 Type mismatch: String vs Int
`;

        const result = parseGradleLog(output);

        expect(result.summary.errorCategories.length).toBeGreaterThan(0);
        // Categories should be sorted by count (descending)
        const counts = result.summary.errorCategories.map((c) => c.count);
        expect(counts).toEqual([...counts].sort((a, b) => b - a));
      });

      it('should generate suggestions', () => {
        const output = 'e: /project/Main.kt:10:5 Unresolved reference: unknownFunction';

        const result = parseGradleLog(output);

        expect(result.summary.suggestions).toBeDefined();
      });
    });

    it('should handle empty output', () => {
      const result = parseGradleLog('');

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.summary.errorCount).toBe(0);
    });
  });

  describe('parseXcodeLog', () => {
    describe('Swift error parsing', () => {
      it('should parse Swift compiler errors', () => {
        const output = `
Compiling Swift source files
/project/Sources/ContentView.swift:15:10: error: cannot find 'foo' in scope
/project/Sources/AppDelegate.swift:25:5: error: type 'String' has no member 'bar'

** BUILD FAILED **
`;

        const result = parseXcodeLog(output);

        expect(result.errors).toHaveLength(2);
        expect(result.errors[0]).toMatchObject({
          file: '/project/Sources/ContentView.swift',
          line: 15,
          column: 10,
          message: "cannot find 'foo' in scope",
          severity: 'error',
        });
      });

      it('should parse Swift warnings', () => {
        const output = `
/project/Sources/Utils.swift:10:5: warning: variable 'unused' was never used
/project/Sources/Utils.swift:15:3: warning: expression result unused
`;

        const result = parseXcodeLog(output);

        expect(result.warnings).toHaveLength(2);
        expect(result.warnings[0]).toMatchObject({
          file: '/project/Sources/Utils.swift',
          line: 10,
          column: 5,
          message: "variable 'unused' was never used",
          severity: 'warning',
        });
      });
    });

    describe('Clang/Objective-C error parsing', () => {
      it('should parse Clang errors', () => {
        const output = `/project/Sources/AppDelegate.m:20:10: error: use of undeclared identifier 'foo'`;

        const result = parseXcodeLog(output);

        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toMatchObject({
          file: '/project/Sources/AppDelegate.m',
          line: 20,
          column: 10,
          message: "use of undeclared identifier 'foo'",
          severity: 'error',
        });
      });
    });

    describe('Linker error parsing', () => {
      it('should parse ld errors', () => {
        const output = `
ld: error: undefined symbol: _someFunction
clang: error: linker command failed with exit code 1
`;

        const result = parseXcodeLog(output);

        expect(result.errors).toHaveLength(2);
        expect(result.errors[0].message).toBe('undefined symbol: _someFunction');
        expect(result.errors[1].message).toBe('linker command failed with exit code 1');
      });

      it('should parse linker warnings', () => {
        const output = `ld: warning: directory not found for option '-L/some/path'`;

        const result = parseXcodeLog(output);

        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].message).toContain('directory not found');
      });
    });

    describe('Summary generation', () => {
      it('should count errors and warnings correctly', () => {
        const output = `
/project/File.swift:10:5: error: Error 1
/project/File.swift:15:5: error: Error 2
/project/File.swift:20:5: warning: Warning 1
`;

        const result = parseXcodeLog(output);

        expect(result.summary.errorCount).toBe(2);
        expect(result.summary.warningCount).toBe(1);
      });

      it('should limit topErrors to 5', () => {
        const errors = Array.from(
          { length: 10 },
          (_, i) => `/project/File${i}.swift:${i + 1}:1: error: Error ${i}`
        ).join('\n');

        const result = parseXcodeLog(errors);

        expect(result.summary.topErrors).toHaveLength(5);
      });

      it('should not include BUILD FAILED as a separate error', () => {
        const output = `
/project/File.swift:10:5: error: Some error
** BUILD FAILED **
`;

        const result = parseXcodeLog(output);

        // Only one actual error, not the BUILD FAILED marker
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).not.toContain('BUILD FAILED');
      });
    });

    it('should handle empty output', () => {
      const result = parseXcodeLog('');

      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.summary.errorCount).toBe(0);
    });
  });

  describe('extractErrorContext', () => {
    const fileContent = `line 1
line 2
line 3
line 4 with error
line 5
line 6
line 7`;

    it('should extract context around error line', () => {
      const context = extractErrorContext(fileContent, 4, 2);

      expect(context).toContain('line 2');
      expect(context).toContain('line 3');
      expect(context).toContain('line 4 with error');
      expect(context).toContain('line 5');
      expect(context).toContain('line 6');
    });

    it('should mark the error line with >', () => {
      const context = extractErrorContext(fileContent, 4, 2);

      // Line 4 should have the > marker
      expect(context).toMatch(/>\s+4: line 4 with error/);
      // Other lines should have space marker
      expect(context).toMatch(/\s+3: line 3/);
    });

    it('should handle error at start of file', () => {
      const context = extractErrorContext(fileContent, 1, 2);

      // Should not crash, should include line 1
      expect(context).toContain('line 1');
      expect(context).toMatch(/>\s+1: line 1/);
    });

    it('should handle error at end of file', () => {
      const context = extractErrorContext(fileContent, 7, 2);

      // Should not crash, should include line 7
      expect(context).toContain('line 7');
      expect(context).toMatch(/>\s+7: line 7/);
    });

    it('should use default context of 3 lines', () => {
      const context = extractErrorContext(fileContent, 4);

      // With 3 lines of context, we should see lines 1-7
      expect(context).toContain('line 1');
      expect(context).toContain('line 7');
    });

    it('should pad line numbers', () => {
      const context = extractErrorContext(fileContent, 4, 2);

      // Line numbers should be padded to 4 characters
      expect(context).toMatch(/\s+2:/);
      expect(context).toMatch(/\s+3:/);
    });

    it('should handle single line file', () => {
      const singleLineContent = 'only line';
      const context = extractErrorContext(singleLineContent, 1, 2);

      expect(context).toContain('only line');
      expect(context).toMatch(/>\s+1:/);
    });
  });
});
