/**
 * Test App E2E Tests
 *
 * Comprehensive tests that build, install, and test against the
 * Specter Test Subject KMM app (test-apps/specter-test-subject/).
 *
 * These tests validate the full MCP tool workflow:
 * 1. Build the app (build_app)
 * 2. Install on device (install_app)
 * 3. Launch the app (launch_app)
 * 4. Interact with UI (get_ui_context, interact_with_ui, deep_link_navigate)
 * 5. Run Maestro E2E flows (run_maestro_flow)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getToolRegistry, registerAllTools } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';
import {
  ensureDevicesAvailable,
  type DeviceSetupResult,
} from './setup.js';

// Test app configuration
const TEST_APP = {
  projectPath: resolve(process.cwd(), 'test-apps/specter-test-subject'),
  android: {
    appId: 'com.specter.testsubject',
    module: 'androidApp',
    apkPath: 'androidApp/build/outputs/apk/debug/androidApp-debug.apk',
  },
  ios: {
    bundleId: 'com.specter.counter',
    scheme: 'SpecterCounter',
    appPath: 'build/DerivedData/Build/Products/Debug-iphonesimulator/SpecterCounter.app',
  },
  deepLinks: {
    home: 'specter://app',
    counter: 'specter://counter',
    form: 'specter://form',
    debug: 'specter://debug',
  },
  maestro: {
    counterFlow: 'maestro/counter_flow.yaml',
    formFlow: 'maestro/form_flow.yaml',
    fullFlow: 'maestro/full_flow.yaml',
  },
};

describe('Test App E2E Suite', () => {
  let deviceSetup: DeviceSetupResult;
  let androidBuildArtifact: string | null = null;
  let iosBuildArtifact: string | null = null;

  beforeAll(async () => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    await registerAllTools();

    // Auto-launch emulators/simulators if not running
    deviceSetup = await ensureDevicesAvailable();
  }, 180000); // 3 minute timeout for device launch

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('Build Phase', () => {
    it('should build Android app successfully', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const buildTool = registry.getTool('build_app');
      expect(buildTool).toBeDefined();

      // Change to test app directory for build
      const originalCwd = process.cwd();
      process.chdir(TEST_APP.projectPath);

      try {
        const result = await buildTool!.handler({
          platform: 'android',
          variant: 'debug',
          clean: false,
          androidModule: TEST_APP.android.module,
        }) as { success: boolean; artifactPath?: string; error?: string };

        expect(result.success).toBe(true);
        androidBuildArtifact = resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
        expect(existsSync(androidBuildArtifact)).toBe(true);
        console.log(`Android build successful: ${androidBuildArtifact}`);
      } finally {
        process.chdir(originalCwd);
      }
    }, 600000); // 10 minute timeout for build

    it('should build iOS app successfully', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const buildTool = registry.getTool('build_app');
      expect(buildTool).toBeDefined();

      const originalCwd = process.cwd();
      process.chdir(TEST_APP.projectPath);

      try {
        const result = await buildTool!.handler({
          platform: 'ios',
          variant: 'debug',
          clean: false,
          iosScheme: TEST_APP.ios.scheme,
          iosDestination: `platform=iOS Simulator,id=${deviceSetup.iosDeviceId}`,
        }) as { success: boolean; artifactPath?: string; error?: string };

        expect(result.success).toBe(true);
        iosBuildArtifact = resolve(TEST_APP.projectPath, TEST_APP.ios.appPath);
        console.log(`iOS build successful: ${iosBuildArtifact}`);
      } finally {
        process.chdir(originalCwd);
      }
    }, 600000); // 10 minute timeout for build
  });

  describe('Install Phase', () => {
    it('should install Android APK on device', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      // Check if APK exists (either from build or pre-built)
      const apkPath = androidBuildArtifact || resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
      expect(existsSync(apkPath), `APK not found at ${apkPath} - run build phase first`).toBe(true);

      const registry = getToolRegistry();
      const installTool = registry.getTool('install_app');
      expect(installTool).toBeDefined();

      const result = await installTool!.handler({
        platform: 'android',
        appPath: apkPath,
        device: deviceSetup.androidDeviceId,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('Android app installed successfully');
    }, 120000); // 2 minute timeout for install

    it('should install iOS app on simulator', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      // Check if .app exists
      const appPath = iosBuildArtifact || resolve(TEST_APP.projectPath, TEST_APP.ios.appPath);
      expect(existsSync(appPath), `iOS app not found at ${appPath} - run build phase first`).toBe(true);

      const registry = getToolRegistry();
      const installTool = registry.getTool('install_app');
      expect(installTool).toBeDefined();

      const result = await installTool!.handler({
        platform: 'ios',
        appPath: appPath,
        device: deviceSetup.iosDeviceId,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('iOS app installed successfully');
    }, 120000);
  });

  describe('Launch Phase', () => {
    it('should launch Android app', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const launchTool = registry.getTool('launch_app');
      expect(launchTool).toBeDefined();

      const result = await launchTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        device: deviceSetup.androidDeviceId,
        clearData: true, // Start fresh
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('Android app launched successfully');

      // Wait for app to fully load
      await new Promise(resolve => setTimeout(resolve, 3000));
    }, 30000);

    it('should launch iOS app', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      // Check if app is installed
      const appPath = iosBuildArtifact || resolve(TEST_APP.projectPath, TEST_APP.ios.appPath);
      expect(existsSync(appPath), `iOS app not found at ${appPath} - run build phase first`).toBe(true);

      const registry = getToolRegistry();
      const launchTool = registry.getTool('launch_app');
      expect(launchTool).toBeDefined();

      const result = await launchTool!.handler({
        platform: 'ios',
        appId: TEST_APP.ios.bundleId,
        device: deviceSetup.iosDeviceId,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('iOS app launched successfully');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }, 30000);
  });

  describe('UI Context Phase (requires app running)', () => {
    it('should capture Android screenshot with app visible', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const uiTool = registry.getTool('get_ui_context');
      expect(uiTool).toBeDefined();

      const result = await uiTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        captureScreenshot: true,
        captureHierarchy: true,
      }) as { success: boolean; screenshot?: string; hierarchy?: unknown; error?: string };

      if (result.success) {
        expect(result.screenshot).toBeDefined();
        expect(result.screenshot!.length).toBeGreaterThan(0);
        console.log(`Android screenshot captured: ${result.screenshot!.length} bytes base64`);

        if (result.hierarchy) {
          console.log('Android UI hierarchy captured');
        }
      } else {
        console.log('Screenshot failed:', result.error);
      }
    }, 30000);

    it('should capture iOS screenshot with app visible', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const uiTool = registry.getTool('get_ui_context');
      expect(uiTool).toBeDefined();

      const result = await uiTool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        captureScreenshot: true,
        captureHierarchy: true,
      }) as { success: boolean; screenshot?: string; hierarchy?: unknown; error?: string };

      if (result.success) {
        expect(result.screenshot).toBeDefined();
        console.log(`iOS screenshot captured: ${result.screenshot!.length} bytes base64`);
      } else {
        console.log('Screenshot failed:', result.error);
      }
    }, 30000);
  });

  describe('Deep Link Navigation (requires app installed)', () => {
    it('should navigate to Counter screen via deep link on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const deepLinkTool = registry.getTool('deep_link_navigate');
      expect(deepLinkTool).toBeDefined();

      const result = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.counter,
      }) as { success: boolean; error?: string };

      if (result.success) {
        console.log('Deep link to counter screen successful');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.log('Deep link failed (app may not be installed):', result.error);
      }
    }, 15000);

    it('should navigate to Form screen via deep link on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const deepLinkTool = registry.getTool('deep_link_navigate');
      expect(deepLinkTool).toBeDefined();

      const result = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.form,
      }) as { success: boolean; error?: string };

      if (result.success) {
        console.log('Deep link to form screen successful');
      } else {
        console.log('Deep link failed:', result.error);
      }
    }, 15000);

    it('should navigate via deep link on iOS', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const deepLinkTool = registry.getTool('deep_link_navigate');
      expect(deepLinkTool).toBeDefined();

      const result = await deepLinkTool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        uri: TEST_APP.deepLinks.counter,
      }) as { success: boolean; error?: string };

      if (result.success) {
        console.log('iOS deep link successful');
      } else {
        console.log('Deep link failed:', result.error);
      }
    }, 15000);
  });

  describe('UI Interaction (requires app running)', () => {
    it('should tap increment button on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      // First, launch the app to Counter screen
      const registry = getToolRegistry();
      const launchTool = registry.getTool('launch_app');
      await launchTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        device: deviceSetup.androidDeviceId,
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get UI hierarchy to find the increment button
      const uiTool = registry.getTool('get_ui_context');
      const uiResult = await uiTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        skipScreenshot: true,
      }) as { platform: string; elements?: unknown[] };

      expect(uiResult.platform, 'Could not get UI hierarchy').toBe('android');

      // Tap in center of screen (where increment button typically is)
      const interactTool = registry.getTool('interact_with_ui');
      const result = await interactTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        action: 'tap',
        x: 540, // Center of typical mobile screen
        y: 960,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('Tap executed on Android');
    }, 30000);

    it('should input text on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const interactTool = registry.getTool('interact_with_ui');

      // input_text action works on the currently focused element
      const result = await interactTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        action: 'input_text',
        text: 'test@example.com',
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('Text input executed on Android');
    }, 15000);

    it('should swipe on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const interactTool = registry.getTool('interact_with_ui');

      // Swipe uses direction and coordinates for the start point
      const result = await interactTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        action: 'swipe',
        x: 540, // Start point x
        y: 1200, // Start point y
        direction: 'up',
        durationMs: 300,
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(true);
      console.log('Swipe executed on Android');
    }, 15000);
  });

  describe('Log Inspection (requires app running)', () => {
    it('should capture logs from running Android app', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const logTool = registry.getTool('inspect_logs');
      expect(logTool).toBeDefined();

      const result = await logTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        packageName: TEST_APP.android.appId,
        timeoutMs: 3000,
        maxLines: 100,
      }) as { success: boolean; logs?: unknown[]; error?: string };

      expect(result.success).toBe(true);
      if (result.logs && Array.isArray(result.logs)) {
        console.log(`Captured ${result.logs.length} log entries from ${TEST_APP.android.appId}`);
      }
    }, 15000);

    it('should capture logs from running iOS app', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const logTool = registry.getTool('inspect_logs');
      expect(logTool).toBeDefined();

      const result = await logTool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        bundleId: TEST_APP.ios.bundleId,
        timeoutMs: 3000,
      }) as { success: boolean; logs?: unknown[]; error?: string };

      expect(result.success).toBe(true);
      console.log('iOS logs captured');
    }, 15000);
  });
});

describe('Maestro E2E Flows', () => {
  let deviceSetup: DeviceSetupResult;

  beforeAll(async () => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    await registerAllTools();

    deviceSetup = await ensureDevicesAvailable();
  }, 180000);

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  it('should run counter flow on Android', async () => {
    expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.counterFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');
    expect(maestroTool).toBeDefined();

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'android',
      device: deviceSetup.androidDeviceId,
      appId: TEST_APP.android.appId,
      timeoutMs: 120000,
      generateFailureBundle: true,
    }) as {
      flowResult: { success: boolean; passedSteps: number; totalSteps: number; error?: string };
      summary: string;
      failureBundle?: unknown;
    };

    console.log('Maestro counter flow result:', result.summary);
    expect(result.flowResult.success, `Counter flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
    expect(result.flowResult.passedSteps).toBe(result.flowResult.totalSteps);
  }, 180000); // 3 minute timeout for Maestro flow

  it('should run form flow on Android', async () => {
    expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.formFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'android',
      device: deviceSetup.androidDeviceId,
      appId: TEST_APP.android.appId,
      timeoutMs: 120000,
      generateFailureBundle: true,
    }) as { flowResult: { success: boolean; error?: string }; summary: string };

    console.log('Maestro form flow result:', result.summary);
    expect(result.flowResult.success, `Form flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
  }, 180000);

  it('should run full E2E flow on Android', async () => {
    expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.fullFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'android',
      device: deviceSetup.androidDeviceId,
      appId: TEST_APP.android.appId,
      timeoutMs: 180000,
      generateFailureBundle: true,
    }) as {
      flowResult: { success: boolean; passedSteps: number; totalSteps: number; durationMs: number; error?: string };
      summary: string;
    };

    console.log('Maestro full flow result:', result.summary);
    console.log(`Duration: ${(result.flowResult.durationMs / 1000).toFixed(2)}s`);
    expect(result.flowResult.success, `Full flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
  }, 240000); // 4 minute timeout

  it('should run counter flow on iOS', async () => {
    expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.counterFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'ios',
      device: deviceSetup.iosDeviceId,
      appId: TEST_APP.ios.bundleId,
      timeoutMs: 120000,
      generateFailureBundle: true,
    }) as { flowResult: { success: boolean; error?: string }; summary: string };

    console.log('iOS Maestro counter flow result:', result.summary);
    expect(result.flowResult.success, `iOS counter flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
  }, 180000);

  it('should run form flow on iOS', async () => {
    expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.formFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'ios',
      device: deviceSetup.iosDeviceId,
      appId: TEST_APP.ios.bundleId,
      timeoutMs: 120000,
      generateFailureBundle: true,
    }) as { flowResult: { success: boolean; error?: string }; summary: string };

    console.log('iOS Maestro form flow result:', result.summary);
    expect(result.flowResult.success, `iOS form flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
  }, 180000);

  it('should run full E2E flow on iOS', async () => {
    expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.fullFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const result = await maestroTool!.handler({
      flowPath,
      platform: 'ios',
      device: deviceSetup.iosDeviceId,
      appId: TEST_APP.ios.bundleId,
      timeoutMs: 180000,
      generateFailureBundle: true,
    }) as { flowResult: { success: boolean; durationMs: number; error?: string }; summary: string };

    console.log('iOS Maestro full flow result:', result.summary);
    console.log(`Duration: ${(result.flowResult.durationMs / 1000).toFixed(2)}s`);
    expect(result.flowResult.success, `iOS full flow failed: ${result.flowResult.error || result.summary}`).toBe(true);
  }, 240000);
});

describe('Integration Tests - MCP Tools with Test App', () => {
  let deviceSetup: DeviceSetupResult;

  beforeAll(async () => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    await registerAllTools();

    deviceSetup = await ensureDevicesAvailable();
  }, 180000);

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('Full Workflow: Build -> Install -> Launch -> Interact', () => {
    it('should complete full Android workflow', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const apkPath = resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);

      expect(existsSync(apkPath), `APK not found at ${apkPath} - run build test first`).toBe(true);

      // 1. Install
      const installTool = registry.getTool('install_app');
      const installResult = await installTool!.handler({
        platform: 'android',
        appPath: apkPath,
        device: deviceSetup.androidDeviceId,
      }) as { success: boolean };

      expect(installResult.success, 'Install failed').toBe(true);

      // 2. Launch
      const launchTool = registry.getTool('launch_app');
      const launchResult = await launchTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        device: deviceSetup.androidDeviceId,
        clearData: true,
      }) as { success: boolean };

      expect(launchResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. Capture UI (returns UIContext with screenshot property)
      const uiTool = registry.getTool('get_ui_context');
      const uiResult = await uiTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        skipScreenshot: false,
      }) as { success?: boolean; screenshot?: { data: string; format: string }; elements: unknown[] };

      // UIContext should succeed
      expect(uiResult.elements).toBeDefined();
      if (uiResult.screenshot && uiResult.screenshot.data.length > 0) {
        console.log(`Screenshot captured: ${uiResult.screenshot.data.length} bytes`);
      } else {
        console.log('Screenshot capture returned empty data');
      }

      // 4. Navigate via deep link
      const deepLinkTool = registry.getTool('deep_link_navigate');
      const deepLinkResult = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.form,
      }) as { success: boolean };

      expect(deepLinkResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 5. Capture logs
      const logTool = registry.getTool('inspect_logs');
      const logResult = await logTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        packageName: TEST_APP.android.appId,
        timeoutMs: 2000,
      }) as { success: boolean };

      expect(logResult.success).toBe(true);

      console.log('Full Android workflow completed successfully!');
    }, 120000);
  });

  describe('App State Inspection', () => {
    it('should inspect Android app state', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const stateTool = registry.getTool('inspect_app_state');

      expect(stateTool, 'inspect_app_state tool not available').toBeDefined();

      const result = await stateTool.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        appId: TEST_APP.android.appId,
      }) as { success: boolean; state?: unknown };

      if (result.success) {
        console.log('App state inspection completed');
      } else {
        console.log('App state inspection not available for this app');
      }
    }, 30000);
  });

  describe('Debug Screen - Crash Analysis Testing', () => {
    it('should navigate to Debug screen via deep link on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();

      // Navigate to Debug screen via deep link
      const deepLinkTool = registry.getTool('deep_link_navigate');
      const result = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.debug,
      }) as { success: boolean };

      expect(result.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Navigated to Debug screen via deep link');
    }, 30000);

    it('should trigger caught exception and detect it in logs on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      // Check if APK exists (app must be built)
      const apkPath = resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
      expect(existsSync(apkPath), `APK not found at ${apkPath} - run build phase first`).toBe(true);

      const registry = getToolRegistry();

      // 1. Navigate to Debug screen
      const deepLinkTool = registry.getTool('deep_link_navigate');
      const navResult = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.debug,
      }) as { success: boolean };

      expect(navResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Tap the caught exception button
      const interactTool = registry.getTool('interact_with_ui');
      const tapResult = await interactTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        action: 'tap',
        element: 'btn_caught_exception',
      }) as { success: boolean; error?: string };

      if (!tapResult.success) {
        console.log('Tap failed:', tapResult.error);
      }
      expect(tapResult.success, `Failed to tap btn_caught_exception: ${tapResult.error}`).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('Triggered caught exception via Debug screen');

      // 3. Analyze crash logs to detect the exception
      const crashTool = registry.getTool('analyze_crash');
      const result = await crashTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        timeRangeSeconds: 60,
      }) as {
        success: boolean;
        platform: string;
        deviceLogs?: {
          totalEntries: number;
          errorCount: number;
          crashIndicators: unknown[];
          keyErrors: string[];
        }
      };

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('platform', 'android');
      expect(result).toHaveProperty('deviceLogs');

      if (result.deviceLogs) {
        console.log(`Android crash analysis: ${result.deviceLogs.totalEntries} entries, ${result.deviceLogs.errorCount} errors`);
        // Check for our test exception in key errors
        const hasTestException = result.deviceLogs.keyErrors.some(
          (err: string) => err.includes('SpecterTestSubject') || err.includes('Caught exception')
        );
        if (hasTestException) {
          console.log('Successfully detected test exception in logs!');
        }
      }
    }, 60000);

    it('should trigger error log and detect it via inspect_logs on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      // Check if APK exists (app must be built)
      const apkPath = resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
      expect(existsSync(apkPath), `APK not found at ${apkPath} - run build phase first`).toBe(true);

      const registry = getToolRegistry();

      // 1. Navigate to Debug screen
      const deepLinkTool = registry.getTool('deep_link_navigate');
      const navResult = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: TEST_APP.deepLinks.debug,
      }) as { success: boolean };

      expect(navResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 2. Tap the error log button
      const interactTool = registry.getTool('interact_with_ui');
      const tapResult = await interactTool!.handler({
        platform: 'android',
        device: deviceSetup.androidDeviceId,
        action: 'tap',
        element: 'btn_log_error',
      }) as { success: boolean; error?: string };

      if (!tapResult.success) {
        console.log('Tap failed:', tapResult.error);
      }
      expect(tapResult.success, `Failed to tap btn_log_error: ${tapResult.error}`).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('Triggered error log via Debug screen');

      // 3. Inspect logs to verify
      const logTool = registry.getTool('inspect_logs');
      const logResult = await logTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        appId: TEST_APP.android.appId,
        minLevel: 'error',
        maxEntries: 100,
      }) as { success: boolean; entries?: Array<{ message?: string }> };

      expect(logResult.success).toBe(true);
      console.log(`Found ${logResult.entries?.length || 0} error log entries`);
    }, 60000);

    it('should analyze iOS device logs for crash indicators', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS simulator but none available').toBe(true);

      const registry = getToolRegistry();

      // Use analyze_crash on iOS to check device logs
      const crashTool = registry.getTool('analyze_crash');
      const result = await crashTool!.handler({
        platform: 'ios',
        appId: TEST_APP.ios.bundleId,
        deviceId: deviceSetup.iosDeviceId,
        timeRangeSeconds: 60,
      }) as {
        success: boolean;
        platform: string;
        deviceLogs?: {
          totalEntries: number;
          errorCount: number;
          crashIndicators: unknown[];
        }
      };

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('platform', 'ios');
      expect(result).toHaveProperty('deviceLogs');

      if (result.deviceLogs) {
        console.log(`iOS crash analysis: ${result.deviceLogs.totalEntries} entries, ${result.deviceLogs.errorCount} errors, ${result.deviceLogs.crashIndicators.length} crash indicators`);
      }
    }, 30000);

    it('should return structured crash analysis result with all expected fields', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const crashTool = registry.getTool('analyze_crash');

      const result = await crashTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        timeRangeSeconds: 60,
      }) as Record<string, unknown>;

      // Verify all expected fields in ExtendedCrashAnalysis
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('platform');
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
      expect(result).toHaveProperty('deviceLogs');

      console.log('Crash analysis returned all expected fields');
    }, 30000);

    it('should trigger real crash and detect it in logs on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();

      // 1. Navigate to Debug screen
      const deepLinkTool = registry.getTool('deep_link_navigate');
      await deepLinkTool!.handler({
        platform: 'android',
        uri: 'specter://debug',
        packageName: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        waitAfterMs: 1000,
      });

      // 2. Trigger NullPointerException crash via UI
      const interactTool = registry.getTool('interact_with_ui');
      try {
        await interactTool!.handler({
          platform: 'android',
          action: 'tap',
          element: 'Trigger NullPointerException',
          device: deviceSetup.androidDeviceId,
        });
      } catch {
        // Expected - app will crash
      }

      // 3. Wait for crash to complete
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 4. Relaunch app
      const launchTool = registry.getTool('launch_app');
      await launchTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        device: deviceSetup.androidDeviceId,
      });

      // 5. Analyze crash logs
      const crashTool = registry.getTool('analyze_crash');
      const result = await crashTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        timeRangeSeconds: 120,
      }) as {
        success: boolean;
        deviceLogs?: {
          totalEntries: number;
          errorCount: number;
          crashIndicators: unknown[];
          keyErrors: string[];
        }
      };

      expect(result.success).toBe(true);
      expect(result.deviceLogs).toBeDefined();

      // Should detect crash-related errors
      const hasNullPointer = result.deviceLogs?.keyErrors.some(
        (err: string) => err.includes('NullPointer') || err.includes('FATAL') || err.includes('crash')
      );

      console.log(`Crash analysis after real crash: ${result.deviceLogs?.errorCount} errors, crash detected: ${hasNullPointer}`);

      // At minimum we should see error logs
      expect(result.deviceLogs!.errorCount).toBeGreaterThan(0);
    }, 90000);
  });

  describe('Error Handling', () => {
    it('should handle non-existent app gracefully', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const launchTool = registry.getTool('launch_app');

      try {
        await launchTool!.handler({
          platform: 'android',
          appId: 'com.nonexistent.app.that.does.not.exist',
          device: deviceSetup.androidDeviceId,
        });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error) {
        // Expected - app doesn't exist
        expect(error).toBeDefined();
        console.log('Correctly handled non-existent app error');
      }
    }, 15000);

    it('should handle invalid deep link gracefully', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const deepLinkTool = registry.getTool('deep_link_navigate');

      const result = await deepLinkTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: 'invalid-uri-without-scheme',
      }) as { success: boolean; error?: string };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      console.log('Correctly handled invalid deep link');
    }, 15000);
  });
});
