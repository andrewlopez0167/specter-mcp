/**
 * Android SharedPreferences Reader Unit Tests
 * Tests using dependency-injected shell executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readSharedPreferences,
  readPreference,
  isAppDebuggable,
  getAppDataPath,
  getSharedPrefsPath,
  ReadPreferencesOptions,
} from '../../../../src/platforms/android/prefs-reader.js';
import { ShellExecutor } from '../../../../src/utils/shell-executor.js';

// Create a mock shell executor
function createMockShell(): ShellExecutor & {
  execute: ReturnType<typeof vi.fn>;
  executeOrThrow: ReturnType<typeof vi.fn>;
  commandExists: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(),
    executeOrThrow: vi.fn(),
    commandExists: vi.fn(),
  };
}

describe('Android SharedPreferences Reader', () => {
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShell = createMockShell();
  });

  describe('readSharedPreferences', () => {
    const packageName = 'com.example.app';

    it('should read preferences files successfully', async () => {
      // Mock listing files
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\nuser_settings.xml\n',
          stderr: '',
          exitCode: 0,
        })
        // Mock reading first file
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="username">john_doe</string>
    <int name="login_count" value="5" />
    <boolean name="dark_mode" value="true" />
</map>`,
          stderr: '',
          exitCode: 0,
        })
        // Mock reading second file
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="theme">dark</string>
</map>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readSharedPreferences(packageName, { shell: mockShell });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('app_prefs');
      expect(result[1].name).toBe('user_settings');
    });

    it('should filter by fileName when specified', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\nuser_settings.xml\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="key">value</string>
</map>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readSharedPreferences(packageName, {
        fileName: 'app_prefs',
        shell: mockShell,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('app_prefs');
    });

    it('should return empty array when no preferences files found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await readSharedPreferences(packageName, { shell: mockShell });

      expect(result).toHaveLength(0);
    });

    it('should use deviceId when provided', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await readSharedPreferences(packageName, {
        deviceId: 'emulator-5554',
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should fall back to alternative method on run-as failure', async () => {
      // First call (run-as) fails
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'run-as: Package is not debuggable',
          exitCode: 1,
        })
        // Fallback (su) succeeds
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\n',
          stderr: '',
          exitCode: 0,
        })
        // Read file
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="key">value</string>
</map>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readSharedPreferences(packageName, { shell: mockShell });

      expect(result).toHaveLength(1);
      // Verify su fallback was used
      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['shell', 'su', '-c']),
        expect.any(Object)
      );
    });

    it('should handle timeout option', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await readSharedPreferences(packageName, {
        timeoutMs: 5000,
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 5000 })
      );
    });

    it('should handle list command throwing error', async () => {
      mockShell.execute.mockRejectedValueOnce(new Error('Device not found'));

      const result = await readSharedPreferences(packageName, { shell: mockShell });

      expect(result).toHaveLength(0);
    });

    it('should skip files that fail to read', async () => {
      mockShell.execute
        // List files
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\nfailed_prefs.xml\n',
          stderr: '',
          exitCode: 0,
        })
        // Read first file successfully
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="key">value</string>
</map>`,
          stderr: '',
          exitCode: 0,
        })
        // Second file fails (run-as)
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Permission denied',
          exitCode: 1,
        })
        // Second file fails (su fallback)
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Permission denied',
          exitCode: 1,
        });

      const result = await readSharedPreferences(packageName, { shell: mockShell });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('app_prefs');
    });
  });

  describe('readPreference', () => {
    const packageName = 'com.example.app';
    const prefsFileName = 'app_prefs';

    it('should read a specific preference by key', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="username">john_doe</string>
    <int name="login_count" value="5" />
</map>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readPreference(packageName, prefsFileName, 'username', {
        shell: mockShell,
      });

      expect(result).toBeDefined();
      expect(result?.key).toBe('username');
      expect(result?.value).toBe('john_doe');
    });

    it('should return null for non-existent key', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: 'app_prefs.xml\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: `<?xml version='1.0' encoding='utf-8' standalone='yes' ?>
<map>
    <string name="username">john_doe</string>
</map>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readPreference(packageName, prefsFileName, 'nonexistent', {
        shell: mockShell,
      });

      expect(result).toBeNull();
    });

    it('should return null when preferences file not found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await readPreference(packageName, prefsFileName, 'key', {
        shell: mockShell,
      });

      expect(result).toBeNull();
    });
  });

  describe('isAppDebuggable', () => {
    const packageName = 'com.example.app';

    it('should return true for debuggable app', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: 'uid=10123(u0_a123) gid=10123(u0_a123) groups=...',
        stderr: '',
        exitCode: 0,
      });

      const result = await isAppDebuggable(packageName, undefined, mockShell);

      expect(result).toBe(true);
      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['shell', 'run-as', packageName, 'id']),
        expect.any(Object)
      );
    });

    it('should return false for non-debuggable app', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'run-as: Package is not debuggable',
        exitCode: 1,
      });

      const result = await isAppDebuggable(packageName, undefined, mockShell);

      expect(result).toBe(false);
    });

    it('should use deviceId when provided', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: 'uid=10123',
        stderr: '',
        exitCode: 0,
      });

      await isAppDebuggable(packageName, 'emulator-5554', mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should return false when execution throws', async () => {
      mockShell.execute.mockRejectedValueOnce(new Error('Device not found'));

      const result = await isAppDebuggable(packageName, undefined, mockShell);

      expect(result).toBe(false);
    });

    it('should use 5000ms timeout', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: 'uid=10123',
        stderr: '',
        exitCode: 0,
      });

      await isAppDebuggable(packageName, undefined, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'adb',
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 5000 })
      );
    });
  });

  describe('getAppDataPath', () => {
    it('should return correct data path for package', () => {
      const path = getAppDataPath('com.example.app');

      expect(path).toBe('/data/data/com.example.app');
    });

    it('should handle package names with multiple segments', () => {
      const path = getAppDataPath('com.example.myapp.debug');

      expect(path).toBe('/data/data/com.example.myapp.debug');
    });
  });

  describe('getSharedPrefsPath', () => {
    it('should return correct shared prefs path for package', () => {
      const path = getSharedPrefsPath('com.example.app');

      expect(path).toBe('/data/data/com.example.app/shared_prefs');
    });

    it('should handle package names with multiple segments', () => {
      const path = getSharedPrefsPath('com.example.myapp.debug');

      expect(path).toBe('/data/data/com.example.myapp.debug/shared_prefs');
    });
  });
});
