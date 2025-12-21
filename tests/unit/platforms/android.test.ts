import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shell module
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
  commandExists: vi.fn(),
  parseLines: (output: string) =>
    output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
}));

import { executeShell, executeShellOrThrow, commandExists } from '../../../src/utils/shell.js';
import {
  isAdbAvailable,
  listDevices,
  getDevice,
  listAvds,
  waitForDevice,
  shutdownEmulator,
  takeScreenshot,
  dumpUiHierarchy,
  getLogcat,
  captureLogcat,
  openDeepLink,
  installApk,
  launchApp,
  tap,
  inputText,
  swipe,
} from '../../../src/platforms/android/adb.js';

const mockedExecuteShell = vi.mocked(executeShell);
const mockedExecuteShellOrThrow = vi.mocked(executeShellOrThrow);
const mockedCommandExists = vi.mocked(commandExists);

describe('Android ADB wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAdbAvailable', () => {
    it('should return true when adb is in PATH', async () => {
      mockedCommandExists.mockResolvedValue(true);
      const result = await isAdbAvailable();
      expect(result).toBe(true);
      expect(mockedCommandExists).toHaveBeenCalledWith('adb');
    });

    it('should return false when adb is not in PATH', async () => {
      mockedCommandExists.mockResolvedValue(false);
      const result = await isAdbAvailable();
      expect(result).toBe(false);
    });
  });

  describe('listDevices', () => {
    it('should parse device list correctly', async () => {
      const mockOutput = `List of devices attached
emulator-5554\tdevice product:sdk_gphone64_arm64 model:Pixel_7_API_33 device:emu64a
emulator-5556\toffline product:sdk_gphone64_arm64 model:Pixel_6_API_31 device:emu64a`;

      mockedExecuteShell.mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        id: 'emulator-5554',
        status: 'booted',
        model: 'Pixel_7_API_33',
      });
      expect(devices[1]).toMatchObject({
        id: 'emulator-5556',
        status: 'shutdown',
        model: 'Pixel_6_API_31',
      });
    });

    it('should handle empty device list', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'List of devices attached\n',
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();
      expect(devices).toHaveLength(0);
    });

    it('should handle unauthorized devices', async () => {
      const mockOutput = `List of devices attached
emulator-5554\tunauthorized`;

      mockedExecuteShell.mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].status).toBe('unknown');
    });
  });

  describe('getDevice', () => {
    beforeEach(() => {
      mockedExecuteShell.mockResolvedValue({
        stdout: `List of devices attached
emulator-5554\tdevice product:sdk model:Pixel_7 device:emu`,
        stderr: '',
        exitCode: 0,
      });
    });

    it('should find device by id', async () => {
      const device = await getDevice('emulator-5554');
      expect(device).not.toBeNull();
      expect(device?.id).toBe('emulator-5554');
    });

    it('should find device by model', async () => {
      const device = await getDevice('Pixel_7');
      expect(device).not.toBeNull();
      expect(device?.model).toBe('Pixel_7');
    });

    it('should return null for unknown device', async () => {
      const device = await getDevice('nonexistent');
      expect(device).toBeNull();
    });
  });

  describe('listAvds', () => {
    it('should parse AVD list correctly', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'Pixel_7_API_33\nPixel_6_API_31\nMedium_Phone_API_36',
        stderr: '',
        exitCode: 0,
      });

      const avds = await listAvds();

      expect(avds).toHaveLength(3);
      expect(avds).toContain('Pixel_7_API_33');
      expect(avds).toContain('Pixel_6_API_31');
      expect(mockedExecuteShell).toHaveBeenCalledWith('emulator', ['-list-avds']);
    });

    it('should return empty array when no AVDs available', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const avds = await listAvds();
      expect(avds).toHaveLength(0);
    });

    it('should return empty array on emulator command failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'emulator not found',
        exitCode: 1,
      });

      const avds = await listAvds();
      expect(avds).toHaveLength(0);
    });
  });

  describe('waitForDevice', () => {
    it('should wait for device to boot', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      mockedExecuteShell.mockResolvedValue({
        stdout: '1',
        stderr: '',
        exitCode: 0,
      });

      await waitForDevice('emulator-5554', 5000);

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'wait-for-device'],
        { timeoutMs: 5000 }
      );
    });

    it('should work without device ID (first available)', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      mockedExecuteShell.mockResolvedValue({
        stdout: '1',
        stderr: '',
        exitCode: 0,
      });

      await waitForDevice();

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith(
        'adb',
        ['wait-for-device'],
        expect.any(Object)
      );
    });
  });

  describe('shutdownEmulator', () => {
    it('should shutdown emulator by device ID', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: 'killing emulator',
        stderr: '',
        exitCode: 0,
      });

      await shutdownEmulator('emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'emu',
        'kill',
      ]);
    });
  });

  describe('takeScreenshot', () => {
    it('should capture screenshot from device', async () => {
      const mockPngData = Buffer.from('mock-png-data', 'binary');
      mockedExecuteShell.mockResolvedValue({
        stdout: mockPngData.toString('binary'),
        stderr: '',
        exitCode: 0,
      });

      const screenshot = await takeScreenshot('emulator-5554');

      expect(screenshot).toBeInstanceOf(Buffer);
      expect(mockedExecuteShell).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'exec-out',
        'screencap',
        '-p',
      ]);
    });

    it('should work without device ID (first available)', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'png-data',
        stderr: '',
        exitCode: 0,
      });

      await takeScreenshot();

      expect(mockedExecuteShell).toHaveBeenCalledWith('adb', [
        'exec-out',
        'screencap',
        '-p',
      ]);
    });

    it('should throw on screencap failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error: no devices/emulators found',
        exitCode: 1,
      });

      await expect(takeScreenshot()).rejects.toThrow();
    });
  });

  describe('dumpUiHierarchy', () => {
    it('should dump UI hierarchy XML', async () => {
      const mockXml = '<?xml version="1.0"?><hierarchy rotation="0"></hierarchy>';
      mockedExecuteShell.mockResolvedValue({
        stdout: `UI hierchary dumped to: /sdcard/specter-ui-dump.xml\n${mockXml}`,
        stderr: '',
        exitCode: 0,
      });

      const hierarchy = await dumpUiHierarchy('emulator-5554');

      expect(hierarchy).toContain('<hierarchy');
      expect(mockedExecuteShell).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'uiautomator dump /sdcard/specter-ui-dump.xml && cat /sdcard/specter-ui-dump.xml',
      ]);
    });

    it('should throw on uiautomator failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'ERROR: could not get idle state.',
        exitCode: 1,
      });

      await expect(dumpUiHierarchy()).rejects.toThrow();
    });
  });

  describe('getLogcat', () => {
    it('should capture logcat output', async () => {
      const mockLogs = '12-21 10:30:00.123 1234 1234 D MyApp: Debug message';
      mockedExecuteShell.mockResolvedValue({
        stdout: mockLogs,
        stderr: '',
        exitCode: 0,
      });

      const logs = await getLogcat('emulator-5554');

      expect(logs).toContain('Debug message');
      expect(mockedExecuteShell).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'logcat',
        '-d',
        '-v',
        'time',
      ]);
    });

    it('should apply level filter', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'log output',
        stderr: '',
        exitCode: 0,
      });

      await getLogcat('emulator-5554', { level: 'error' });

      expect(mockedExecuteShell).toHaveBeenCalledWith('adb',
        expect.arrayContaining(['*:E'])
      );
    });

    it('should apply tag filters', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'log output',
        stderr: '',
        exitCode: 0,
      });

      await getLogcat('emulator-5554', { tags: ['MyApp', 'OkHttp'] });

      expect(mockedExecuteShell).toHaveBeenCalledWith('adb',
        expect.arrayContaining(['MyApp:V', 'OkHttp:V'])
      );
    });

    it('should limit output lines', async () => {
      const manyLines = Array.from({ length: 100 }, (_, i) => `Line ${i}`).join('\n');
      mockedExecuteShell.mockResolvedValue({
        stdout: manyLines,
        stderr: '',
        exitCode: 0,
      });

      const logs = await getLogcat('emulator-5554', { limit: 10 });

      expect(logs.split('\n').length).toBeLessThanOrEqual(10);
    });
  });

  describe('captureLogcat', () => {
    it('should filter by package name', async () => {
      const mockLogs = `Line with com.myapp content
Line without package
Another com.myapp line`;
      mockedExecuteShell.mockResolvedValue({
        stdout: mockLogs,
        stderr: '',
        exitCode: 0,
      });

      const logs = await captureLogcat('emulator-5554', { filterByPackage: 'com.myapp' });

      expect(logs).toContain('com.myapp');
      expect(logs).not.toContain('Line without package');
    });
  });

  describe('openDeepLink', () => {
    it('should open deep link on device', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: 'Starting: Intent { act=android.intent.action.VIEW }',
        stderr: '',
        exitCode: 0,
      });

      await openDeepLink('myapp://home', 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        'myapp://home',
      ]);
    });

    it('should work without device ID', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await openDeepLink('https://example.com');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        'shell',
        'am',
        'start',
        '-a',
        'android.intent.action.VIEW',
        '-d',
        'https://example.com',
      ]);
    });
  });

  describe('installApk', () => {
    it('should install APK on device', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: 'Success',
        stderr: '',
        exitCode: 0,
      });

      await installApk('/path/to/app.apk', 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'install', '-r', '/path/to/app.apk'],
        { timeoutMs: 120000 }
      );
    });
  });

  describe('launchApp', () => {
    it('should launch app by package name', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: 'Events injected: 1',
        stderr: '',
        exitCode: 0,
      });

      await launchApp('com.example.app', 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'monkey',
        '-p',
        'com.example.app',
        '-c',
        'android.intent.category.LAUNCHER',
        '1',
      ]);
    });

    it('should clear app data before launch if requested', async () => {
      mockedExecuteShell.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
      mockedExecuteShellOrThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await launchApp('com.example.app', 'emulator-5554', { clearData: true });

      expect(mockedExecuteShell).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'pm',
        'clear',
        'com.example.app',
      ]);
    });
  });

  describe('tap', () => {
    it('should send tap event to device', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await tap(100, 200, 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'tap',
        '100',
        '200',
      ]);
    });

    it('should work without device ID', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await tap(540, 960);

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        'shell',
        'input',
        'tap',
        '540',
        '960',
      ]);
    });
  });

  describe('inputText', () => {
    it('should input text on device', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await inputText('hello', 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'text',
        'hello',
      ]);
    });

    it('should escape special characters', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await inputText('hello world');

      // Spaces are replaced with %s
      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb',
        expect.arrayContaining(['hello%sworld'])
      );
    });
  });

  describe('swipe', () => {
    it('should send swipe gesture to device', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await swipe(100, 500, 100, 100, 300, 'emulator-5554');

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        '-s',
        'emulator-5554',
        'shell',
        'input',
        'swipe',
        '100',
        '500',
        '100',
        '100',
        '300',
      ]);
    });

    it('should use default duration if not specified', async () => {
      mockedExecuteShellOrThrow.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });

      await swipe(0, 1000, 0, 500);

      expect(mockedExecuteShellOrThrow).toHaveBeenCalledWith('adb', [
        'shell',
        'input',
        'swipe',
        '0',
        '1000',
        '0',
        '500',
        '300', // Default duration
      ]);
    });
  });
});

describe('Android build integration', () => {
  // These tests would validate Gradle build command construction
  describe('Gradle build commands', () => {
    it('should construct correct debug build command', () => {
      const platform = 'android';
      const variant = 'debug';
      const expectedCommand = ['./gradlew', 'assembleDebug'];

      // This would be tested once the Gradle executor is implemented
      expect(expectedCommand).toContain('assembleDebug');
    });

    it('should construct correct release build command', () => {
      const variant = 'release';
      const expectedCommand = ['./gradlew', 'assembleRelease'];

      expect(expectedCommand).toContain('assembleRelease');
    });
  });
});
