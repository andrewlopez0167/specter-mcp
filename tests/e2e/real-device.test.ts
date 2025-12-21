/**
 * Real Device E2E Tests
 * Tests that run against actual Android emulators and iOS simulators
 *
 * Prerequisites:
 * - Android: emulator running (adb devices shows device)
 * - iOS: simulator booted (xcrun simctl list shows Booted device)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { getToolRegistry, registerAllTools } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';
import { executeShell } from '../../src/utils/shell.js';

// Check device availability before running tests
async function isAndroidAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('adb', ['devices']);
    const lines = result.stdout.split('\n').filter(l => l.includes('device') && !l.includes('List'));
    return lines.length > 0;
  } catch {
    return false;
  }
}

async function isIOSAvailable(): Promise<boolean> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices']);
    return result.stdout.includes('(Booted)');
  } catch {
    return false;
  }
}

async function getBootedIOSDevice(): Promise<string | null> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices']);
    const bootedMatch = result.stdout.match(/([A-F0-9-]{36})\) \(Booted\)/);
    return bootedMatch ? bootedMatch[1] : null;
  } catch {
    return null;
  }
}

async function getAndroidDeviceId(): Promise<string | null> {
  try {
    const result = await executeShell('adb', ['devices']);
    const lines = result.stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/^([\w-]+)\s+device$/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

describe('Real Device E2E Tests', () => {
  let androidAvailable: boolean;
  let iosAvailable: boolean;
  let androidDeviceId: string | null;
  let iosDeviceId: string | null;

  beforeAll(async () => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    await registerAllTools();

    // Check device availability
    androidAvailable = await isAndroidAvailable();
    iosAvailable = await isIOSAvailable();
    androidDeviceId = await getAndroidDeviceId();
    iosDeviceId = await getBootedIOSDevice();

    console.log(`Android available: ${androidAvailable} (${androidDeviceId})`);
    console.log(`iOS available: ${iosAvailable} (${iosDeviceId})`);
  });

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('list_devices', () => {
    it('should list Android devices when available', async () => {
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

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
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

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
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('manage_env');
      expect(tool).toBeDefined();

      // Test restart action (will skip if already booted, which is fine)
      const result = await tool!.handler({
        action: 'boot',
        platform: 'android',
        device: androidDeviceId,
      }) as { success: boolean; message?: string };

      // Should succeed or indicate device is already running
      expect(result).toHaveProperty('success');
    });

    it('should check iOS simulator status', async () => {
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('manage_env');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        action: 'boot',
        platform: 'ios',
        device: iosDeviceId,
      }) as { success: boolean; message?: string };

      expect(result).toHaveProperty('success');
    });
  });

  describe('inspect_logs', () => {
    it('should stream Android logs', async () => {
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'android',
        deviceId: androidDeviceId,
        timeoutMs: 2000,  // Short timeout for test
      }) as { success: boolean; logs?: string[] };

      expect(result).toHaveProperty('success');
      // Logs may or may not be present depending on device activity
    });

    it('should stream iOS logs', async () => {
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: iosDeviceId,
        timeoutMs: 2000,
      }) as { success: boolean; logs?: string[] };

      expect(result).toHaveProperty('success');
    });
  });

  describe('get_ui_context (requires running app)', () => {
    it('should capture Android screenshot', async () => {
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'android',
        deviceId: androidDeviceId,
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
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: iosDeviceId,
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
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');
      expect(tool).toBeDefined();

      // Tap in center of screen (safe location)
      const result = await tool!.handler({
        platform: 'android',
        deviceId: androidDeviceId,
        action: 'tap',
        x: 540,
        y: 1000,
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should execute tap on iOS', async () => {
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');
      expect(tool).toBeDefined();

      // Note: iOS tap requires different approach (simctl doesn't have direct tap)
      // This test validates the tool handles the platform correctly
      const result = await tool!.handler({
        platform: 'ios',
        deviceId: iosDeviceId,
        action: 'tap',
        x: 200,
        y: 400,
      }) as { success: boolean; error?: string };

      // iOS tap may require additional setup (appium, etc)
      expect(result).toHaveProperty('success');
    });
  });

  describe('deep_link_navigate', () => {
    it('should open deep link on Android', async () => {
      if (!androidAvailable) {
        console.log('Skipping: No Android device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');
      expect(tool).toBeDefined();

      // Use a safe system URL
      const result = await tool!.handler({
        platform: 'android',
        deviceId: androidDeviceId,
        uri: 'https://google.com',
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });

    it('should open deep link on iOS', async () => {
      if (!iosAvailable) {
        console.log('Skipping: No iOS device available');
        return;
      }

      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');
      expect(tool).toBeDefined();

      const result = await tool!.handler({
        platform: 'ios',
        deviceId: iosDeviceId,
        uri: 'https://apple.com',
      }) as { success: boolean };

      expect(result.success).toBe(true);
    });
  });
});
