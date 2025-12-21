import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shell module
vi.mock('../../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
}));

import { executeShell } from '../../../../src/utils/shell.js';
import {
  openAndroidDeepLink,
  isValidUri,
  isAppInstalled,
  getCurrentActivity,
  sendBroadcast,
} from '../../../../src/platforms/android/deep-link.js';

const mockedExecuteShell = vi.mocked(executeShell);

describe('Android Deep Link Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isValidUri', () => {
    it('should return true for valid custom scheme URIs', () => {
      expect(isValidUri('myapp://home')).toBe(true);
      expect(isValidUri('myapp://products/123')).toBe(true);
      expect(isValidUri('app.custom://path/to/resource')).toBe(true);
    });

    it('should return true for valid https URIs', () => {
      expect(isValidUri('https://example.com')).toBe(true);
      expect(isValidUri('https://example.com/path?query=1')).toBe(true);
      expect(isValidUri('http://localhost:3000')).toBe(true);
    });

    it('should return false for invalid URIs', () => {
      expect(isValidUri('')).toBe(false);
      expect(isValidUri('not-a-uri')).toBe(false);
      expect(isValidUri('://missing-scheme')).toBe(false);
      expect(isValidUri('scheme-only://')).toBe(false);
    });

    it('should return false for URIs without scheme separator', () => {
      expect(isValidUri('myapp:home')).toBe(false);
      expect(isValidUri('file:/single-slash')).toBe(false);
    });
  });

  describe('openAndroidDeepLink', () => {
    it('should open deep link successfully', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent { act=android.intent.action.VIEW dat=myapp://home cmp=com.example.app/.MainActivity }',
        stderr: '',
        exitCode: 0,
      });

      const result = await openAndroidDeepLink('myapp://home');

      expect(result.success).toBe(true);
      expect(result.uri).toBe('myapp://home');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should include device ID in command when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', { deviceId: 'emulator-5554' });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should return error for invalid URI', async () => {
      const result = await openAndroidDeepLink('not-a-valid-uri');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid URI');
    });

    it('should handle no devices connected', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error: no devices/emulators found',
        exitCode: 1,
      });

      const result = await openAndroidDeepLink('myapp://home');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No Android device connected');
    });

    it('should handle activity not found', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Error: Activity not found',
        stderr: '',
        exitCode: 1,
      });

      const result = await openAndroidDeepLink('myapp://unknown');

      expect(result.success).toBe(false);
      expect(result.error).toContain('No app can handle this deep link');
    });

    it('should handle security exception', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'Security exception: permission denied',
        exitCode: 1,
      });

      const result = await openAndroidDeepLink('myapp://secure');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Security exception');
    });

    it('should include custom action in command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', {
        action: 'com.example.CUSTOM_ACTION',
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-a', 'com.example.CUSTOM_ACTION']),
        expect.any(Object)
      );
    });

    it('should include package name in command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', {
        packageName: 'com.example.app',
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-p', 'com.example.app']),
        expect.any(Object)
      );
    });

    it('should include component when both package and activity are provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', {
        packageName: 'com.example.app',
        activityName: '.DeepLinkActivity',
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-n', 'com.example.app/.DeepLinkActivity']),
        expect.any(Object)
      );
    });

    it('should include category in command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', {
        category: 'android.intent.category.DEFAULT',
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-c', 'android.intent.category.DEFAULT']),
        expect.any(Object)
      );
    });

    it('should include intent extras in command', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', {
        extras: [
          { type: 'string', key: 'userId', value: '123' },
          { type: 'int', key: 'count', value: 5 },
          { type: 'boolean', key: 'isNew', value: true },
        ],
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['--es', 'userId', '123']),
        expect.any(Object)
      );
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['--ei', 'count', '5']),
        expect.any(Object)
      );
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['--ez', 'isNew', 'true']),
        expect.any(Object)
      );
    });

    it('should wait for launch when waitForLaunch is true', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent {}',
        stderr: '',
        exitCode: 0,
      });

      await openAndroidDeepLink('myapp://home', { waitForLaunch: true });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-W']),
        expect.any(Object)
      );
    });

    it('should parse launched activity from success output', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Starting: Intent { act=android.intent.action.VIEW dat=myapp://home cmp=com.example.app/.MainActivity }',
        stderr: '',
        exitCode: 0,
      });

      const result = await openAndroidDeepLink('myapp://home');

      expect(result.success).toBe(true);
      expect(result.details).toContain('com.example.app/.MainActivity');
    });
  });

  describe('isAppInstalled', () => {
    it('should return true when app is installed', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'package:com.example.app\n',
        stderr: '',
        exitCode: 0,
      });

      const result = await isAppInstalled('com.example.app');

      expect(result).toBe(true);
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['shell', 'pm', 'list', 'packages', 'com.example.app'],
        expect.any(Object)
      );
    });

    it('should return false when app is not installed', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await isAppInstalled('com.nonexistent.app');

      expect(result).toBe(false);
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'package:com.example.app',
        stderr: '',
        exitCode: 0,
      });

      await isAppInstalled('com.example.app', 'emulator-5554');

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'pm', 'list', 'packages', 'com.example.app'],
        expect.any(Object)
      );
    });

    it('should return false on command failure', async () => {
      mockedExecuteShell.mockRejectedValue(new Error('Command failed'));

      const result = await isAppInstalled('com.example.app');

      expect(result).toBe(false);
    });
  });

  describe('getCurrentActivity', () => {
    it('should return current resumed activity', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: `
          mResumedActivity: ActivityRecord{abc com.example.app/.MainActivity}
        `,
        stderr: '',
        exitCode: 0,
      });

      const activity = await getCurrentActivity();

      expect(activity).toBe('com.example.app/.MainActivity');
    });

    it('should fallback to focused activity', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: `
          mFocusedActivity: ActivityRecord{abc com.other.app/.OtherActivity}
        `,
        stderr: '',
        exitCode: 0,
      });

      const activity = await getCurrentActivity();

      expect(activity).toBe('com.other.app/.OtherActivity');
    });

    it('should return undefined when no activity found', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Some output without activity info',
        stderr: '',
        exitCode: 0,
      });

      const activity = await getCurrentActivity();

      expect(activity).toBeUndefined();
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'mResumedActivity: com.example.app/.MainActivity',
        stderr: '',
        exitCode: 0,
      });

      await getCurrentActivity('emulator-5554');

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'shell', 'dumpsys', 'activity', 'activities'],
        expect.any(Object)
      );
    });

    it('should return undefined on command failure', async () => {
      mockedExecuteShell.mockRejectedValue(new Error('Command failed'));

      const activity = await getCurrentActivity();

      expect(activity).toBeUndefined();
    });
  });

  describe('sendBroadcast', () => {
    it('should send broadcast successfully', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Broadcast completed: result=0',
        stderr: '',
        exitCode: 0,
      });

      const result = await sendBroadcast('com.example.ACTION_TEST');

      expect(result.success).toBe(true);
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['shell', 'am', 'broadcast', '-a', 'com.example.ACTION_TEST'],
        expect.any(Object)
      );
    });

    it('should include device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await sendBroadcast('com.example.ACTION_TEST', { deviceId: 'emulator-5554' });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should include package name when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await sendBroadcast('com.example.ACTION_TEST', { packageName: 'com.example.app' });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-p', 'com.example.app']),
        expect.any(Object)
      );
    });

    it('should include extras when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await sendBroadcast('com.example.ACTION_TEST', {
        extras: [
          { type: 'string', key: 'message', value: 'hello' },
        ],
      });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['--es', 'message', 'hello']),
        expect.any(Object)
      );
    });

    it('should return error on broadcast failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'Error: permission denied',
        exitCode: 1,
      });

      const result = await sendBroadcast('com.example.ACTION_TEST');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle exception during execution', async () => {
      mockedExecuteShell.mockRejectedValue(new Error('Network error'));

      const result = await sendBroadcast('com.example.ACTION_TEST');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });
});
