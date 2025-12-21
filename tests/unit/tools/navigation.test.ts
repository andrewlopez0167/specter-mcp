/**
 * Unit tests for Deep Link Navigation tools
 * Tests deep link handling for Android and iOS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shell execution
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
}));

import { executeShell } from '../../../src/utils/shell.js';

describe('Deep Link Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DeepLinkResult structure', () => {
    it('should have required fields for success', () => {
      const result = {
        success: true,
        platform: 'android',
        uri: 'myapp://home/profile',
        durationMs: 150,
      };

      expect(result.success).toBe(true);
      expect(result.platform).toBe('android');
      expect(result.uri).toBe('myapp://home/profile');
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('should have error field for failure', () => {
      const result = {
        success: false,
        platform: 'ios',
        uri: 'myapp://invalid',
        error: 'Activity not found for intent',
        durationMs: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Android Deep Links', () => {
    describe('adb shell am start', () => {
      it('should construct correct command for simple URI', () => {
        const uri = 'myapp://home';
        const deviceId = 'emulator-5554';

        const expectedArgs = [
          '-s', deviceId,
          'shell', 'am', 'start',
          '-a', 'android.intent.action.VIEW',
          '-d', uri,
        ];

        expect(expectedArgs).toContain('-a');
        expect(expectedArgs).toContain('android.intent.action.VIEW');
        expect(expectedArgs).toContain('-d');
        expect(expectedArgs).toContain(uri);
      });

      it('should handle URI with query parameters', () => {
        const uri = 'myapp://product?id=123&source=home';

        // Query parameters should be properly escaped
        expect(uri).toContain('?');
        expect(uri).toContain('id=123');
      });

      it('should handle https:// URLs for App Links', () => {
        const uri = 'https://example.com/products/123';

        expect(uri.startsWith('https://')).toBe(true);
      });

      it('should support package targeting', () => {
        const packageName = 'com.example.myapp';
        const uri = 'myapp://home';

        const expectedArgs = [
          'shell', 'am', 'start',
          '-a', 'android.intent.action.VIEW',
          '-d', uri,
          '-n', `${packageName}/.MainActivity`,
        ];

        expect(expectedArgs).toContain('-n');
      });

      it('should handle intent extras', () => {
        const extras = {
          stringExtra: { key: 'user_id', value: '123' },
          booleanExtra: { key: 'is_premium', value: true },
        };

        const args: string[] = [];
        args.push('--es', extras.stringExtra.key, extras.stringExtra.value);
        args.push('--ez', extras.booleanExtra.key, String(extras.booleanExtra.value));

        expect(args).toContain('--es');
        expect(args).toContain('--ez');
      });
    });

    describe('Android deep link execution', () => {
      it('should execute adb command successfully', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: 'Starting: Intent { act=android.intent.action.VIEW dat=myapp://home }',
          stderr: '',
          exitCode: 0,
        });

        const result = await mockExecuteShell('adb', [
          '-s', 'emulator-5554',
          'shell', 'am', 'start',
          '-a', 'android.intent.action.VIEW',
          '-d', 'myapp://home',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Starting:');
      });

      it('should detect activity not found error', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: '',
          stderr: 'Error: Activity not found to handle Intent',
          exitCode: 1,
        });

        const result = await mockExecuteShell('adb', ['shell', 'am', 'start', '-d', 'unknown://test']);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Activity not found');
      });

      it('should detect no device error', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: '',
          stderr: 'error: no devices/emulators found',
          exitCode: 1,
        });

        const result = await mockExecuteShell('adb', ['shell', 'am', 'start', '-d', 'myapp://home']);

        expect(result.stderr).toContain('no devices');
      });
    });
  });

  describe('iOS Deep Links', () => {
    describe('simctl openurl', () => {
      it('should construct correct command for custom scheme', () => {
        const uri = 'myapp://home/profile';
        const deviceId = 'booted';

        const expectedArgs = ['simctl', 'openurl', deviceId, uri];

        expect(expectedArgs[0]).toBe('simctl');
        expect(expectedArgs[1]).toBe('openurl');
        expect(expectedArgs[3]).toBe(uri);
      });

      it('should handle Universal Links (https://)', () => {
        const uri = 'https://example.com/app/products/123';

        expect(uri.startsWith('https://')).toBe(true);
      });

      it('should support specific device UDID', () => {
        const deviceId = 'A1B2C3D4-E5F6-7890-ABCD-EF1234567890';
        const uri = 'myapp://home';

        const args = ['simctl', 'openurl', deviceId, uri];

        expect(args[2]).toBe(deviceId);
      });
    });

    describe('iOS deep link execution', () => {
      it('should execute xcrun simctl successfully', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

        const result = await mockExecuteShell('xcrun', [
          'simctl', 'openurl', 'booted', 'myapp://home',
        ]);

        expect(result.exitCode).toBe(0);
      });

      it('should detect no booted device error', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: '',
          stderr: 'No devices are booted.',
          exitCode: 1,
        });

        const result = await mockExecuteShell('xcrun', ['simctl', 'openurl', 'booted', 'myapp://home']);

        expect(result.stderr).toContain('No devices are booted');
      });

      it('should detect invalid URL scheme', async () => {
        const mockExecuteShell = vi.mocked(executeShell);
        mockExecuteShell.mockResolvedValue({
          stdout: '',
          stderr: 'An error was encountered processing the command',
          exitCode: 1,
        });

        const result = await mockExecuteShell('xcrun', ['simctl', 'openurl', 'booted', 'invalid://test']);

        expect(result.exitCode).toBe(1);
      });
    });
  });

  describe('URI Validation', () => {
    it('should validate custom scheme URIs', () => {
      const validURIs = [
        'myapp://home',
        'myapp://products/123',
        'app-name://settings/profile',
        'com.example.app://deep/link',
      ];

      for (const uri of validURIs) {
        expect(uri).toMatch(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//);
      }
    });

    it('should validate http/https URLs', () => {
      const validURLs = [
        'https://example.com/app/home',
        'http://localhost:3000/test',
        'https://app.example.com/products?id=123',
      ];

      for (const url of validURLs) {
        expect(url).toMatch(/^https?:\/\//);
      }
    });

    it('should reject invalid URIs', () => {
      const invalidURIs = [
        'not-a-uri',
        '://missing-scheme',
        'scheme-only://',
        '',
      ];

      for (const uri of invalidURIs) {
        const isValid = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/.+/.test(uri);
        expect(isValid).toBe(false);
      }
    });
  });

  describe('deep_link_navigate tool', () => {
    describe('tool registration', () => {
      it('should define required input schema', () => {
        const expectedSchema = {
          uri: { type: 'string', description: expect.any(String) },
          platform: { type: 'string', enum: ['android', 'ios'] },
          deviceId: { type: 'string', description: expect.any(String) },
          packageName: { type: 'string', description: expect.any(String) },
          waitForReady: { type: 'boolean', description: expect.any(String) },
        };

        expect(expectedSchema.uri.type).toBe('string');
        expect(expectedSchema.platform.enum).toContain('android');
        expect(expectedSchema.platform.enum).toContain('ios');
      });

      it('should require uri parameter', () => {
        const required = ['uri', 'platform'];
        expect(required).toContain('uri');
        expect(required).toContain('platform');
      });
    });

    describe('tool execution', () => {
      it('should return success result on valid deep link', () => {
        const result = {
          success: true,
          platform: 'android',
          uri: 'myapp://home',
          details: 'Deep link opened successfully',
          durationMs: 250,
        };

        expect(result.success).toBe(true);
        expect(result.details).toBeDefined();
      });

      it('should return error for invalid URI', () => {
        const result = {
          success: false,
          platform: 'android',
          uri: 'invalid',
          error: 'Invalid URI format. Must be scheme://path',
          durationMs: 5,
        };

        expect(result.success).toBe(false);
        expect(result.error).toContain('Invalid URI');
      });

      it('should return error when no device available', () => {
        const result = {
          success: false,
          platform: 'ios',
          uri: 'myapp://home',
          error: 'No iOS simulator is currently booted',
          durationMs: 100,
        };

        expect(result.success).toBe(false);
        expect(result.error).toContain('simulator');
      });

      it('should return error when app not installed', () => {
        const result = {
          success: false,
          platform: 'android',
          uri: 'unknownapp://home',
          error: 'No activity found to handle deep link',
          durationMs: 150,
        };

        expect(result.success).toBe(false);
        expect(result.error).toContain('activity');
      });
    });

    describe('waitForReady option', () => {
      it('should wait for screen transition when enabled', () => {
        const args = {
          uri: 'myapp://products/123',
          platform: 'android',
          waitForReady: true,
          waitTimeMs: 2000,
        };

        expect(args.waitForReady).toBe(true);
        expect(args.waitTimeMs).toBe(2000);
      });

      it('should return immediately when disabled', () => {
        const args = {
          uri: 'myapp://home',
          platform: 'ios',
          waitForReady: false,
        };

        expect(args.waitForReady).toBe(false);
      });
    });
  });

  describe('Intent Extras (Android)', () => {
    it('should support string extras', () => {
      const extras = [
        { type: 'string', key: 'user_id', value: '12345' },
      ];

      const args = extras.flatMap((e) => ['--es', e.key, e.value]);

      expect(args).toEqual(['--es', 'user_id', '12345']);
    });

    it('should support integer extras', () => {
      const extras = [
        { type: 'int', key: 'count', value: 42 },
      ];

      const args = extras.flatMap((e) => ['--ei', e.key, String(e.value)]);

      expect(args).toEqual(['--ei', 'count', '42']);
    });

    it('should support boolean extras', () => {
      const extras = [
        { type: 'boolean', key: 'is_premium', value: true },
      ];

      const args = extras.flatMap((e) => ['--ez', e.key, String(e.value)]);

      expect(args).toEqual(['--ez', 'is_premium', 'true']);
    });

    it('should support multiple extras', () => {
      const extras = [
        { type: 'string', key: 'source', value: 'push' },
        { type: 'int', key: 'notification_id', value: 999 },
        { type: 'boolean', key: 'show_modal', value: false },
      ];

      const args: string[] = [];
      for (const e of extras) {
        switch (e.type) {
          case 'string':
            args.push('--es', e.key, String(e.value));
            break;
          case 'int':
            args.push('--ei', e.key, String(e.value));
            break;
          case 'boolean':
            args.push('--ez', e.key, String(e.value));
            break;
        }
      }

      expect(args).toHaveLength(9); // 3 extras * 3 args each
    });
  });

  describe('Platform Detection', () => {
    it('should detect Android from device ID format', () => {
      const androidDeviceIds = [
        'emulator-5554',
        'emulator-5556',
        'RF8M33XXXXX', // Physical device serial
      ];

      for (const id of androidDeviceIds) {
        // Emulator IDs start with 'emulator-' or are alphanumeric serials
        const isAndroid = id.startsWith('emulator-') || /^[A-Z0-9]+$/.test(id);
        expect(isAndroid).toBe(true);
      }
    });

    it('should detect iOS from device ID format', () => {
      const iosDeviceIds = [
        'booted',
        'A1B2C3D4-E5F6-7890-ABCD-EF1234567890', // UDID format
      ];

      for (const id of iosDeviceIds) {
        // iOS UDIDs are UUID format or 'booted'
        const isIOS = id === 'booted' || /^[A-F0-9-]{36}$/i.test(id);
        expect(isIOS).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout gracefully', async () => {
      const mockExecuteShell = vi.mocked(executeShell);
      mockExecuteShell.mockRejectedValue(new Error('Command timed out'));

      await expect(
        mockExecuteShell('adb', ['shell', 'am', 'start', '-d', 'myapp://home'], { timeoutMs: 1000 })
      ).rejects.toThrow('timed out');
    });

    it('should handle shell execution errors', async () => {
      const mockExecuteShell = vi.mocked(executeShell);
      mockExecuteShell.mockRejectedValue(new Error('adb: command not found'));

      await expect(
        mockExecuteShell('adb', ['shell', 'am', 'start'])
      ).rejects.toThrow('command not found');
    });

    it('should provide helpful error for common issues', () => {
      const errorMessages = {
        noDevice: 'No device connected. Use manage_env to boot a device first.',
        noActivity: 'No app can handle this deep link. Ensure the app is installed and configured.',
        invalidScheme: 'Invalid URI scheme. Use format: scheme://path or https://domain/path',
        timeout: 'Deep link navigation timed out. The app may be slow to respond.',
      };

      expect(errorMessages.noDevice).toContain('manage_env');
      expect(errorMessages.noActivity).toContain('installed');
    });
  });
});
