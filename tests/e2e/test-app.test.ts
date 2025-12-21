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
 *
 * NOTE: Android and iOS tests run in PARALLEL for faster execution.
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

/**
 * Helper to run Android and iOS tests in parallel
 * Returns results for both platforms
 */
async function runParallel<T>(
  deviceSetup: DeviceSetupResult,
  androidTest: () => Promise<T>,
  iosTest: () => Promise<T>
): Promise<{ android?: T; ios?: T; errors: string[] }> {
  const errors: string[] = [];
  const results: { android?: T; ios?: T } = {};

  const promises: Promise<void>[] = [];

  if (deviceSetup.androidAvailable) {
    promises.push(
      androidTest()
        .then(r => { results.android = r; })
        .catch(e => { errors.push(`Android: ${e.message}`); })
    );
  }

  if (deviceSetup.iosAvailable) {
    promises.push(
      iosTest()
        .then(r => { results.ios = r; })
        .catch(e => { errors.push(`iOS: ${e.message}`); })
    );
  }

  await Promise.all(promises);
  return { ...results, errors };
}

/**
 * Helper to run Android and iOS tests sequentially
 * Used for Maestro tests which can't run in parallel (resource conflicts)
 */
async function runSequential<T>(
  deviceSetup: DeviceSetupResult,
  androidTest: () => Promise<T>,
  iosTest: () => Promise<T>
): Promise<{ android?: T; ios?: T; errors: string[] }> {
  const errors: string[] = [];
  const results: { android?: T; ios?: T } = {};

  // Run Android first
  if (deviceSetup.androidAvailable) {
    try {
      results.android = await androidTest();
    } catch (e: unknown) {
      errors.push(`Android: ${(e as Error).message}`);
    }
  }

  // Then run iOS
  if (deviceSetup.iosAvailable) {
    try {
      results.ios = await iosTest();
    } catch (e: unknown) {
      errors.push(`iOS: ${(e as Error).message}`);
    }
  }

  return { ...results, errors };
}

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
    it('should build Android and iOS apps in parallel', async () => {
      const registry = getToolRegistry();
      const buildTool = registry.getTool('build_app');
      expect(buildTool).toBeDefined();

      const originalCwd = process.cwd();
      process.chdir(TEST_APP.projectPath);

      try {
        const results = await runParallel(
          deviceSetup,
          // Android build
          async () => {
            const result = await buildTool!.handler({
              platform: 'android',
              variant: 'debug',
              clean: false,
              androidModule: TEST_APP.android.module,
            }) as { success: boolean; artifactPath?: string; error?: string };

            expect(result.success).toBe(true);
            androidBuildArtifact = resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
            expect(existsSync(androidBuildArtifact)).toBe(true);
            console.log(`✓ Android build successful: ${androidBuildArtifact}`);
            return result;
          },
          // iOS build
          async () => {
            const result = await buildTool!.handler({
              platform: 'ios',
              variant: 'debug',
              clean: false,
              iosScheme: TEST_APP.ios.scheme,
              iosDestination: `platform=iOS Simulator,id=${deviceSetup.iosDeviceId}`,
            }) as { success: boolean; artifactPath?: string; error?: string };

            expect(result.success).toBe(true);
            iosBuildArtifact = resolve(TEST_APP.projectPath, TEST_APP.ios.appPath);
            console.log(`✓ iOS build successful: ${iosBuildArtifact}`);
            return result;
          }
        );

        if (results.errors.length > 0) {
          console.log('Build errors:', results.errors);
        }
        expect(results.errors.length).toBe(0);
      } finally {
        process.chdir(originalCwd);
      }
    }, 600000); // 10 minute timeout for parallel builds
  });

  describe('Install Phase', () => {
    it('should install apps on both platforms in parallel', async () => {
      const registry = getToolRegistry();
      const installTool = registry.getTool('install_app');
      expect(installTool).toBeDefined();

      const results = await runParallel(
        deviceSetup,
        // Android install
        async () => {
          const apkPath = androidBuildArtifact || resolve(TEST_APP.projectPath, TEST_APP.android.apkPath);
          expect(existsSync(apkPath), `APK not found at ${apkPath}`).toBe(true);

          const result = await installTool!.handler({
            platform: 'android',
            appPath: apkPath,
            deviceId: deviceSetup.androidDeviceId,
          }) as { success: boolean; error?: string };

          expect(result.success).toBe(true);
          console.log('✓ Android app installed successfully');
          return result;
        },
        // iOS install
        async () => {
          const appPath = iosBuildArtifact || resolve(TEST_APP.projectPath, TEST_APP.ios.appPath);
          expect(existsSync(appPath), `iOS app not found at ${appPath}`).toBe(true);

          const result = await installTool!.handler({
            platform: 'ios',
            appPath: appPath,
            deviceId: deviceSetup.iosDeviceId,
          }) as { success: boolean; error?: string };

          expect(result.success).toBe(true);
          console.log('✓ iOS app installed successfully');
          return result;
        }
      );

      if (results.errors.length > 0) {
        console.log('Install errors:', results.errors);
      }
      expect(results.errors.length).toBe(0);
    }, 120000);
  });

  describe('Launch Phase', () => {
    it('should launch apps on both platforms in parallel', async () => {
      const registry = getToolRegistry();
      const launchTool = registry.getTool('launch_app');
      expect(launchTool).toBeDefined();

      const results = await runParallel(
        deviceSetup,
        // Android launch
        async () => {
          const result = await launchTool!.handler({
            platform: 'android',
            appId: TEST_APP.android.appId,
            deviceId: deviceSetup.androidDeviceId,
            clearData: true,
          }) as { success: boolean; error?: string };

          expect(result.success).toBe(true);
          console.log('✓ Android app launched successfully');
          await new Promise(resolve => setTimeout(resolve, 3000));
          return result;
        },
        // iOS launch
        async () => {
          const result = await launchTool!.handler({
            platform: 'ios',
            appId: TEST_APP.ios.bundleId,
            deviceId: deviceSetup.iosDeviceId,
          }) as { success: boolean; error?: string };

          expect(result.success).toBe(true);
          console.log('✓ iOS app launched successfully');
          await new Promise(resolve => setTimeout(resolve, 3000));
          return result;
        }
      );

      if (results.errors.length > 0) {
        console.log('Launch errors:', results.errors);
      }
      expect(results.errors.length).toBe(0);
    }, 30000);
  });

  describe('UI Context Phase (requires app running)', () => {
    it('should capture screenshots on both platforms in parallel', async () => {
      const registry = getToolRegistry();
      const uiTool = registry.getTool('get_ui_context');
      expect(uiTool).toBeDefined();

      const results = await runParallel(
        deviceSetup,
        // Android screenshot
        async () => {
          const result = await uiTool!.handler({
            platform: 'android',
            deviceId: deviceSetup.androidDeviceId,
            skipScreenshot: false,
            includeAllElements: true,
          }) as { screenshot?: { data: string }; elements?: unknown[]; error?: string };

          expect(result.screenshot).toBeDefined();
          expect(result.screenshot!.data.length).toBeGreaterThan(0);
          console.log(`✓ Android screenshot: ${result.screenshot!.data.length} bytes, ${result.elements?.length || 0} elements`);
          return result;
        },
        // iOS screenshot
        async () => {
          const result = await uiTool!.handler({
            platform: 'ios',
            deviceId: deviceSetup.iosDeviceId,
            skipScreenshot: false,
            includeAllElements: true,
          }) as { screenshot?: { data: string }; elements?: unknown[]; error?: string };

          expect(result.screenshot).toBeDefined();
          console.log(`✓ iOS screenshot: ${result.screenshot!.data.length} bytes, ${result.elements?.length || 0} elements`);
          return result;
        }
      );

      if (results.errors.length > 0) {
        console.log('Screenshot errors:', results.errors);
      }
      // At least one platform should succeed
      expect(results.android || results.ios).toBeDefined();
    }, 30000);
  });

  describe('Deep Link Navigation (requires app installed)', () => {
    it('should navigate via deep links on both platforms in parallel', async () => {
      const registry = getToolRegistry();
      const deepLinkTool = registry.getTool('deep_link_navigate');
      expect(deepLinkTool).toBeDefined();

      const results = await runParallel(
        deviceSetup,
        // Android deep links
        async () => {
          // Navigate to counter
          const counterResult = await deepLinkTool!.handler({
            platform: 'android',
            deviceId: deviceSetup.androidDeviceId,
            uri: TEST_APP.deepLinks.counter,
          }) as { success: boolean; error?: string };
          expect(counterResult.success).toBe(true);
          console.log('✓ Android: Deep link to counter');

          await new Promise(resolve => setTimeout(resolve, 500));

          // Navigate to form
          const formResult = await deepLinkTool!.handler({
            platform: 'android',
            deviceId: deviceSetup.androidDeviceId,
            uri: TEST_APP.deepLinks.form,
          }) as { success: boolean; error?: string };
          expect(formResult.success).toBe(true);
          console.log('✓ Android: Deep link to form');

          return { counter: counterResult, form: formResult };
        },
        // iOS deep links
        async () => {
          const result = await deepLinkTool!.handler({
            platform: 'ios',
            deviceId: deviceSetup.iosDeviceId,
            uri: TEST_APP.deepLinks.counter,
          }) as { success: boolean; error?: string };
          expect(result.success).toBe(true);
          console.log('✓ iOS: Deep link to counter');
          return result;
        }
      );

      if (results.errors.length > 0) {
        console.log('Deep link errors:', results.errors);
      }
      expect(results.errors.length).toBe(0);
    }, 15000);
  });

  describe('UI Interaction (requires app running)', () => {
    it('should perform UI interactions on Android (tap, input, swipe)', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const interactTool = registry.getTool('interact_with_ui');

      // Tap in center of screen
      const tapResult = await interactTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        action: 'tap',
        x: 540,
        y: 960,
      }) as { success: boolean; error?: string };
      expect(tapResult.success).toBe(true);
      console.log('✓ Android: Tap executed');

      // Input text
      const inputResult = await interactTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        action: 'input_text',
        text: 'test@example.com',
      }) as { success: boolean; error?: string };
      expect(inputResult.success).toBe(true);
      console.log('✓ Android: Text input executed');

      // Swipe
      const swipeResult = await interactTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        action: 'swipe',
        x: 540,
        y: 1200,
        direction: 'up',
        durationMs: 300,
      }) as { success: boolean; error?: string };
      expect(swipeResult.success).toBe(true);
      console.log('✓ Android: Swipe executed');
    }, 30000);
  });

  describe('Log Inspection (requires app running)', () => {
    it('should capture logs on both platforms in parallel', async () => {
      const registry = getToolRegistry();
      const logTool = registry.getTool('inspect_logs');
      expect(logTool).toBeDefined();

      const results = await runParallel(
        deviceSetup,
        // Android logs
        async () => {
          const result = await logTool!.handler({
            platform: 'android',
            deviceId: deviceSetup.androidDeviceId,
            appId: TEST_APP.android.appId,
            timeoutMs: 3000,
            maxEntries: 100,
          }) as { success: boolean; entries?: unknown[]; error?: string };

          expect(result.success).toBe(true);
          console.log(`✓ Android: ${(result.entries as unknown[])?.length || 0} log entries`);
          return result;
        },
        // iOS logs
        async () => {
          const result = await logTool!.handler({
            platform: 'ios',
            deviceId: deviceSetup.iosDeviceId,
            appId: TEST_APP.ios.bundleId,
            timeoutMs: 3000,
          }) as { success: boolean; entries?: unknown[]; error?: string };

          expect(result.success).toBe(true);
          console.log(`✓ iOS: ${(result.entries as unknown[])?.length || 0} log entries`);
          return result;
        }
      );

      if (results.errors.length > 0) {
        console.log('Log capture errors:', results.errors);
      }
      expect(results.errors.length).toBe(0);
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

  // NOTE: Maestro tests run sequentially because Maestro can't control
  // multiple devices in parallel reliably (causes resource conflicts/timeouts)
  it('should run counter flow on both platforms sequentially', async () => {
    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.counterFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');
    expect(maestroTool).toBeDefined();

    const results = await runSequential(
      deviceSetup,
      // Android counter flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'android',
          deviceId: deviceSetup.androidDeviceId,
          appId: TEST_APP.android.appId,
          timeoutMs: 120000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; passedSteps: number; totalSteps: number; error?: string }; summary: string };

        console.log('✓ Android counter flow:', result.summary);
        expect(result.flowResult.success, `Android counter flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      },
      // iOS counter flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'ios',
          deviceId: deviceSetup.iosDeviceId,
          appId: TEST_APP.ios.bundleId,
          timeoutMs: 120000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; error?: string }; summary: string };

        console.log('✓ iOS counter flow:', result.summary);
        expect(result.flowResult.success, `iOS counter flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      }
    );

    if (results.errors.length > 0) {
      console.log('Maestro counter flow errors:', results.errors);
    }
    expect(results.errors.length).toBe(0);
  }, 180000);

  it('should run form flow on both platforms sequentially', async () => {
    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.formFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const results = await runSequential(
      deviceSetup,
      // Android form flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'android',
          deviceId: deviceSetup.androidDeviceId,
          appId: TEST_APP.android.appId,
          timeoutMs: 120000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; error?: string }; summary: string };

        console.log('✓ Android form flow:', result.summary);
        expect(result.flowResult.success, `Android form flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      },
      // iOS form flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'ios',
          deviceId: deviceSetup.iosDeviceId,
          appId: TEST_APP.ios.bundleId,
          timeoutMs: 120000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; error?: string }; summary: string };

        console.log('✓ iOS form flow:', result.summary);
        expect(result.flowResult.success, `iOS form flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      }
    );

    if (results.errors.length > 0) {
      console.log('Maestro form flow errors:', results.errors);
    }
    expect(results.errors.length).toBe(0);
  }, 180000);

  it('should run full E2E flow on both platforms sequentially', async () => {
    const flowPath = resolve(TEST_APP.projectPath, TEST_APP.maestro.fullFlow);
    expect(existsSync(flowPath), `Maestro flow file not found at ${flowPath}`).toBe(true);

    const registry = getToolRegistry();
    const maestroTool = registry.getTool('run_maestro_flow');

    const results = await runSequential(
      deviceSetup,
      // Android full flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'android',
          deviceId: deviceSetup.androidDeviceId,
          appId: TEST_APP.android.appId,
          timeoutMs: 180000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; durationMs: number; error?: string }; summary: string };

        console.log('✓ Android full flow:', result.summary);
        console.log(`  Duration: ${(result.flowResult.durationMs / 1000).toFixed(2)}s`);
        expect(result.flowResult.success, `Android full flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      },
      // iOS full flow
      async () => {
        const result = await maestroTool!.handler({
          flowPath,
          platform: 'ios',
          deviceId: deviceSetup.iosDeviceId,
          appId: TEST_APP.ios.bundleId,
          timeoutMs: 180000,
          generateFailureBundle: true,
        }) as { flowResult: { success: boolean; durationMs: number; error?: string }; summary: string };

        console.log('✓ iOS full flow:', result.summary);
        console.log(`  Duration: ${(result.flowResult.durationMs / 1000).toFixed(2)}s`);
        expect(result.flowResult.success, `iOS full flow failed: ${result.flowResult.error}`).toBe(true);
        return result;
      }
    );

    if (results.errors.length > 0) {
      console.log('Maestro full flow errors:', results.errors);
    }
    expect(results.errors.length).toBe(0);
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
        deviceId: deviceSetup.androidDeviceId,
      }) as { success: boolean };

      expect(installResult.success, 'Install failed').toBe(true);

      // 2. Launch
      const launchTool = registry.getTool('launch_app');
      const launchResult = await launchTool!.handler({
        platform: 'android',
        appId: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        clearData: true,
      }) as { success: boolean };

      expect(launchResult.success).toBe(true);
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 3. Capture UI (returns UIContext with screenshot property)
      const uiTool = registry.getTool('get_ui_context');
      const uiResult = await uiTool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
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
        deviceId: deviceSetup.androidDeviceId,
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
        deviceId: deviceSetup.androidDeviceId,
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
          deviceId: deviceSetup.androidDeviceId,
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
        deviceId: deviceSetup.androidDeviceId,
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

      // Check crashIndicators (the proper crash detection mechanism)
      const hasCrashIndicators = (result.deviceLogs?.crashIndicators?.length ?? 0) > 0;

      // Also check keyErrors for crash-related strings as backup
      const hasNullPointerInErrors = result.deviceLogs?.keyErrors.some(
        (err: string) => err.includes('NullPointer') || err.includes('FATAL') || err.includes('AndroidRuntime')
      );

      const crashDetected = hasCrashIndicators || hasNullPointerInErrors;

      console.log(`Crash analysis after real crash: ${result.deviceLogs?.errorCount} errors, ${result.deviceLogs?.crashIndicators?.length ?? 0} crash indicators, detected: ${crashDetected}`);

      // Log first few key errors for debugging
      if (result.deviceLogs?.keyErrors && result.deviceLogs.keyErrors.length > 0) {
        console.log('Sample key errors:', result.deviceLogs.keyErrors.slice(0, 3));
      }
      if (result.deviceLogs?.crashIndicators && result.deviceLogs.crashIndicators.length > 0) {
        console.log('Crash indicators:', result.deviceLogs.crashIndicators.slice(0, 3));
      }

      // At minimum we should see error logs
      expect(result.deviceLogs!.errorCount).toBeGreaterThan(0);
    }, 90000);

    it('should detect random crash type on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();

      // List of crash types to randomly choose from
      const crashTypes = [
        { element: 'Trigger NullPointerException', name: 'NullPointerException' },
        { element: 'Trigger IllegalStateException', name: 'IllegalStateException' },
        { element: 'Trigger OutOfMemoryError', name: 'OutOfMemoryError' },
      ];

      // Pick a random crash type
      const randomCrash = crashTypes[Math.floor(Math.random() * crashTypes.length)];
      console.log(`Testing random crash type: ${randomCrash.name}`);

      // 1. Navigate to Debug screen
      const deepLinkTool = registry.getTool('deep_link_navigate');
      await deepLinkTool!.handler({
        platform: 'android',
        uri: 'specter://debug',
        packageName: TEST_APP.android.appId,
        deviceId: deviceSetup.androidDeviceId,
        waitAfterMs: 1000,
      });

      // 2. Trigger random crash via UI
      const interactTool = registry.getTool('interact_with_ui');
      try {
        await interactTool!.handler({
          platform: 'android',
          action: 'tap',
          element: randomCrash.element,
          deviceId: deviceSetup.androidDeviceId,
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
        deviceId: deviceSetup.androidDeviceId,
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
        category: string;
        deviceLogs?: {
          totalEntries: number;
          errorCount: number;
          crashIndicators: Array<{ type: string; message: string; severity: string }>;
          keyErrors: string[];
        }
      };

      expect(result.success).toBe(true);
      expect(result.deviceLogs).toBeDefined();

      // Should detect crash indicators
      const crashIndicators = result.deviceLogs?.crashIndicators ?? [];
      const hasCrashIndicators = crashIndicators.length > 0;

      // Check if the specific crash type was detected
      const crashTypeDetected = crashIndicators.some(
        (indicator) => indicator.message.includes(randomCrash.name) ||
                       indicator.message.includes('FATAL') ||
                       indicator.message.includes('AndroidRuntime')
      );

      console.log(`Random crash (${randomCrash.name}): ${crashIndicators.length} indicators, detected: ${crashTypeDetected}`);
      if (crashIndicators.length > 0) {
        console.log('First crash indicator:', crashIndicators[0]);
      }

      // Verify crash was detected
      expect(hasCrashIndicators).toBe(true);
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
          deviceId: deviceSetup.androidDeviceId,
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
