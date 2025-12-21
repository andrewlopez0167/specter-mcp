/**
 * iOS UserDefaults Reader Integration Tests
 * Tests against real iOS simulator with SpecterTestSubject app
 *
 * Prerequisites:
 * - iOS simulator running (xcrun simctl list shows Booted device)
 * - SpecterCounter app installed (com.specter.counter)
 * - App has been launched at least once (to create UserDefaults)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import {
  readUserDefaults,
  readDefaultsDomain,
  getAppContainerPath,
  listInstalledApps,
  isAppInstalled,
} from '../../../src/platforms/ios/prefs-reader.js';

const BUNDLE_ID = 'com.specter.counter';

async function isSimulatorRunning(): Promise<boolean> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices']);
    return result.stdout.includes('(Booted)');
  } catch {
    return false;
  }
}

async function getBootedDeviceId(): Promise<string | null> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'list', 'devices']);
    const bootedMatch = result.stdout.match(/([A-F0-9-]{36})\) \(Booted\)/);
    return bootedMatch ? bootedMatch[1] : null;
  } catch {
    return null;
  }
}

async function isTestAppInstalled(deviceId: string): Promise<boolean> {
  try {
    const result = await executeShell('xcrun', ['simctl', 'listapps', deviceId]);
    return result.stdout.includes(BUNDLE_ID);
  } catch {
    return false;
  }
}

async function triggerPrefsWrite(deviceId: string): Promise<void> {
  // Launch app
  await executeShell('xcrun', ['simctl', 'launch', deviceId, BUNDLE_ID]);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // The app writes to UserDefaults on launch (counter value, etc.)
}

describe('iOS UserDefaults Reader Integration', () => {
  let simulatorAvailable = false;
  let appInstalled = false;
  let deviceId: string | null = null;

  beforeAll(async () => {
    simulatorAvailable = await isSimulatorRunning();
    deviceId = await getBootedDeviceId();

    if (simulatorAvailable && deviceId) {
      appInstalled = await isTestAppInstalled(deviceId);

      if (appInstalled) {
        await triggerPrefsWrite(deviceId);
      }
    }

    console.log(`Simulator available: ${simulatorAvailable} (${deviceId})`);
    console.log(`App installed: ${appInstalled}`);
  });

  describe('getAppContainerPath', () => {
    it('should return container path for installed app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(appInstalled, `App ${BUNDLE_ID} not installed`).toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const containerPath = await getAppContainerPath(BUNDLE_ID, deviceId);

      expect(containerPath).not.toBeNull();
      expect(containerPath).toContain('Library/Developer/CoreSimulator');
      console.log(`Container path: ${containerPath}`);
    });

    it('should return null for non-existent app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const containerPath = await getAppContainerPath('com.nonexistent.app', deviceId!);
      expect(containerPath).toBeNull();
    });
  });

  describe('isAppInstalled', () => {
    it('should detect installed app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const installed = await isAppInstalled(BUNDLE_ID, deviceId);
      expect(installed).toBe(appInstalled);
    });

    it('should return false for non-existent app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const installed = await isAppInstalled('com.nonexistent.app', deviceId!);
      expect(installed).toBe(false);
    });
  });

  describe('listInstalledApps', () => {
    it('should list apps on simulator', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const apps = await listInstalledApps(deviceId);

      expect(apps).toBeInstanceOf(Array);
      console.log(`Found ${apps.length} installed apps`);

      if (appInstalled) {
        expect(apps).toContain(BUNDLE_ID);
      }
    });
  });

  describe('readUserDefaults', () => {
    it('should read UserDefaults from SpecterCounter', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(appInstalled, `App ${BUNDLE_ID} not installed`).toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const prefs = await readUserDefaults(BUNDLE_ID, { deviceId });

      console.log(`Found ${prefs.length} preferences files`);

      for (const pref of prefs) {
        console.log(`  - ${pref.name}: ${pref.entries.length} entries`);
        for (const entry of pref.entries.slice(0, 5)) {
          console.log(`    ${entry.key} = ${entry.value} (${entry.type})`);
        }
      }
    });

    it('should return empty array for non-existent app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const prefs = await readUserDefaults('com.nonexistent.app', { deviceId });
      expect(prefs).toEqual([]);
    });
  });

  describe('readDefaultsDomain', () => {
    it('should read defaults domain for app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(appInstalled, `App ${BUNDLE_ID} not installed`).toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const domain = await readDefaultsDomain(BUNDLE_ID, deviceId);

      if (domain) {
        console.log(`Read ${domain.entries.length} entries from defaults domain`);
        for (const entry of domain.entries.slice(0, 5)) {
          console.log(`  ${entry.key} = ${entry.value} (${entry.type})`);
        }
      }
    });

    it('should return null for non-existent app', async () => {
      expect(simulatorAvailable, 'No iOS simulator available').toBe(true);
      expect(deviceId, 'No device ID available').toBeTruthy();

      const domain = await readDefaultsDomain('com.nonexistent.app', deviceId!);
      expect(domain).toBeNull();
    });
  });
});
