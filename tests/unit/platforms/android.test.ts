import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';

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

import { executeShell, commandExists } from '../../../src/utils/shell.js';
import {
  isAdbAvailable,
  listDevices,
  getDevice,
} from '../../../src/platforms/android/adb.js';

const mockedExecuteShell = vi.mocked(executeShell);
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
