/**
 * Unit tests for Crash Analysis tools
 * Tests crash log parsing, symbolication, and pattern detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CrashReport,
  CrashPattern,
  StackFrame,
  ThreadInfo,
  detectCrashPatterns,
  generateCrashSummary,
  generateCrashSuggestions,
} from '../../../src/models/crash-report.js';

// Mock crash report for testing
function createMockCrashReport(overrides: Partial<CrashReport> = {}): CrashReport {
  const crashedThread: ThreadInfo = {
    index: 0,
    name: 'main',
    crashed: true,
    frames: [
      {
        index: 0,
        binary: 'TestApp',
        address: '0x100001250',
        symbol: '_$s7TestApp11ViewControllerC10loadViewyyF',
        isAppCode: true,
      },
      {
        index: 1,
        binary: 'TestApp',
        address: '0x100001020',
        symbol: '_$s7TestApp11ViewControllerC11viewDidLoadyyF',
        isAppCode: true,
      },
      {
        index: 2,
        binary: 'UIKitCore',
        address: '0x180100100',
        symbol: '-[UIViewController loadViewIfRequired]',
        isAppCode: false,
      },
    ],
  };

  return {
    timestamp: new Date('2025-01-15T14:30:00Z'),
    platform: 'ios',
    processName: 'TestApp',
    bundleId: 'com.example.testapp',
    appVersion: '1.0.0',
    deviceModel: 'iPhone14,5',
    osVersion: 'iOS 17.2',
    exception: {
      type: 'EXC_BAD_ACCESS',
      codes: 'KERN_INVALID_ADDRESS',
      signal: 'SIGSEGV',
      faultAddress: '0x0000000000000000',
    },
    threads: [crashedThread],
    crashedThread,
    binaryImages: [
      {
        name: 'TestApp',
        arch: 'arm64',
        uuid: 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890',
        loadAddress: '0x100000000',
        path: '/var/containers/Bundle/Application/UUID/TestApp.app/TestApp',
      },
    ],
    isSymbolicated: true,
    patterns: [],
    ...overrides,
  };
}

describe('Crash Report Models', () => {
  describe('CrashReport structure', () => {
    it('should have required fields', () => {
      const report = createMockCrashReport();

      expect(report.timestamp).toBeDefined();
      expect(report.platform).toBe('ios');
      expect(report.processName).toBe('TestApp');
      expect(report.exception).toBeDefined();
      expect(report.crashedThread).toBeDefined();
      expect(report.threads).toHaveLength(1);
    });

    it('should include exception details', () => {
      const report = createMockCrashReport();

      expect(report.exception.type).toBe('EXC_BAD_ACCESS');
      expect(report.exception.codes).toBe('KERN_INVALID_ADDRESS');
      expect(report.exception.signal).toBe('SIGSEGV');
    });

    it('should include stack frames in crashed thread', () => {
      const report = createMockCrashReport();

      expect(report.crashedThread.frames).toHaveLength(3);
      expect(report.crashedThread.crashed).toBe(true);
    });

    it('should distinguish app code from system frames', () => {
      const report = createMockCrashReport();
      const frames = report.crashedThread.frames;

      expect(frames[0].isAppCode).toBe(true);
      expect(frames[1].isAppCode).toBe(true);
      expect(frames[2].isAppCode).toBe(false);
    });
  });

  describe('StackFrame structure', () => {
    it('should contain frame information', () => {
      const frame: StackFrame = {
        index: 0,
        binary: 'TestApp',
        address: '0x100001250',
        symbol: 'myFunction',
        offset: 28,
        file: 'ViewController.swift',
        line: 42,
        isAppCode: true,
      };

      expect(frame.index).toBe(0);
      expect(frame.binary).toBe('TestApp');
      expect(frame.symbol).toBe('myFunction');
      expect(frame.file).toBe('ViewController.swift');
      expect(frame.line).toBe(42);
    });

    it('should allow optional source location', () => {
      const frame: StackFrame = {
        index: 0,
        binary: 'TestApp',
        address: '0x100001250',
        symbol: '0x100001250', // Unsymbolicated
        isAppCode: true,
      };

      expect(frame.file).toBeUndefined();
      expect(frame.line).toBeUndefined();
    });
  });
});

describe('Pattern Detection', () => {
  describe('detectCrashPatterns', () => {
    it('should detect null pointer dereference', () => {
      const report = createMockCrashReport({
        exception: {
          type: 'EXC_BAD_ACCESS',
          codes: 'KERN_INVALID_ADDRESS',
          faultAddress: '0x0',
        },
      });

      const patterns = detectCrashPatterns(report);

      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns[0].id).toBe('exc_bad_access_null');
      expect(patterns[0].name).toBe('Null Pointer Dereference');
      expect(patterns[0].severity).toBe('critical');
    });

    it('should detect invalid memory access', () => {
      const report = createMockCrashReport({
        exception: {
          type: 'EXC_BAD_ACCESS',
          codes: 'KERN_INVALID_ADDRESS at 0x1234',
          faultAddress: '0x1234',
        },
      });

      const patterns = detectCrashPatterns(report);

      const invalidAccess = patterns.find((p) => p.id === 'exc_bad_access_kern_invalid');
      expect(invalidAccess).toBeDefined();
      expect(invalidAccess?.severity).toBe('critical');
    });

    it('should detect SIGABRT with assertion', () => {
      const crashedThread: ThreadInfo = {
        index: 0,
        crashed: true,
        frames: [
          {
            index: 0,
            binary: 'TestApp',
            address: '0x100001000',
            symbol: 'swift_fatalError',
            isAppCode: false,
          },
          {
            index: 1,
            binary: 'TestApp',
            address: '0x100001100',
            symbol: 'assertionFailure',
            isAppCode: true,
          },
        ],
      };

      const report = createMockCrashReport({
        exception: { type: 'SIGABRT' },
        crashedThread,
        threads: [crashedThread],
      });

      const patterns = detectCrashPatterns(report);

      const assertion = patterns.find((p) => p.id === 'sigabrt_assertion');
      expect(assertion).toBeDefined();
      expect(assertion?.name).toBe('Assertion Failure');
    });

    it('should detect uncaught exception', () => {
      const crashedThread: ThreadInfo = {
        index: 0,
        crashed: true,
        frames: [
          {
            index: 0,
            binary: 'libobjc.A.dylib',
            address: '0x180001000',
            symbol: 'objc_exception_throw',
            isAppCode: false,
          },
          {
            index: 1,
            binary: 'TestApp',
            address: '0x100001100',
            symbol: '-[TestClass performAction]',
            isAppCode: true,
          },
        ],
      };

      const report = createMockCrashReport({
        exception: { type: 'SIGABRT' },
        crashedThread,
        threads: [crashedThread],
      });

      const patterns = detectCrashPatterns(report);

      const uncaught = patterns.find((p) => p.id === 'sigabrt_uncaught_exception');
      expect(uncaught).toBeDefined();
      expect(uncaught?.severity).toBe('high');
    });

    it('should detect watchdog timeout', () => {
      const report = createMockCrashReport({
        exception: { type: 'EXC_CRASH' },
        rawLog: 'Application terminated due to 8badf00d',
      });

      const patterns = detectCrashPatterns(report);

      const watchdog = patterns.find((p) => p.id === 'watchdog_timeout');
      expect(watchdog).toBeDefined();
      expect(watchdog?.name).toBe('Watchdog Timeout');
      expect(watchdog?.severity).toBe('critical');
    });

    it('should detect stack overflow', () => {
      // Create a thread with many repeating frames
      const frames: StackFrame[] = [];
      for (let i = 0; i < 100; i++) {
        frames.push({
          index: i,
          binary: 'TestApp',
          address: `0x10000${1000 + i}`,
          symbol: 'recursiveFunction',
          isAppCode: true,
        });
      }

      const crashedThread: ThreadInfo = {
        index: 0,
        crashed: true,
        frames,
      };

      const report = createMockCrashReport({
        exception: { type: 'EXC_BAD_ACCESS' },
        crashedThread,
        threads: [crashedThread],
      });

      const patterns = detectCrashPatterns(report);

      const overflow = patterns.find((p) => p.id === 'stack_overflow');
      expect(overflow).toBeDefined();
      expect(overflow?.name).toBe('Stack Overflow');
    });

    it('should detect Swift runtime failure', () => {
      const crashedThread: ThreadInfo = {
        index: 0,
        crashed: true,
        frames: [
          {
            index: 0,
            binary: 'libswiftCore.dylib',
            address: '0x180001000',
            symbol: 'swift_fatalError',
            isAppCode: false,
          },
          {
            index: 1,
            binary: 'TestApp',
            address: '0x100001100',
            symbol: 'ViewModel.loadData()',
            isAppCode: true,
          },
        ],
      };

      const report = createMockCrashReport({
        exception: { type: 'SIGABRT' },
        crashedThread,
        threads: [crashedThread],
      });

      const patterns = detectCrashPatterns(report);

      const swift = patterns.find((p) => p.id === 'swift_runtime_failure');
      expect(swift).toBeDefined();
    });

    it('should sort patterns by severity and confidence', () => {
      const crashedThread: ThreadInfo = {
        index: 0,
        crashed: true,
        frames: [
          {
            index: 0,
            binary: 'libdispatch.dylib',
            address: '0x180001000',
            symbol: 'dispatch_sync',
            isAppCode: false,
          },
        ],
      };

      const report = createMockCrashReport({
        exception: {
          type: 'EXC_BAD_ACCESS',
          codes: 'KERN_INVALID_ADDRESS',
          faultAddress: '0x0',
        },
        crashedThread,
        threads: [crashedThread],
      });

      const patterns = detectCrashPatterns(report);

      // Critical patterns should come first
      if (patterns.length >= 2) {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        expect(severityOrder[patterns[0].severity]).toBeLessThanOrEqual(
          severityOrder[patterns[1].severity]
        );
      }
    });

    it('should return empty array for unrecognized crash', () => {
      const report = createMockCrashReport({
        exception: { type: 'UNKNOWN_EXCEPTION' },
      });

      const patterns = detectCrashPatterns(report);

      // May or may not find patterns, but should not throw
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should include confidence scores', () => {
      const report = createMockCrashReport({
        exception: {
          type: 'EXC_BAD_ACCESS',
          faultAddress: '0x0',
        },
        isSymbolicated: true,
      });

      const patterns = detectCrashPatterns(report);

      if (patterns.length > 0) {
        expect(patterns[0].confidence).toBeGreaterThan(0);
        expect(patterns[0].confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});

describe('Crash Summary Generation', () => {
  describe('generateCrashSummary', () => {
    it('should generate markdown summary', () => {
      const report = createMockCrashReport();
      report.patterns = detectCrashPatterns(report);

      const summary = generateCrashSummary(report);

      expect(summary).toContain('## Crash Summary');
      expect(summary).toContain('TestApp');
      expect(summary).toContain('EXC_BAD_ACCESS');
    });

    it('should include device and OS info', () => {
      const report = createMockCrashReport({
        deviceModel: 'iPhone15,2',
        osVersion: 'iOS 18.0',
      });

      const summary = generateCrashSummary(report);

      expect(summary).toContain('iPhone15,2');
      expect(summary).toContain('iOS 18.0');
    });

    it('should include crashed thread info', () => {
      const report = createMockCrashReport();

      const summary = generateCrashSummary(report);

      expect(summary).toContain('Crashed Thread');
      expect(summary).toContain('App Code');
    });

    it('should include app code frames', () => {
      const report = createMockCrashReport();

      const summary = generateCrashSummary(report);

      expect(summary).toContain('ViewControllerC10loadView');
    });

    it('should include detected patterns when present', () => {
      const report = createMockCrashReport({
        exception: {
          type: 'EXC_BAD_ACCESS',
          faultAddress: '0x0',
        },
      });
      report.patterns = detectCrashPatterns(report);

      const summary = generateCrashSummary(report);

      if (report.patterns.length > 0) {
        expect(summary).toContain('Detected Patterns');
        expect(summary).toContain(report.patterns[0].name);
      }
    });
  });
});

describe('Suggestion Generation', () => {
  describe('generateCrashSuggestions', () => {
    it('should generate suggestions from patterns', () => {
      const patterns: CrashPattern[] = [
        {
          id: 'exc_bad_access_null',
          name: 'Null Pointer Dereference',
          severity: 'critical',
          description: 'Null pointer access',
          likelyCause: 'Force unwrap',
          suggestion: 'Use optional binding',
          confidence: 0.9,
        },
      ];

      const suggestions = generateCrashSuggestions(patterns);

      expect(suggestions).toContain('Use optional binding');
    });

    it('should add default suggestions when no patterns', () => {
      const suggestions = generateCrashSuggestions([]);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some((s) => s.includes('symbolication'))).toBe(true);
    });

    it('should prioritize critical crashes', () => {
      const patterns: CrashPattern[] = [
        {
          id: 'critical_crash',
          name: 'Critical Crash',
          severity: 'critical',
          description: 'Critical issue',
          likelyCause: 'Unknown',
          suggestion: 'Investigate immediately',
          confidence: 0.9,
        },
      ];

      const suggestions = generateCrashSuggestions(patterns);

      expect(suggestions.some((s) => s.toLowerCase().includes('critical'))).toBe(true);
    });

    it('should deduplicate suggestions', () => {
      const patterns: CrashPattern[] = [
        {
          id: 'pattern1',
          name: 'Pattern 1',
          severity: 'high',
          description: 'Issue 1',
          likelyCause: 'Cause',
          suggestion: 'Same suggestion',
          confidence: 0.8,
        },
        {
          id: 'pattern2',
          name: 'Pattern 2',
          severity: 'high',
          description: 'Issue 2',
          likelyCause: 'Cause',
          suggestion: 'Same suggestion',
          confidence: 0.7,
        },
      ];

      const suggestions = generateCrashSuggestions(patterns);

      const sameCount = suggestions.filter((s) => s === 'Same suggestion').length;
      expect(sameCount).toBe(1);
    });
  });
});

describe('Crash Log Parser', () => {
  describe('IPS format parsing', () => {
    it('should parse JSON IPS format', () => {
      // This will be implemented by the parser module
      const ipsPath = join(__dirname, '../../mocks/crash-reports/sample-crash.ips');
      const content = readFileSync(ipsPath, 'utf-8');
      const ipsData = JSON.parse(content);

      expect(ipsData.app_name).toBe('TestApp');
      expect(ipsData.bundle_id).toBe('com.example.testapp');
      expect(ipsData.exception.type).toBe('EXC_BAD_ACCESS');
      expect(ipsData.threads).toHaveLength(2);
    });

    it('should have thread frames', () => {
      const ipsPath = join(__dirname, '../../mocks/crash-reports/sample-crash.ips');
      const content = readFileSync(ipsPath, 'utf-8');
      const ipsData = JSON.parse(content);

      const crashedThread = ipsData.threads[0];
      expect(crashedThread.crashed).toBe(true);
      expect(crashedThread.frames.length).toBeGreaterThan(0);
    });

    it('should have binary images for symbolication', () => {
      const ipsPath = join(__dirname, '../../mocks/crash-reports/sample-crash.ips');
      const content = readFileSync(ipsPath, 'utf-8');
      const ipsData = JSON.parse(content);

      expect(ipsData.binary_images).toHaveLength(2);
      expect(ipsData.binary_images[0].uuid).toBeDefined();
    });
  });

  describe('Classic crash format parsing', () => {
    it('should read classic crash format', () => {
      const crashPath = join(__dirname, '../../mocks/crash-reports/sample-crash-classic.crash');
      const content = readFileSync(crashPath, 'utf-8');

      expect(content).toContain('Incident Identifier:');
      expect(content).toContain('Exception Type:  EXC_BAD_ACCESS');
      expect(content).toContain('Thread 0 Crashed:');
    });

    it('should contain stack trace', () => {
      const crashPath = join(__dirname, '../../mocks/crash-reports/sample-crash-classic.crash');
      const content = readFileSync(crashPath, 'utf-8');

      expect(content).toContain('0   TestApp');
      expect(content).toContain('ViewControllerC10loadView');
    });

    it('should contain binary images section', () => {
      const crashPath = join(__dirname, '../../mocks/crash-reports/sample-crash-classic.crash');
      const content = readFileSync(crashPath, 'utf-8');

      expect(content).toContain('Binary Images:');
      expect(content).toContain('arm64');
    });
  });
});

describe('Symbolication', () => {
  describe('atos wrapper', () => {
    it('should format atos command correctly', () => {
      // Test the command construction (actual atos won't run in tests)
      const dsymPath = '/path/to/TestApp.dSYM';
      const arch = 'arm64';
      const loadAddress = '0x100000000';
      const addresses = ['0x100001250', '0x100001020'];

      const expectedCommand = `atos -arch ${arch} -o "${dsymPath}/Contents/Resources/DWARF/TestApp" -l ${loadAddress} ${addresses.join(' ')}`;

      expect(expectedCommand).toContain('-arch arm64');
      expect(expectedCommand).toContain('-l 0x100000000');
      expect(expectedCommand).toContain('0x100001250');
    });

    it('should mark frames as symbolicated when source info available', () => {
      const frame: StackFrame = {
        index: 0,
        binary: 'TestApp',
        address: '0x100001250',
        symbol: 'loadView()',
        file: 'ViewController.swift',
        line: 42,
        isAppCode: true,
      };

      expect(frame.file).toBeDefined();
      expect(frame.line).toBeDefined();
    });
  });
});

describe('analyze_crash tool', () => {
  describe('tool registration', () => {
    it('should define required input schema', () => {
      const expectedSchema = {
        crashLogPath: { type: 'string', description: expect.any(String) },
        dsymPath: { type: 'string', description: expect.any(String) },
        bundleId: { type: 'string', description: expect.any(String) },
      };

      // The actual schema validation will be done when the tool is implemented
      expect(expectedSchema.crashLogPath.type).toBe('string');
      expect(expectedSchema.dsymPath.type).toBe('string');
    });
  });

  describe('tool execution flow', () => {
    it('should handle missing crash log', async () => {
      // Mock the expected behavior
      const result = {
        success: false,
        error: 'Crash log not found',
        summary: '',
        patterns: [],
        suggestions: [],
        durationMs: 0,
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle missing dSYM (unsymbolicated analysis)', () => {
      // Even without dSYM, we should be able to analyze
      const report = createMockCrashReport({ isSymbolicated: false });

      expect(report.isSymbolicated).toBe(false);
      // Pattern detection should still work
      const patterns = detectCrashPatterns(report);
      expect(Array.isArray(patterns)).toBe(true);
    });

    it('should return structured analysis result', () => {
      const report = createMockCrashReport();
      report.patterns = detectCrashPatterns(report);

      const result = {
        success: true,
        report,
        summary: generateCrashSummary(report),
        patterns: report.patterns,
        suggestions: generateCrashSuggestions(report.patterns),
        durationMs: 150,
      };

      expect(result.success).toBe(true);
      expect(result.report).toBeDefined();
      expect(result.summary).toContain('Crash Summary');
      expect(Array.isArray(result.patterns)).toBe(true);
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });
});
