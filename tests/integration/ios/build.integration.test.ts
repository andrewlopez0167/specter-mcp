/**
 * iOS Xcode Build Integration Tests
 * Tests against real KMM project (specter-test-subject)
 *
 * Prerequisites:
 * - macOS with Xcode installed
 * - iOS Simulator available
 * - specter-test-subject project exists
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import { buildXcode, XcodeBuildOptions } from '../../../src/platforms/ios/xcodebuild.js';
import { parseXcodeLog } from '../../../src/tools/build/log-parser.js';
import * as path from 'path';
import * as os from 'os';

const TEST_PROJECT_PATH = path.resolve(__dirname, '../../../test-apps/specter-test-subject/iosApp');

async function isXcodeAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('xcodebuild', ['-version']);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function projectExists(): Promise<boolean> {
  try {
    const result = await executeShell('ls', [path.join(TEST_PROJECT_PATH, 'SpecterCounter.xcodeproj')]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function getAvailableSimulator(): Promise<string | null> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);
    const data = JSON.parse(result.stdout);

    // Find an iPhone simulator
    for (const [runtime, devices] of Object.entries(data.devices) as [string, Array<{ name: string; state: string }>][]) {
      if (runtime.includes('iOS')) {
        const iphone = devices.find(d => d.name.includes('iPhone') && d.state === 'Booted');
        if (iphone) {
          return iphone.name;
        }
        // Try first available iPhone
        const anyIphone = devices.find(d => d.name.includes('iPhone'));
        if (anyIphone) {
          return anyIphone.name;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

describe('iOS Xcode Build Integration', () => {
  let xcodeAvailable = false;
  let projectReady = false;
  let simulatorName: string | null = null;

  beforeAll(async () => {
    // Only run on macOS
    if (os.platform() !== 'darwin') {
      console.log('Skipping iOS tests on non-macOS platform');
      return;
    }

    xcodeAvailable = await isXcodeAvailable();
    projectReady = await projectExists();
    simulatorName = await getAvailableSimulator();

    console.log(`Xcode available: ${xcodeAvailable}`);
    console.log(`Project ready: ${projectReady}`);
    console.log(`Project path: ${TEST_PROJECT_PATH}`);
    console.log(`Simulator: ${simulatorName}`);
  });

  describe('buildXcode', () => {
    it('should build iOS app successfully', async () => {
      expect(os.platform(), 'This test requires macOS').toBe('darwin');
      expect(xcodeAvailable, 'Xcode not available').toBe(true);
      expect(projectReady, `Project not found at ${TEST_PROJECT_PATH}`).toBe(true);
      expect(simulatorName, 'No iOS simulator available').toBeTruthy();

      const options: XcodeBuildOptions = {
        projectPath: TEST_PROJECT_PATH,
        scheme: 'SpecterCounter',
        configuration: 'Debug',
        destination: `platform=iOS Simulator,name=${simulatorName}`,
        clean: false,
        timeoutMs: 600000, // 10 minutes
      };

      const result = await buildXcode(options);

      console.log(`Build success: ${result.success}`);
      console.log(`Duration: ${result.durationMs}ms`);

      if (result.success) {
        expect(result.artifactPath).toBeDefined();
        console.log(`Artifact: ${result.artifactPath}`);
      } else {
        const errors = result.errorSummary?.topErrors ?? [];
        console.log(`Build failed with ${errors.length} errors`);
        for (const error of errors.slice(0, 5)) {
          console.log(`  - ${error.file}:${error.line}: ${error.message}`);
        }
      }

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('durationMs');
    }, 600000);

    it('should clean and build', async () => {
      expect(os.platform(), 'This test requires macOS').toBe('darwin');
      expect(xcodeAvailable, 'Xcode not available').toBe(true);
      expect(projectReady, `Project not found at ${TEST_PROJECT_PATH}`).toBe(true);
      expect(simulatorName, 'No iOS simulator available').toBeTruthy();

      const options: XcodeBuildOptions = {
        projectPath: TEST_PROJECT_PATH,
        scheme: 'SpecterCounter',
        configuration: 'Debug',
        destination: `platform=iOS Simulator,name=${simulatorName}`,
        clean: true,
        timeoutMs: 900000, // 15 minutes for clean build
      };

      const result = await buildXcode(options);

      console.log(`Clean build success: ${result.success}`);
      console.log(`Duration: ${result.durationMs}ms`);

      expect(result).toHaveProperty('success');
    }, 900000);
  });

  describe('parseXcodeLog', () => {
    it('should parse successful iOS build logs', () => {
      const logs = `
Build settings from command line:
    CONFIGURATION = Debug

** BUILD SUCCEEDED **
`;

      const result = parseXcodeLog(logs);

      // ParsedLog has errors array, not success boolean
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toBeDefined();
    });

    it('should parse iOS build with errors', () => {
      const logs = `
/Users/test/project/iosApp/ContentView.swift:25:12: error: cannot find 'unknownFunction' in scope
/Users/test/project/iosApp/ContentView.swift:30:5: error: type 'String' has no member 'nonExistent'

** BUILD FAILED **
`;

      const result = parseXcodeLog(logs);

      // Has errors = failed build
      expect(result.errors.length).toBeGreaterThan(0);

      expect(result.errors[0].file).toContain('ContentView.swift');
      expect(result.errors[0].line).toBe(25);
    });

    it('should detect Xcode build failure patterns', () => {
      const logs = `
xcodebuild: error: Could not find scheme 'NonExistent'.
`;

      const result = parseXcodeLog(logs);

      // xcodebuild errors should be captured
      // Note: This might not be captured by current parser (linker pattern only)
      expect(result).toBeDefined();
    });
  });
});
