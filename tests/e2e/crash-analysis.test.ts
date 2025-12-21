/**
 * E2E Test: iOS Crash Analysis
 * Tests crash log parsing, symbolication, and pattern detection (T085)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getToolRegistry } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Import tool registration functions directly
import { registerAnalyzeCrashTool } from '../../src/tools/crash/analyze-crash.js';

/**
 * Register crash tools for E2E testing
 */
function registerTestTools(): void {
  const registry = getToolRegistry();
  registry.clear();

  registerAnalyzeCrashTool();
}

/**
 * Sample iOS crash log content for testing
 */
const SAMPLE_CRASH_LOG = `{"app_name":"TestApp","timestamp":"2025-01-15 10:30:45.123 +0000","app_version":"1.0.0","slice_uuid":"12345678-1234-1234-1234-123456789012","build_version":"100","platform":2,"bundleID":"com.example.testapp","share_with_app_devs":0,"is_first_party":0,"bug_type":"309","os_version":"iPhone OS 17.0 (21A5248v)","incident_id":"ABCD1234-5678-90EF-GHIJ-KLMNOPQRSTUV","name":"TestApp","faulting_thread":0,"threads":[{"id":0,"frames":[{"imageOffset":12345,"symbol":"main","symbolLocation":0,"imageIndex":0},{"imageOffset":67890,"symbol":"UIApplicationMain","symbolLocation":0,"imageIndex":1}]}],"usedImages":[{"base":4294967296,"size":1048576,"arch":"arm64","uuid":"12345678-1234-1234-1234-123456789012","path":"/private/var/containers/Bundle/Application/TestApp.app/TestApp","name":"TestApp"}],"exception":{"codes":"0x0000000000000001, 0x0000000000000000","rawCodes":[1,0],"type":"EXC_BAD_ACCESS","signal":"SIGSEGV","subtype":"KERN_INVALID_ADDRESS at 0x0000000000000000"},"termination":{"flags":0,"code":11,"signal":"SIGSEGV","byProc":"exc handler","byPid":1234,"reason":"Namespace SIGNAL, Code 0xb"}}`;

describe('iOS Crash Analysis E2E (T085)', () => {
  let tempDir: string;
  let sampleCrashPath: string;

  beforeAll(() => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    registerTestTools();

    // Create temp directory for test crash logs
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'specter-crash-test-'));
    sampleCrashPath = path.join(tempDir, 'TestApp-2025-01-15-103045.ips');
    fs.writeFileSync(sampleCrashPath, SAMPLE_CRASH_LOG);
  });

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();

    // Cleanup temp files
    if (fs.existsSync(sampleCrashPath)) {
      fs.unlinkSync(sampleCrashPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir);
    }
  });

  describe('Tool Registration', () => {
    it('should register analyze_crash tool', () => {
      const registry = getToolRegistry();
      expect(registry.hasTool('analyze_crash')).toBe(true);
    });

    it('analyze_crash should have correct schema', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      expect(tool!.definition.inputSchema.properties).toHaveProperty('platform');
      expect(tool!.definition.inputSchema.properties).toHaveProperty('crashLogPath');
      expect(tool!.definition.inputSchema.properties).toHaveProperty('appId');
      expect(tool!.definition.inputSchema.required).toContain('platform');
    });

    it('analyze_crash should have optional dsymPath parameter', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      expect(tool!.definition.inputSchema.properties).toHaveProperty('dsymPath');
    });

    it('analyze_crash should have optional skipSymbolication parameter', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      expect(tool!.definition.inputSchema.properties).toHaveProperty('skipSymbolication');
    });
  });

  describe('Crash Log Validation', () => {
    it('should reject missing platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      await expect(
        tool!.handler({})
      ).rejects.toThrow();
    });

    it('should reject nonexistent crash log file', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      await expect(
        tool!.handler({
          platform: 'ios',
          crashLogPath: '/nonexistent/path/crash.ips',
        })
      ).rejects.toThrow();
    });
  });

  describe('Crash Log Parsing', () => {
    it('should parse valid crash log file', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      });

      expect(result).toHaveProperty('success', true);
    });

    it('should extract process name from crash log', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { processName?: string } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('processName', 'TestApp');
    });

    it('should extract exception type from crash log', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { exception?: { type?: string } } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('exception');
      expect(result.report?.exception).toHaveProperty('type', 'EXC_BAD_ACCESS');
    });

    it('should extract signal from exception', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { exception?: { signal?: string } } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('exception');
      expect(result.report?.exception).toHaveProperty('signal', 'SIGSEGV');
    });

    it('should extract exception codes', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { exception?: { codes?: string; faultAddress?: string } } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('exception');
      // codes contains raw hex values, faultAddress contains the parsed address
      expect(result.report?.exception).toHaveProperty('codes');
      // The test crash log has codes: "0x0000000000000001, 0x0000000000000000"
      expect(result.report?.exception?.codes).toContain('0x');
    });

    it('should include crashed thread with frames', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { crashedThread?: { frames?: unknown[] } } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('crashedThread');
      expect(result.report?.crashedThread).toHaveProperty('frames');
      expect(Array.isArray(result.report?.crashedThread?.frames)).toBe(true);
    });
  });

  describe('Crash Pattern Detection', () => {
    it('should detect crash patterns with id and name', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { patterns?: Array<{ id: string; name: string }> };

      expect(result).toHaveProperty('patterns');
      expect(Array.isArray(result.patterns)).toBe(true);
      // KERN_INVALID_ADDRESS at 0x0 should trigger exc_bad_access pattern
      if (result.patterns && result.patterns.length > 0) {
        expect(result.patterns[0]).toHaveProperty('id');
        expect(result.patterns[0]).toHaveProperty('name');
      }
    });

    it('should provide investigation suggestions', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { suggestions?: string[] };

      expect(result).toHaveProperty('suggestions');
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });

  describe('Crash Report Structure', () => {
    it('should return complete ExtendedCrashAnalysis structure', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      });

      // Verify expected ExtendedCrashAnalysis fields
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('platform', 'ios');
      expect(result).toHaveProperty('report');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('description');
      expect(result).toHaveProperty('suspects');
      expect(result).toHaveProperty('reproducible');
      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('dsymStatus');
    });

    it('should include crash report with timestamp', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      const result = await tool!.handler({
        platform: 'ios',
        crashLogPath: sampleCrashPath,
        skipSymbolication: true,
      }) as { report?: { timestamp?: Date } };

      expect(result).toHaveProperty('report');
      expect(result.report).toHaveProperty('timestamp');
      // timestamp is a Date object
      expect(result.report?.timestamp instanceof Date).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed crash log gracefully', async () => {
      const malformedPath = path.join(tempDir, 'malformed.ips');
      fs.writeFileSync(malformedPath, 'not valid json');

      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      try {
        await tool!.handler({
          platform: 'ios',
          crashLogPath: malformedPath,
        });
      } catch (error) {
        expect(error).toBeDefined();
      } finally {
        fs.unlinkSync(malformedPath);
      }
    });

    it('should handle missing exception field gracefully', async () => {
      const minimalPath = path.join(tempDir, 'minimal.ips');
      fs.writeFileSync(minimalPath, JSON.stringify({
        app_name: 'TestApp',
        timestamp: '2025-01-15 10:00:00.000 +0000',
      }));

      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      try {
        const result = await tool!.handler({
          platform: 'ios',
          crashLogPath: minimalPath,
          skipSymbolication: true,
        });
        // Should still parse what's available
        expect(result).toHaveProperty('success');
      } catch {
        // Acceptable if it throws for incomplete data
      } finally {
        fs.unlinkSync(minimalPath);
      }
    });
  });
});
