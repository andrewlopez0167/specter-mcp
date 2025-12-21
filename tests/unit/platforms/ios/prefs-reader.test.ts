/**
 * iOS UserDefaults/Preferences Reader Unit Tests
 * Tests using dependency-injected shell executor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  readUserDefaults,
  readDefaultsDomain,
  getAppContainerPath,
  listInstalledApps,
  isAppInstalled,
  ReadPreferencesOptions,
} from '../../../../src/platforms/ios/prefs-reader.js';
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

describe('iOS UserDefaults/Preferences Reader', () => {
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockShell = createMockShell();
  });

  describe('readUserDefaults', () => {
    const bundleId = 'com.example.app';

    it('should read UserDefaults successfully', async () => {
      // Mock get_app_container
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: '/Users/test/Library/Developer/CoreSimulator/Devices/123/data/Containers/Data/Application/456',
          stderr: '',
          exitCode: 0,
        })
        // Mock listing plist files
        .mockResolvedValueOnce({
          stdout: 'com.example.app.plist\nSettings.plist\n',
          stderr: '',
          exitCode: 0,
        })
        // Mock reading first plist file (plutil convert)
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>username</key>
    <string>john_doe</string>
    <key>loginCount</key>
    <integer>5</integer>
</dict>
</plist>`,
          stderr: '',
          exitCode: 0,
        })
        // Mock reading second plist file
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>darkMode</key>
    <true/>
</dict>
</plist>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readUserDefaults(bundleId, { shell: mockShell });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('com.example.app');
      expect(result[1].name).toBe('Settings');
    });

    it('should filter by fileName when specified', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: '/path/to/container',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: 'com.example.app.plist\nSettings.plist\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>key</key><string>value</string></dict></plist>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readUserDefaults(bundleId, {
        fileName: 'Settings',
        shell: mockShell,
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Settings');
    });

    it('should return empty array when container path not found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'App not installed',
        exitCode: 1,
      });

      const result = await readUserDefaults(bundleId, { shell: mockShell });

      expect(result).toHaveLength(0);
    });

    it('should try bundle ID plist directly when no files listed', async () => {
      mockShell.execute
        // Container path
        .mockResolvedValueOnce({
          stdout: '/path/to/container',
          stderr: '',
          exitCode: 0,
        })
        // List returns empty
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        })
        // Try reading bundle ID plist directly
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>key</key><string>value</string></dict></plist>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readUserDefaults(bundleId, { shell: mockShell });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe(bundleId);
    });

    it('should use custom deviceId when provided', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 1,
      });

      await readUserDefaults(bundleId, {
        deviceId: 'ABCD-1234-5678',
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['ABCD-1234-5678']),
        expect.any(Object)
      );
    });

    it('should handle timeout option', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 1,
      });

      await readUserDefaults(bundleId, {
        timeoutMs: 5000,
        shell: mockShell,
      });

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.any(Array),
        expect.objectContaining({ timeoutMs: 5000 })
      );
    });

    it('should fall back to cat when plutil fails', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: '/path/to/container',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: 'test.plist\n',
          stderr: '',
          exitCode: 0,
        })
        // plutil fails
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'plutil failed',
          exitCode: 1,
        })
        // cat succeeds
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>key</key><string>value</string></dict></plist>`,
          stderr: '',
          exitCode: 0,
        });

      const result = await readUserDefaults(bundleId, { shell: mockShell });

      expect(result).toHaveLength(1);
      // Verify cat was called
      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['cat']),
        expect.any(Object)
      );
    });

    it('should skip files that fail to read', async () => {
      mockShell.execute
        .mockResolvedValueOnce({
          stdout: '/path/to/container',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: 'good.plist\nbad.plist\n',
          stderr: '',
          exitCode: 0,
        })
        // First file succeeds
        .mockResolvedValueOnce({
          stdout: `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>key</key><string>value</string></dict></plist>`,
          stderr: '',
          exitCode: 0,
        })
        // Second file fails (plutil)
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Error',
          exitCode: 1,
        })
        // Second file fails (cat fallback)
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Error',
          exitCode: 1,
        });

      const result = await readUserDefaults(bundleId, { shell: mockShell });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('good');
    });
  });

  describe('getAppContainerPath', () => {
    const bundleId = 'com.example.app';

    it('should return container path when app is found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '/path/to/container\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await getAppContainerPath(bundleId, 'booted', 5000, mockShell);

      expect(result).toBe('/path/to/container');
      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'get_app_container', 'booted', bundleId, 'data'],
        expect.any(Object)
      );
    });

    it('should return null when app is not found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'App not installed',
        exitCode: 1,
      });

      const result = await getAppContainerPath(bundleId, 'booted', 5000, mockShell);

      expect(result).toBeNull();
    });

    it('should use custom deviceId', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '/path/to/container',
        stderr: '',
        exitCode: 0,
      });

      await getAppContainerPath(bundleId, 'DEVICE-123', 5000, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['DEVICE-123']),
        expect.any(Object)
      );
    });

    it('should return null when execution throws', async () => {
      mockShell.execute.mockRejectedValueOnce(new Error('Command failed'));

      const result = await getAppContainerPath(bundleId, 'booted', 5000, mockShell);

      expect(result).toBeNull();
    });
  });

  describe('readDefaultsDomain', () => {
    const bundleId = 'com.example.app';

    it('should read defaults domain successfully', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: `{
    username = "john_doe";
    loginCount = 5;
    isEnabled = 1;
    temperature = "23.5";
}`,
        stderr: '',
        exitCode: 0,
      });

      const result = await readDefaultsDomain(bundleId, 'booted', 10000, mockShell);

      expect(result).not.toBeNull();
      expect(result!.name).toBe(bundleId);
      expect(result!.entries.length).toBeGreaterThan(0);
    });

    it('should return null when domain not found', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Domain does not exist',
        exitCode: 1,
      });

      const result = await readDefaultsDomain(bundleId, 'booted', 10000, mockShell);

      expect(result).toBeNull();
    });

    it('should use custom deviceId', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '{}',
        stderr: '',
        exitCode: 0,
      });

      await readDefaultsDomain(bundleId, 'DEVICE-456', 10000, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['DEVICE-456']),
        expect.any(Object)
      );
    });

    it('should return null when execution throws', async () => {
      mockShell.execute.mockRejectedValueOnce(new Error('Command failed'));

      const result = await readDefaultsDomain(bundleId, 'booted', 10000, mockShell);

      expect(result).toBeNull();
    });

    it('should parse boolean values based on key names', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: `{
    isEnabled = 1;
    enableNotifications = 0;
    count = 1;
}`,
        stderr: '',
        exitCode: 0,
      });

      const result = await readDefaultsDomain(bundleId, 'booted', 10000, mockShell);

      expect(result).not.toBeNull();
      // isEnabled should be boolean true
      const isEnabled = result!.entries.find((e) => e.key === 'isEnabled');
      expect(isEnabled?.type).toBe('boolean');
      expect(isEnabled?.value).toBe(true);

      // enableNotifications should be boolean false
      const enableNotifications = result!.entries.find((e) => e.key === 'enableNotifications');
      expect(enableNotifications?.type).toBe('boolean');
      expect(enableNotifications?.value).toBe(false);

      // count should be int (no enable/is pattern)
      const count = result!.entries.find((e) => e.key === 'count');
      expect(count?.type).toBe('int');
      expect(count?.value).toBe(1);
    });
  });

  describe('listInstalledApps', () => {
    it('should list installed apps', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: `{
    CFBundleIdentifier = "com.example.app1";
    CFBundleName = "App 1";
}
{
    CFBundleIdentifier = "com.example.app2";
    CFBundleName = "App 2";
}`,
        stderr: '',
        exitCode: 0,
      });

      const result = await listInstalledApps('booted', 10000, mockShell);

      expect(result).toHaveLength(2);
      expect(result).toContain('com.example.app1');
      expect(result).toContain('com.example.app2');
    });

    it('should return empty array when command fails', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'Error',
        exitCode: 1,
      });

      const result = await listInstalledApps('booted', 10000, mockShell);

      expect(result).toHaveLength(0);
    });

    it('should use custom deviceId', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await listInstalledApps('DEVICE-789', 10000, mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        ['simctl', 'listapps', 'DEVICE-789'],
        expect.any(Object)
      );
    });

    it('should return empty array when execution throws', async () => {
      mockShell.execute.mockRejectedValueOnce(new Error('Command failed'));

      const result = await listInstalledApps('booted', 10000, mockShell);

      expect(result).toHaveLength(0);
    });
  });

  describe('isAppInstalled', () => {
    const bundleId = 'com.example.app';

    it('should return true when app is installed', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '/path/to/container',
        stderr: '',
        exitCode: 0,
      });

      const result = await isAppInstalled(bundleId, 'booted', mockShell);

      expect(result).toBe(true);
    });

    it('should return false when app is not installed', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '',
        stderr: 'App not found',
        exitCode: 1,
      });

      const result = await isAppInstalled(bundleId, 'booted', mockShell);

      expect(result).toBe(false);
    });

    it('should use custom deviceId', async () => {
      mockShell.execute.mockResolvedValueOnce({
        stdout: '/path/to/container',
        stderr: '',
        exitCode: 0,
      });

      await isAppInstalled(bundleId, 'DEVICE-ABC', mockShell);

      expect(mockShell.execute).toHaveBeenCalledWith(
        'xcrun',
        expect.arrayContaining(['DEVICE-ABC']),
        expect.any(Object)
      );
    });
  });
});
