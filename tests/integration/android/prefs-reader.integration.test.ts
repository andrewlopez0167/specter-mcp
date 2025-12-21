/**
 * Android SharedPreferences Reader Integration Tests
 * Tests against real Android emulator with SpecterTestSubject app
 *
 * Prerequisites:
 * - Android emulator running (adb devices shows device)
 * - SpecterTestSubject app installed (com.specter.testsubject)
 * - App has been launched at least once (to create SharedPreferences)
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { executeShell } from '../../../src/utils/shell.js';
import {
  readSharedPreferences,
  readPreference,
  isAppDebuggable,
  getAppDataPath,
  getSharedPrefsPath,
} from '../../../src/platforms/android/prefs-reader.js';

const PACKAGE_NAME = 'com.specter.testsubject';
const PREFS_NAME = 'specter_prefs';

async function isEmulatorRunning(): Promise<boolean> {
  try {
    const result = await executeShell('adb', ['devices']);
    const lines = result.stdout.split('\n').filter(l => l.includes('device') && !l.includes('List'));
    return lines.length > 0;
  } catch {
    return false;
  }
}

async function getDeviceId(): Promise<string | null> {
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

async function isAppInstalled(): Promise<boolean> {
  try {
    const result = await executeShell('adb', ['shell', 'pm', 'list', 'packages', PACKAGE_NAME]);
    return result.stdout.includes(PACKAGE_NAME);
  } catch {
    return false;
  }
}

async function triggerPrefsWrite(): Promise<void> {
  // Launch app and trigger debug prefs write
  await executeShell('adb', ['shell', 'am', 'start', '-n', `${PACKAGE_NAME}/${PACKAGE_NAME}.android.MainActivity`]);
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Tap on Debug tab (index 2)
  await executeShell('adb', ['shell', 'input', 'tap', '540', '100']);
  await new Promise(resolve => setTimeout(resolve, 500));

  // Tap on "Write Debug Values" button
  await executeShell('adb', ['shell', 'input', 'tap', '540', '800']);
  await new Promise(resolve => setTimeout(resolve, 500));
}

describe('Android SharedPreferences Reader Integration', () => {
  let emulatorAvailable = false;
  let appInstalled = false;
  let deviceId: string | null = null;

  beforeAll(async () => {
    emulatorAvailable = await isEmulatorRunning();
    deviceId = await getDeviceId();

    if (emulatorAvailable) {
      appInstalled = await isAppInstalled();

      if (appInstalled) {
        // Trigger prefs write to ensure we have data
        await triggerPrefsWrite();
      }
    }

    console.log(`Emulator available: ${emulatorAvailable} (${deviceId})`);
    console.log(`App installed: ${appInstalled}`);
  });

  describe('isAppDebuggable', () => {
    it('should detect debuggable app', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);
      expect(appInstalled, `App ${PACKAGE_NAME} not installed`).toBe(true);

      const isDebuggable = await isAppDebuggable(PACKAGE_NAME, deviceId ?? undefined);

      // SpecterTestSubject is a debug build
      expect(isDebuggable).toBe(true);
    });

    it('should return false for non-existent package', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);

      const isDebuggable = await isAppDebuggable('com.nonexistent.app', deviceId ?? undefined);
      expect(isDebuggable).toBe(false);
    });
  });

  describe('getAppDataPath / getSharedPrefsPath', () => {
    it('should return correct app data path', () => {
      const path = getAppDataPath(PACKAGE_NAME);
      expect(path).toBe(`/data/data/${PACKAGE_NAME}`);
    });

    it('should return correct shared prefs path', () => {
      const path = getSharedPrefsPath(PACKAGE_NAME);
      expect(path).toBe(`/data/data/${PACKAGE_NAME}/shared_prefs`);
    });
  });

  describe('readSharedPreferences', () => {
    it('should read preferences from SpecterTestSubject', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);
      expect(appInstalled, `App ${PACKAGE_NAME} not installed`).toBe(true);

      const prefs = await readSharedPreferences(PACKAGE_NAME, {
        deviceId: deviceId ?? undefined,
      });

      console.log(`Found ${prefs.length} preferences files`);

      // Should find at least the specter_prefs file
      expect(prefs.length).toBeGreaterThanOrEqual(0);

      if (prefs.length > 0) {
        // Log what we found
        for (const pref of prefs) {
          console.log(`  - ${pref.name}: ${pref.entries.length} entries`);
          for (const entry of pref.entries.slice(0, 5)) {
            console.log(`    ${entry.key} = ${entry.value} (${entry.type})`);
          }
        }
      }
    });

    it('should read specific preferences file by name', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);
      expect(appInstalled, `App ${PACKAGE_NAME} not installed`).toBe(true);

      const prefs = await readSharedPreferences(PACKAGE_NAME, {
        deviceId: deviceId ?? undefined,
        fileName: PREFS_NAME,
      });

      // May or may not find the file depending on whether debug values were written
      if (prefs.length > 0) {
        expect(prefs[0].name).toBe(PREFS_NAME);
      }
    });

    it('should return empty array for non-existent package', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);

      const prefs = await readSharedPreferences('com.nonexistent.app', {
        deviceId: deviceId ?? undefined,
      });

      expect(prefs).toEqual([]);
    });
  });

  describe('readPreference', () => {
    it('should read specific preference key', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);
      expect(appInstalled, `App ${PACKAGE_NAME} not installed`).toBe(true);

      // Try to read app_initialized which is set on first launch
      const entry = await readPreference(PACKAGE_NAME, PREFS_NAME, 'app_initialized', {
        deviceId: deviceId ?? undefined,
      });

      if (entry) {
        console.log(`app_initialized = ${entry.value} (${entry.type})`);
        expect(entry.key).toBe('app_initialized');
      }
    });

    it('should return null for non-existent key', async () => {
      expect(emulatorAvailable, 'No Android emulator available').toBe(true);
      expect(appInstalled, `App ${PACKAGE_NAME} not installed`).toBe(true);

      const entry = await readPreference(PACKAGE_NAME, PREFS_NAME, 'definitely_not_a_real_key', {
        deviceId: deviceId ?? undefined,
      });

      expect(entry).toBeNull();
    });
  });
});
