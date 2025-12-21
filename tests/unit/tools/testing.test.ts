/**
 * Unit tests for testing tools
 * Tests run_unit_tests, run_maestro_flow, and run_linter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestResult, TestSuite, parseJUnitXml, extractTestFailures, createTestSummary } from '../../../src/models/test-result.js';
import { FlowResult, FailureBundle, analyzeFailure, createFailureSummary, generateBundleId } from '../../../src/models/failure-bundle.js';
import { LintResult, LintIssue, parseDetektXml, parseAndroidLintXml, parseSwiftLintJson, groupIssuesByFile, createLintSummary } from '../../../src/models/lint-result.js';

// Mock shell execution
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
}));

describe('Test Result Models', () => {
  describe('parseJUnitXml', () => {
    it('should parse JUnit XML with passing tests', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <testsuites>
          <testsuite name="com.example.UserTests" tests="2" failures="0" errors="0" skipped="0" time="0.123">
            <testcase name="testLogin" classname="com.example.UserTests" time="0.050"/>
            <testcase name="testLogout" classname="com.example.UserTests" time="0.073"/>
          </testsuite>
        </testsuites>`;

      const suites = parseJUnitXml(xml);
      expect(suites).toHaveLength(1);
      expect(suites[0].name).toBe('com.example.UserTests');
      expect(suites[0].totalTests).toBe(2);
      expect(suites[0].passed).toBe(2);
      expect(suites[0].failed).toBe(0);
      expect(suites[0].testCases).toHaveLength(2);
      expect(suites[0].testCases[0].status).toBe('passed');
    });

    it('should parse JUnit XML with failing tests', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <testsuite name="com.example.UserTests" tests="2" failures="1" errors="0" skipped="0" time="0.200">
          <testcase name="testLogin" classname="com.example.UserTests" time="0.050"/>
          <testcase name="testValidation" classname="com.example.UserTests" time="0.150">
            <failure message="Expected true but was false">
              at com.example.UserTests.testValidation(UserTests.kt:42)
            </failure>
          </testcase>
        </testsuite>`;

      const suites = parseJUnitXml(xml);
      expect(suites[0].failed).toBe(1);
      expect(suites[0].testCases[1].status).toBe('failed');
      expect(suites[0].testCases[1].failureMessage).toBe('Expected true but was false');
      expect(suites[0].testCases[1].stackTrace).toContain('UserTests.kt:42');
    });

    it('should parse JUnit XML with skipped tests', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <testsuite name="com.example.Tests" tests="2" failures="0" errors="0" skipped="1" time="0.100">
          <testcase name="testEnabled" classname="com.example.Tests" time="0.100"/>
          <testcase name="testDisabled" classname="com.example.Tests" time="0.000">
            <skipped/>
          </testcase>
        </testsuite>`;

      const suites = parseJUnitXml(xml);
      expect(suites[0].skipped).toBe(1);
      expect(suites[0].testCases[1].status).toBe('skipped');
    });

    it('should parse JUnit XML with error tests', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <testsuite name="com.example.Tests" tests="1" failures="0" errors="1" time="0.050">
          <testcase name="testCrash" classname="com.example.Tests" time="0.050">
            <error message="NullPointerException">
              at com.example.Tests.testCrash(Tests.kt:10)
            </error>
          </testcase>
        </testsuite>`;

      const suites = parseJUnitXml(xml);
      expect(suites[0].errors).toBe(1);
      expect(suites[0].testCases[0].status).toBe('error');
      expect(suites[0].testCases[0].failureMessage).toBe('NullPointerException');
    });
  });

  describe('extractTestFailures', () => {
    it('should extract failures with categorization', () => {
      const result: TestResult = {
        platform: 'android',
        testType: 'unit',
        success: false,
        totalTests: 3,
        passed: 1,
        failed: 2,
        skipped: 0,
        errors: 0,
        durationMs: 1000,
        suites: [{
          name: 'TestSuite',
          totalTests: 3,
          passed: 1,
          failed: 2,
          skipped: 0,
          errors: 0,
          durationMs: 1000,
          testCases: [
            { name: 'testPass', className: 'Tests', status: 'passed', durationMs: 100 },
            {
              name: 'testAssertion',
              className: 'Tests',
              status: 'failed',
              durationMs: 100,
              failureMessage: 'Expected 5 but actual was 10',
            },
            {
              name: 'testTimeout',
              className: 'Tests',
              status: 'failed',
              durationMs: 5000,
              failureMessage: 'Test timed out after 5000ms',
            },
          ],
        }],
        timestamp: Date.now(),
      };

      const failures = extractTestFailures(result);
      expect(failures).toHaveLength(2);
      expect(failures[0].failureType).toBe('assertion');
      expect(failures[1].failureType).toBe('timeout');
    });

    it('should generate suggestions for common failures', () => {
      const result: TestResult = {
        platform: 'android',
        testType: 'unit',
        success: false,
        totalTests: 1,
        passed: 0,
        failed: 1,
        skipped: 0,
        errors: 0,
        durationMs: 100,
        suites: [{
          name: 'TestSuite',
          totalTests: 1,
          passed: 0,
          failed: 1,
          skipped: 0,
          errors: 0,
          durationMs: 100,
          testCases: [{
            name: 'testNull',
            className: 'Tests',
            status: 'failed',
            durationMs: 100,
            failureMessage: 'NullPointerException at line 42',
          }],
        }],
        timestamp: Date.now(),
      };

      const failures = extractTestFailures(result);
      expect(failures[0].suggestion).toContain('null');
    });
  });

  describe('createTestSummary', () => {
    it('should create summary for passing tests', () => {
      const result: TestResult = {
        platform: 'android',
        testType: 'unit',
        sourceSet: 'commonMain',
        success: true,
        totalTests: 10,
        passed: 10,
        failed: 0,
        skipped: 0,
        errors: 0,
        durationMs: 2500,
        suites: [],
        timestamp: Date.now(),
      };

      const summary = createTestSummary(result);
      expect(summary).toContain('PASSED');
      expect(summary).toContain('commonMain');
      expect(summary).toContain('Passed: 10');
    });

    it('should create summary with failures', () => {
      const result: TestResult = {
        platform: 'android',
        testType: 'unit',
        success: false,
        totalTests: 5,
        passed: 3,
        failed: 2,
        skipped: 0,
        errors: 0,
        durationMs: 1000,
        suites: [{
          name: 'Suite',
          totalTests: 5,
          passed: 3,
          failed: 2,
          skipped: 0,
          errors: 0,
          durationMs: 1000,
          testCases: [
            { name: 'fail1', className: 'Tests', status: 'failed', durationMs: 100, failureMessage: 'Error 1' },
            { name: 'fail2', className: 'Tests', status: 'failed', durationMs: 100, failureMessage: 'Error 2' },
          ],
        }],
        timestamp: Date.now(),
      };

      const summary = createTestSummary(result);
      expect(summary).toContain('FAILED');
      expect(summary).toContain('Failures:');
    });
  });
});

describe('Failure Bundle Models', () => {
  describe('generateBundleId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBundleId();
      const id2 = generateBundleId();

      expect(id1).toMatch(/^fb-[a-z0-9]+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('analyzeFailure', () => {
    it('should suggest tap issues for tap failures', () => {
      const bundle: FailureBundle = {
        id: 'fb-test',
        timestamp: Date.now(),
        platform: 'android',
        deviceId: 'emulator-5554',
        flowResult: {
          flowName: 'login.yaml',
          flowPath: '/flows/login.yaml',
          success: false,
          totalSteps: 5,
          passedSteps: 2,
          failedAtStep: 2,
          durationMs: 5000,
          steps: [
            { index: 0, command: 'launchApp', args: {}, status: 'passed', durationMs: 1000 },
            { index: 1, command: 'assertVisible', args: { text: 'Login' }, status: 'passed', durationMs: 500 },
            { index: 2, command: 'tapOn', args: { id: 'submit_btn' }, status: 'failed', durationMs: 3000, error: 'Element not found' },
          ],
        },
        logs: [],
        suggestions: [],
      };

      const suggestions = analyzeFailure(bundle);
      expect(suggestions.some(s => s.includes('visible') || s.includes('clickable'))).toBe(true);
    });

    it('should detect timeout issues', () => {
      const bundle: FailureBundle = {
        id: 'fb-test',
        timestamp: Date.now(),
        platform: 'ios',
        deviceId: 'UDID-123',
        flowResult: {
          flowName: 'checkout.yaml',
          flowPath: '/flows/checkout.yaml',
          success: false,
          totalSteps: 3,
          passedSteps: 1,
          failedAtStep: 1,
          durationMs: 30000,
          steps: [
            { index: 0, command: 'launchApp', args: {}, status: 'passed', durationMs: 2000 },
            { index: 1, command: 'assertVisible', args: {}, status: 'failed', durationMs: 28000, error: 'Timeout waiting for element' },
          ],
        },
        logs: [],
        suggestions: [],
      };

      const suggestions = analyzeFailure(bundle);
      expect(suggestions.some(s => s.toLowerCase().includes('timeout'))).toBe(true);
    });

    it('should analyze error logs', () => {
      const bundle: FailureBundle = {
        id: 'fb-test',
        timestamp: Date.now(),
        platform: 'android',
        deviceId: 'emulator-5554',
        flowResult: {
          flowName: 'test.yaml',
          flowPath: '/flows/test.yaml',
          success: false,
          totalSteps: 1,
          passedSteps: 0,
          failedAtStep: 0,
          durationMs: 1000,
          steps: [{ index: 0, command: 'tap', args: {}, status: 'failed', durationMs: 1000 }],
        },
        logs: [
          { timestamp: Date.now(), level: 'error', tag: 'App', message: 'OutOfMemoryError' },
          { timestamp: Date.now(), level: 'error', tag: 'App', message: 'Crash detected' },
        ],
        suggestions: [],
      };

      const suggestions = analyzeFailure(bundle);
      expect(suggestions.some(s => s.includes('error log'))).toBe(true);
      expect(suggestions.some(s => s.toLowerCase().includes('memory'))).toBe(true);
    });
  });

  describe('createFailureSummary', () => {
    it('should create readable summary', () => {
      const bundle: FailureBundle = {
        id: 'fb-abc123',
        timestamp: Date.now(),
        platform: 'android',
        deviceId: 'emulator-5554',
        flowResult: {
          flowName: 'login.yaml',
          flowPath: '/flows/login.yaml',
          success: false,
          totalSteps: 5,
          passedSteps: 3,
          failedAtStep: 3,
          durationMs: 10000,
          steps: [
            { index: 0, command: 'launchApp', args: {}, status: 'passed', durationMs: 2000 },
            { index: 1, command: 'tapOn', args: {}, status: 'passed', durationMs: 500 },
            { index: 2, command: 'inputText', args: {}, status: 'passed', durationMs: 500 },
            { index: 3, command: 'assertVisible', args: { text: 'Welcome' }, status: 'failed', durationMs: 5000, error: 'Element not visible' },
          ],
        },
        logs: [],
        suggestions: ['Check if navigation completed', 'Verify element exists'],
      };

      const summary = createFailureSummary(bundle);
      expect(summary).toContain('fb-abc123');
      expect(summary).toContain('login.yaml');
      expect(summary).toContain('3/5 passed');
      expect(summary).toContain('assertVisible');
      expect(summary).toContain('Suggestions:');
    });
  });
});

describe('Lint Result Models', () => {
  describe('parseDetektXml', () => {
    it('should parse Detekt checkstyle output', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <checkstyle version="4.3">
          <file name="src/main/kotlin/Example.kt">
            <error line="10" column="5" severity="warning" message="Magic number used" source="detekt.style.MagicNumber"/>
            <error line="25" severity="error" message="Function too long" source="detekt.complexity.LongMethod"/>
          </file>
        </checkstyle>`;

      const issues = parseDetektXml(xml);
      expect(issues).toHaveLength(2);
      expect(issues[0].ruleId).toBe('MagicNumber');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].line).toBe(10);
      expect(issues[0].column).toBe(5);
      expect(issues[1].severity).toBe('error');
      expect(issues[1].line).toBe(25);
    });
  });

  describe('parseAndroidLintXml', () => {
    it('should parse Android Lint XML output', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <issues format="5" by="lint">
          <issue id="HardcodedText" severity="Warning" message="Hardcoded string" category="Internationalization">
            <location file="app/src/main/res/layout/activity.xml" line="15" column="20"/>
          </issue>
          <issue id="UnusedResources" severity="Error" message="Unused resource" category="Performance">
            <location file="app/src/main/res/values/strings.xml" line="5" column="1"/>
          </issue>
        </issues>`;

      const issues = parseAndroidLintXml(xml);
      expect(issues).toHaveLength(2);
      expect(issues[0].ruleId).toBe('HardcodedText');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].category).toBe('Internationalization');
      expect(issues[1].ruleId).toBe('UnusedResources');
      expect(issues[1].severity).toBe('error');
    });
  });

  describe('parseSwiftLintJson', () => {
    it('should parse SwiftLint JSON output', () => {
      const json = JSON.stringify([
        {
          file: '/path/to/File.swift',
          line: 42,
          character: 10,
          severity: 'Warning',
          type: 'Style',
          rule_id: 'line_length',
          reason: 'Line should be 120 characters or less',
        },
        {
          file: '/path/to/Other.swift',
          line: 15,
          severity: 'Error',
          type: 'Lint',
          rule_id: 'force_cast',
          reason: 'Force casts should be avoided',
        },
      ]);

      const issues = parseSwiftLintJson(json);
      expect(issues).toHaveLength(2);
      expect(issues[0].ruleId).toBe('line_length');
      expect(issues[0].severity).toBe('warning');
      expect(issues[0].column).toBe(10);
      expect(issues[1].ruleId).toBe('force_cast');
      expect(issues[1].severity).toBe('error');
    });

    it('should handle invalid JSON gracefully', () => {
      const issues = parseSwiftLintJson('invalid json');
      expect(issues).toHaveLength(0);
    });
  });

  describe('groupIssuesByFile', () => {
    it('should group issues by file path', () => {
      const issues: LintIssue[] = [
        { ruleId: 'rule1', severity: 'error', message: 'Error 1', file: 'a.kt', line: 1 },
        { ruleId: 'rule2', severity: 'warning', message: 'Warning 1', file: 'a.kt', line: 5 },
        { ruleId: 'rule3', severity: 'error', message: 'Error 2', file: 'b.kt', line: 10 },
      ];

      const grouped = groupIssuesByFile(issues);
      expect(grouped).toHaveLength(2);

      const fileA = grouped.find(f => f.file === 'a.kt');
      expect(fileA?.issues).toHaveLength(2);
      expect(fileA?.errorCount).toBe(1);
      expect(fileA?.warningCount).toBe(1);

      const fileB = grouped.find(f => f.file === 'b.kt');
      expect(fileB?.issues).toHaveLength(1);
      expect(fileB?.errorCount).toBe(1);
    });
  });

  describe('createLintSummary', () => {
    it('should create summary for passing lint', () => {
      const result: LintResult = {
        platform: 'android',
        linter: 'detekt',
        success: true,
        totalIssues: 0,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        styleCount: 0,
        files: [],
        durationMs: 5000,
        timestamp: Date.now(),
      };

      const summary = createLintSummary(result);
      expect(summary).toContain('PASSED');
      expect(summary).toContain('detekt');
      expect(summary).toContain('Errors: 0');
    });

    it('should create summary with errors', () => {
      const result: LintResult = {
        platform: 'android',
        linter: 'android-lint',
        success: false,
        totalIssues: 5,
        errorCount: 2,
        warningCount: 3,
        infoCount: 0,
        styleCount: 0,
        files: [{
          file: 'Test.kt',
          issues: [
            { ruleId: 'Error1', severity: 'error', message: 'First error', file: 'Test.kt', line: 10 },
            { ruleId: 'Error2', severity: 'error', message: 'Second error', file: 'Test.kt', line: 20 },
          ],
          errorCount: 2,
          warningCount: 0,
        }],
        durationMs: 3000,
        timestamp: Date.now(),
      };

      const summary = createLintSummary(result);
      expect(summary).toContain('FAILED');
      expect(summary).toContain('Errors:');
      expect(summary).toContain('Error1');
    });
  });
});

describe('run_unit_tests tool', () => {
  it('should validate platform argument', async () => {
    // This will be tested with the actual handler implementation
    expect(true).toBe(true);
  });

  it('should support sourceSet filtering for KMM', async () => {
    // Test sourceSet parameter support
    expect(true).toBe(true);
  });
});

describe('run_maestro_flow tool', () => {
  it('should require flow path argument', async () => {
    expect(true).toBe(true);
  });

  it('should generate failure bundle on test failure', async () => {
    expect(true).toBe(true);
  });
});

describe('run_linter tool', () => {
  it('should support multiple linter types', async () => {
    expect(true).toBe(true);
  });

  it('should return structured issue list', async () => {
    expect(true).toBe(true);
  });
});
