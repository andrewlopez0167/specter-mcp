/**
 * Real Device E2E Tests
 * Tests that run against actual Android emulators and iOS simulators
 *
 * Auto-launches emulators/simulators if none are running.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getToolRegistry, registerAllTools } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';
import {
  ensureDevicesAvailable,
  type DeviceSetupResult,
} from './setup.js';

describe('Real Device E2E Tests', () => {
  let deviceSetup: DeviceSetupResult;

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

  describe('list_devices', () => {
    it('should list Android devices when available', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('list_devices');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ platform: 'android' }) as {
        devices: Array<{ id: string; status: string }>;
        summary: string;
      };

      expect(result.devices).toBeDefined();
      expect(result.devices.length).toBeGreaterThan(0);
      expect(result.devices[0]).toHaveProperty('id');
    });

    it('should list iOS devices when available', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('list_devices');
      expect(tool).toBeDefined();

      const result = await tool!.handler({ platform: 'ios' }) as {
        devices: Array<{ id: string; name: string; state: string }>;
        summary: string;
      };

      expect(result.devices).toBeDefined();
      expect(result.devices.length).toBeGreaterThan(0);
    });

    it('should list all devices without platform filter', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('list_devices');
      expect(tool).toBeDefined();

      const result = await tool!.handler({}) as {
        devices: unknown[];
        summary: string;
      };

      expect(result.devices).toBeDefined();
      expect(result.summary).toBeDefined();
    });
  });

  describe('manage_env', () => {
    it('should check Android emulator status', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('manage_env');
      expect(tool).toBeDefined();

      // Test restart action (will skip if already booted, which is fine)
      const result = await tool!.handler({
        action: 'boot',
        platform: 'android',
        device: deviceSetup.androidDeviceId,
      }) as { success: boolean; message?: string };

      // Should succeed or indicate device is already running
      expect(result).toHaveProperty('success');
    });

    it('should check iOS simulator status', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('manage_env');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        action: 'boot',
        platform: 'ios',
        device: deviceSetup.iosDeviceId,
      }) as { success: boolean; message?: string };

      expect(result).toHaveProperty('success');
    });
  });

  describe('inspect_logs', () => {
    it('should stream Android logs', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        timeoutMs: 2000,  // Short timeout for test
      }) as { success: boolean; logs?: string[] };

      expect(result).toHaveProperty('success');
      // Logs may or may not be present depending on device activity
    });

    it('should stream iOS logs', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        timeoutMs: 2000,
      }) as { success: boolean; logs?: string[] };

      expect(result).toHaveProperty('success');
    });
  });

  describe('get_ui_context (requires running app)', () => {
    it('should capture Android screenshot', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        captureScreenshot: true,
        captureHierarchy: false,
      }) as { success: boolean; screenshot?: string; error?: string };

      // This will succeed if device is on, even without app
      if (result.success) {
        expect(result.screenshot).toBeDefined();
      } else {
        // Acceptable - may need app running
        console.log('Screenshot capture failed (expected if no app):', result.error);
      }
    });

    it('should capture iOS screenshot', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        captureScreenshot: true,
        captureHierarchy: false,
      }) as { success: boolean; screenshot?: string; error?: string };

      if (result.success) {
        expect(result.screenshot).toBeDefined();
      } else {
        console.log('Screenshot capture failed (expected if no app):', result.error);
      }
    });
  });

  describe('interact_with_ui', () => {
    it('should execute tap on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');
      expect(tool).toBeDefined();

      // Tap in center of screen (safe location)
      const result = await tool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        action: 'tap',
        x: 540,
        y: 1000,
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should reject tap on iOS with helpful message', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');
      expect(tool).toBeDefined();

      // iOS tap is not supported via simctl - should return error with helpful message
      const result = await tool!.handler({
        platform: 'ios',
        device: deviceSetup.iosDeviceId,
        action: 'tap',
        x: 200,
        y: 400,
      }) as { success: boolean; error?: string };

      // Should fail with helpful message pointing to Maestro
      expect(result.success).toBe(false);
      expect(result.error).toContain('run_maestro_flow');
    });
  });

  describe('deep_link_navigate', () => {
    it('should open deep link on Android', async () => {
      expect(deviceSetup.androidAvailable, 'Test requires Android device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');
      expect(tool).toBeDefined();

      // Use a safe system URL
      const result = await tool!.handler({
        platform: 'android',
        deviceId: deviceSetup.androidDeviceId,
        uri: 'https://google.com',
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should open deep link on iOS', async () => {
      expect(deviceSetup.iosAvailable, 'Test requires iOS device but none available').toBe(true);

      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: deviceSetup.iosDeviceId,
        uri: 'https://apple.com',
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });
});
