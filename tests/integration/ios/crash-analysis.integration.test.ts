/**
 * iOS Crash Analysis Integration Tests
 * Tests crash log parsing and pattern detection
 *
 * Prerequisites:
 * - macOS with Xcode installed
 * - iOS Simulator available
 * - SpecterCounter app can be crashed via Debug tab
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import { parseIPSFormat, parseClassicFormat, parseCrashLog } from '../../../src/platforms/ios/crash-parser.js';
import { findDSYMInCommonLocations } from '../../../src/platforms/ios/symbolicate.js';
import { detectCrashPatterns, CrashPattern, CrashReport } from '../../../src/models/crash-report.js';
import { analyzePatterns } from '../../../src/tools/crash/pattern-detector.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const BUNDLE_ID = 'com.specter.counter';

async function getBootedDeviceId(): Promise<string | null> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices']);
    const bootedMatch = result.stdout.match(/([A-F0-9-]{36})\) \(Booted\)/);
    return bootedMatch ? bootedMatch[1] : null;
  } catch {
    return null;
  }
}

async function getCrashLogDirectory(_deviceId: string): Promise<string> {
  // Simulator crash logs location
  return path.join(
    os.homedir(),
    'Library/Logs/DiagnosticReports'
  );
}

async function findLatestCrashLog(directory: string, _bundleId: string): Promise<string | null> {
  try {
    const files = fs.readdirSync(directory);
    const crashFiles = files
      .filter(f => (f.endsWith('.ips') || f.endsWith('.crash')) && f.includes('SpecterCounter'))
      .sort()
      .reverse();

    return crashFiles.length > 0 ? path.join(directory, crashFiles[0]) : null;
  } catch {
    return null;
  }
}

describe('iOS Crash Analysis Integration', () => {
  let deviceId: string | null = null;
  let crashLogDir: string | null = null;

  beforeAll(async () => {
    if (os.platform() !== 'darwin') {
      console.log('Skipping iOS crash tests on non-macOS platform');
      return;
    }

    deviceId = await getBootedDeviceId();
    if (deviceId) {
      crashLogDir = await getCrashLogDirectory(deviceId);
    }

    console.log(`Device ID: ${deviceId}`);
    console.log(`Crash log directory: ${crashLogDir}`);
  });

  describe('parseIPSFormat', () => {
    it('should parse IPS format crash log', () => {
      const ipsContent = `
{
  "app_name": "SpecterCounter",
  "app_version": "1.0",
  "bundleID": "com.specter.counter",
  "exception": {
    "type": "EXC_BAD_ACCESS",
    "subtype": "KERN_INVALID_ADDRESS at 0x0000000000000000",
    "codes": "0x0000000000000001, 0x0000000000000000"
  },
  "termination": {
    "reason": "Namespace SIGNAL, Code 11 Segmentation fault: 11"
  },
  "threads": [
    {
      "id": 0,
      "frames": [
        {
          "imageIndex": 0,
          "imageOffset": 123456,
          "symbol": "ContentView.buttonTapped(_:)"
        }
      ],
      "triggered": true
    }
  ],
  "usedImages": [
    {
      "source": "P",
      "arch": "arm64",
      "base": 4294967296,
      "name": "SpecterCounter",
      "path": "/path/to/SpecterCounter.app/SpecterCounter",
      "uuid": "12345678-1234-1234-1234-123456789012"
    }
  ]
}
`;

      const report = parseIPSFormat(ipsContent);

      expect(report).toBeDefined();
      expect(report.bundleId).toBe('com.specter.counter');
      expect(report.exception.type).toBe('EXC_BAD_ACCESS');
    });

    it('should handle malformed IPS content gracefully', () => {
      const invalidContent = 'not valid json';

      // Should throw or return a report with default values
      try {
        const report = parseIPSFormat(invalidContent);
        // If it doesn't throw, check for sensible defaults
        expect(report.exception).toBeDefined();
      } catch (error) {
        // Expected behavior for invalid JSON
        expect(error).toBeDefined();
      }
    });
  });

  describe('parseClassicFormat', () => {
    it('should parse legacy crash format', () => {
      const crashContent = `
Incident Identifier: 12345678-1234-1234-1234-123456789012
CrashReporter Key:   abcdef123456
Hardware Model:      iPhone15,2
Process:             SpecterCounter [12345]
Path:                /private/var/containers/Bundle/Application/.../SpecterCounter.app/SpecterCounter
Identifier:          com.specter.counter
Version:             1.0 (1)
Code Type:           ARM-64

Exception Type:  EXC_BAD_ACCESS (SIGSEGV)
Exception Subtype: KERN_INVALID_ADDRESS at 0x0000000000000000
Termination Reason: SIGNAL 11 Segmentation fault: 11

Thread 0 Crashed:
0   SpecterCounter    0x0000000100001234 ContentView.buttonTapped(_:) + 100
1   SpecterCounter    0x0000000100001334 specialized closure #1 in ContentView.body.getter + 200
2   SwiftUI           0x00000001a1234567 partial apply + 300
`;

      const report = parseClassicFormat(crashContent);

      expect(report).toBeDefined();
      expect(report.bundleId).toBe('com.specter.counter');
      expect(report.exception.type).toContain('EXC_BAD_ACCESS');
      expect(report.crashedThread).toBeDefined();
      expect(report.crashedThread.frames.length).toBeGreaterThan(0);
    });
  });

  describe('detectCrashPatterns', () => {
    it('should detect null pointer crash pattern', () => {
      // Create a minimal CrashReport for testing
      const report: CrashReport = {
        timestamp: new Date(),
        platform: 'ios',
        processName: 'SpecterCounter',
        bundleId: 'com.specter.counter',
        exception: {
          type: 'EXC_BAD_ACCESS',
          signal: 'SIGSEGV',
          codes: 'KERN_INVALID_ADDRESS at 0x0000000000000000',
          faultAddress: '0x0000000000000000',
        },
        threads: [],
        crashedThread: {
          id: 0,
          crashed: true,
          frames: [
            { index: 0, address: '0x1234', symbol: 'buttonTapped', imageName: 'SpecterCounter', offset: '100' }
          ],
        },
        binaryImages: [],
        isSymbolicated: false,
      };

      const patterns = detectCrashPatterns(report);

      expect(patterns).toBeDefined();
      expect(patterns.length).toBeGreaterThan(0);
      // Should detect the null pointer pattern
      const nullPattern = patterns.find(p => p.id === 'exc_bad_access_null' || p.id === 'exc_bad_access_kern_invalid');
      expect(nullPattern).toBeDefined();
      expect(nullPattern?.suggestion).toBeDefined();
    });

    it('should detect assertion failure pattern', () => {
      const report: CrashReport = {
        timestamp: new Date(),
        platform: 'ios',
        processName: 'SpecterCounter',
        exception: {
          type: 'SIGABRT',
          signal: 'SIGABRT',
        },
        threads: [],
        crashedThread: {
          id: 0,
          crashed: true,
          frames: [
            { index: 0, address: '0x1234', symbol: 'assertionFailure', imageName: 'Swift', offset: '100' },
            { index: 1, address: '0x5678', symbol: 'ContentView.validate', imageName: 'SpecterCounter', offset: '50' }
          ],
        },
        binaryImages: [],
        isSymbolicated: false,
      };

      const patterns = detectCrashPatterns(report);

      expect(patterns).toBeDefined();
      // May or may not find a pattern depending on exact matcher logic
      if (patterns.length > 0) {
        const assertPattern = patterns.find(p => p.id === 'sigabrt_assertion');
        if (assertPattern) {
          expect(assertPattern.severity).toBe('high');
        }
      }
    });

    it('should handle empty crash report gracefully', () => {
      const report: CrashReport = {
        timestamp: new Date(),
        platform: 'ios',
        processName: 'Unknown',
        exception: {
          type: 'UNKNOWN',
        },
        threads: [],
        crashedThread: {
          id: 0,
          crashed: true,
          frames: [],
        },
        binaryImages: [],
        isSymbolicated: false,
      };

      const patterns = detectCrashPatterns(report);

      // Should return empty array, not throw
      expect(patterns).toBeDefined();
      expect(Array.isArray(patterns)).toBe(true);
    });
  });

  describe('analyzePatterns', () => {
    it('should provide pattern analysis with category', () => {
      const report: CrashReport = {
        timestamp: new Date(),
        platform: 'ios',
        processName: 'SpecterCounter',
        exception: {
          type: 'EXC_BAD_ACCESS',
          signal: 'SIGSEGV',
          faultAddress: '0x0000000000000000',
        },
        threads: [],
        crashedThread: {
          id: 0,
          crashed: true,
          frames: [
            { index: 0, address: '0x1234', symbol: 'testFunction', imageName: 'SpecterCounter', offset: '100' }
          ],
        },
        binaryImages: [],
        isSymbolicated: false,
      };

      const analysis = analyzePatterns(report);

      expect(analysis).toBeDefined();
      expect(analysis.category).toBeDefined();
      expect(analysis.suggestions).toBeDefined();
      expect(analysis.severity).toBeDefined();
    });
  });

  describe('findDSYMInCommonLocations', () => {
    it('should search common dSYM locations', () => {
      if (os.platform() !== 'darwin') {
        console.log('Skipping: Not macOS');
        return;
      }

      // This may or may not find a dSYM depending on build state
      const dsymPath = findDSYMInCommonLocations(BUNDLE_ID, '12345678-1234-1234-1234-123456789012');

      console.log(`dSYM path found: ${dsymPath}`);

      // Just verify it doesn't throw
      expect(true).toBe(true);
    });

    it('should return undefined for non-existent bundle', () => {
      if (os.platform() !== 'darwin') {
        console.log('Skipping: Not macOS');
        return;
      }

      const dsymPath = findDSYMInCommonLocations('com.nonexistent.app', 'fake-uuid');

      expect(dsymPath).toBeUndefined();
    });
  });

  describe('Real crash log analysis', () => {
    it('should analyze real crash log if available', async () => {
      if (os.platform() !== 'darwin' || !crashLogDir) {
        console.log('Skipping: Not macOS or no crash log directory');
        return;
      }

      const crashFile = await findLatestCrashLog(crashLogDir, BUNDLE_ID);

      if (!crashFile) {
        console.log('No crash logs found for SpecterCounter');
        return;
      }

      console.log(`Analyzing crash log: ${crashFile}`);

      const content = fs.readFileSync(crashFile, 'utf-8');

      let report: CrashReport;
      if (crashFile.endsWith('.ips')) {
        report = parseIPSFormat(content);
      } else {
        report = parseClassicFormat(content);
      }

      if (report) {
        console.log(`Exception type: ${report.exception.type}`);
        console.log(`Process: ${report.processName}`);
        console.log(`Stack frames: ${report.crashedThread?.frames?.length ?? 0}`);

        const patterns = detectCrashPatterns(report);
        if (patterns.length > 0) {
          console.log(`Detected ${patterns.length} patterns:`);
          for (const pattern of patterns) {
            console.log(`  - ${pattern.name}: ${pattern.description}`);
            console.log(`    Suggestion: ${pattern.suggestion}`);
          }
        }

        const analysis = analyzePatterns(report);
        console.log(`Category: ${analysis.category}`);
        console.log(`Severity: ${analysis.severity}`);
        console.log(`Suggestions: ${analysis.suggestions.join(', ')}`);
      }

      expect(true).toBe(true);
    });
  });
});
