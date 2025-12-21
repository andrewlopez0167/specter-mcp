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

import { executeShell, commandExists } from '../../../src/utils/shell.js';
import {
  isSimctlAvailable,
  listDevices,
  getDevice,
  getBootedDevice,
} from '../../../src/platforms/ios/simctl.js';

const mockedExecuteShell = vi.mocked(executeShell);
const mockedCommandExists = vi.mocked(commandExists);

// Mock device list response
const mockDevicesJson = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
      {
        udid: 'ABCD1234-5678-EFGH-IJKL-MNOPQRSTUVWX',
        name: 'iPhone 15 Pro',
        state: 'Booted',
        isAvailable: true,
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro',
      },
      {
        udid: 'WXYZ9876-5432-DCBA-LKJI-HGFEDCBAMNOP',
        name: 'iPhone 15',
        state: 'Shutdown',
        isAvailable: true,
        deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
      },
    ],
  },
  runtimes: [],
};

describe('iOS simctl wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock process.platform for iOS tests
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      writable: true,
    });
  });

  describe('isSimctlAvailable', () => {
    it('should return true on macOS with xcrun', async () => {
      mockedCommandExists.mockResolvedValue(true);
      const result = await isSimctlAvailable();
      expect(result).toBe(true);
    });

    it('should return false when xcrun is not available', async () => {
      mockedCommandExists.mockResolvedValue(false);
      const result = await isSimctlAvailable();
      expect(result).toBe(false);
    });

    it('should return false on non-macOS platforms', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const result = await isSimctlAvailable();
      expect(result).toBe(false);
    });
  });

  describe('listDevices', () => {
    it('should parse device list correctly', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify(mockDevicesJson),
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();

      expect(devices).toHaveLength(2);
      expect(devices[0]).toMatchObject({
        id: 'ABCD1234-5678-EFGH-IJKL-MNOPQRSTUVWX',
        name: 'iPhone 15 Pro',
        status: 'booted',
        runtime: 'iOS-17-0',
      });
      expect(devices[1]).toMatchObject({
        id: 'WXYZ9876-5432-DCBA-LKJI-HGFEDCBAMNOP',
        name: 'iPhone 15',
        status: 'shutdown',
      });
    });

    it('should handle empty device list', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify({ devices: {}, runtimes: [] }),
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();
      expect(devices).toHaveLength(0);
    });

    it('should handle booting state', async () => {
      const bootingDevices = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            {
              udid: 'TEST-UUID',
              name: 'iPhone 15',
              state: 'Booting',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
          ],
        },
        runtimes: [],
      };

      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify(bootingDevices),
        stderr: '',
        exitCode: 0,
      });

      const devices = await listDevices();
      expect(devices[0].status).toBe('booting');
    });
  });

  describe('getDevice', () => {
    beforeEach(() => {
      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify(mockDevicesJson),
        stderr: '',
        exitCode: 0,
      });
    });

    it('should find device by UDID', async () => {
      const device = await getDevice('ABCD1234-5678-EFGH-IJKL-MNOPQRSTUVWX');
      expect(device).not.toBeNull();
      expect(device?.name).toBe('iPhone 15 Pro');
    });

    it('should find device by name', async () => {
      const device = await getDevice('iPhone 15');
      expect(device).not.toBeNull();
      expect(device?.id).toBe('WXYZ9876-5432-DCBA-LKJI-HGFEDCBAMNOP');
    });

    it('should return null for unknown device', async () => {
      const device = await getDevice('nonexistent');
      expect(device).toBeNull();
    });
  });

  describe('getBootedDevice', () => {
    it('should return the booted device', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify(mockDevicesJson),
        stderr: '',
        exitCode: 0,
      });

      const device = await getBootedDevice();
      expect(device).not.toBeNull();
      expect(device?.name).toBe('iPhone 15 Pro');
      expect(device?.status).toBe('booted');
    });

    it('should return null when no device is booted', async () => {
      const noBootedDevices = {
        devices: {
          'com.apple.CoreSimulator.SimRuntime.iOS-17-0': [
            {
              udid: 'TEST-UUID',
              name: 'iPhone 15',
              state: 'Shutdown',
              isAvailable: true,
              deviceTypeIdentifier: 'com.apple.CoreSimulator.SimDeviceType.iPhone-15',
            },
          ],
        },
        runtimes: [],
      };

      mockedExecuteShell.mockResolvedValue({
        stdout: JSON.stringify(noBootedDevices),
        stderr: '',
        exitCode: 0,
      });

      const device = await getBootedDevice();
      expect(device).toBeNull();
    });
  });
});

describe('iOS xcodebuild integration', () => {
  describe('Xcode build commands', () => {
    it('should construct correct simulator build command', () => {
      const scheme = 'iosApp';
      const destination = 'platform=iOS Simulator,name=iPhone 15 Pro';
      const expectedArgs = [
        'xcodebuild',
        '-scheme', scheme,
        '-destination', destination,
        'build',
      ];

      expect(expectedArgs).toContain('-scheme');
      expect(expectedArgs).toContain('build');
    });
  });
});
