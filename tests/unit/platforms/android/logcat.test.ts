import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shell module
vi.mock('../../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
}));

// Mock the log-entry module
vi.mock('../../../../src/models/log-entry.js', () => ({
  parseLogcatLine: vi.fn((line: string) => {
    // Simple mock implementation
    const match = line.match(/(\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(\S+)\s*:\s*(.*)/);
    if (!match) return null;
    const [, , timestamp, pid, tid, level, tag, message] = match;
    return {
      timestamp: new Date(`2024-${timestamp}T${timestamp}`),
      level: level as 'V' | 'D' | 'I' | 'W' | 'E' | 'F',
      tag,
      message,
      pid: parseInt(pid),
      tid: parseInt(tid),
      platform: 'android',
    };
  }),
  filterLogEntries: vi.fn((entries, filter) => {
    if (!filter) return entries;
    let filtered = entries;
    if (filter.minLevel) {
      const levels = ['V', 'D', 'I', 'W', 'E', 'F'];
      const minIdx = levels.indexOf(filter.minLevel);
      filtered = filtered.filter((e: { level: string }) => levels.indexOf(e.level) >= minIdx);
    }
    if (filter.pattern) {
      const regex = new RegExp(filter.pattern, filter.ignoreCase ? 'i' : undefined);
      filtered = filtered.filter((e: { message: string }) => regex.test(e.message));
    }
    return filtered;
  }),
}));

import { executeShell } from '../../../../src/utils/shell.js';
import { parseLogcatLine, filterLogEntries } from '../../../../src/models/log-entry.js';
import {
  captureLogcat,
  clearLogcat,
  getLogsByTag,
  getLogsByLevel,
  searchLogs,
  getLogcatStats,
} from '../../../../src/platforms/android/logcat.js';

const mockedExecuteShell = vi.mocked(executeShell);
const mockedParseLogcatLine = vi.mocked(parseLogcatLine);
const mockedFilterLogEntries = vi.mocked(filterLogEntries);

describe('Android Logcat Capture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('captureLogcat', () => {
    it('should capture logcat output successfully', async () => {
      const mockLogs = `12-21 10:30:00.123  1234  1234 D MyApp: Debug message
12-21 10:30:01.456  1234  1234 I MyApp: Info message
12-21 10:30:02.789  1234  1234 E MyApp: Error message`;

      mockedExecuteShell.mockResolvedValue({
        stdout: mockLogs,
        stderr: '',
        exitCode: 0,
      });

      mockedParseLogcatLine.mockImplementation((line) => {
        if (line.includes('Debug')) return { level: 'D', message: 'Debug message', tag: 'MyApp', timestamp: new Date(), platform: 'android' };
        if (line.includes('Info')) return { level: 'I', message: 'Info message', tag: 'MyApp', timestamp: new Date(), platform: 'android' };
        if (line.includes('Error')) return { level: 'E', message: 'Error message', tag: 'MyApp', timestamp: new Date(), platform: 'android' };
        return null;
      });

      mockedFilterLogEntries.mockImplementation((entries) => entries);

      const entries = await captureLogcat();

      expect(entries).toHaveLength(3);
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['logcat', '-d', '-v', 'threadtime']),
        expect.any(Object)
      );
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await captureLogcat({ deviceId: 'emulator-5554' });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should apply max lines limit', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await captureLogcat({ maxLines: 100 });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-t', '100']),
        expect.any(Object)
      );
    });

    it('should filter by package name using PID', async () => {
      // First call to get PID
      mockedExecuteShell
        .mockResolvedValueOnce({
          stdout: '1234',
          stderr: '',
          exitCode: 0,
        })
        // Second call for logcat
        .mockResolvedValueOnce({
          stdout: 'log output',
          stderr: '',
          exitCode: 0,
        });

      await captureLogcat({ packageName: 'com.example.app' });

      // Should have called pidof
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['shell', 'pidof', 'com.example.app']),
        expect.any(Object)
      );

      // Should include PID filter
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['--pid', '1234']),
        expect.any(Object)
      );
    });

    it('should clear logcat before capture when requested', async () => {
      mockedExecuteShell
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // clear
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // capture

      await captureLogcat({ clear: true });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['logcat', '-c']),
        expect.any(Object)
      );
    });

    it('should apply filter when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '12-21 10:30:00.123  1234  1234 E Tag: Error',
        stderr: '',
        exitCode: 0,
      });

      mockedParseLogcatLine.mockReturnValue({
        level: 'E',
        message: 'Error',
        tag: 'Tag',
        timestamp: new Date(),
        platform: 'android',
      });

      const filter = { minLevel: 'E' as const };
      await captureLogcat({ filter });

      expect(mockedFilterLogEntries).toHaveBeenCalledWith(
        expect.any(Array),
        filter
      );
    });

    it('should return empty array on command failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const entries = await captureLogcat();

      expect(entries).toEqual([]);
    });

    it('should skip empty lines', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'line1\n\n  \nline2',
        stderr: '',
        exitCode: 0,
      });

      mockedParseLogcatLine.mockReturnValue({
        level: 'I',
        message: 'test',
        tag: 'Tag',
        timestamp: new Date(),
        platform: 'android',
      });

      mockedFilterLogEntries.mockImplementation((entries) => entries);

      const entries = await captureLogcat();

      // Should only parse non-empty lines
      expect(mockedParseLogcatLine).toHaveBeenCalledTimes(2);
    });
  });

  describe('clearLogcat', () => {
    it('should clear logcat buffer successfully', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const result = await clearLogcat();

      expect(result).toBe(true);
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['logcat', '-c'],
        expect.any(Object)
      );
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await clearLogcat('emulator-5554');

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'logcat', '-c'],
        expect.any(Object)
      );
    });

    it('should return false on failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const result = await clearLogcat();

      expect(result).toBe(false);
    });

    it('should return false on exception', async () => {
      mockedExecuteShell.mockRejectedValue(new Error('Command failed'));

      const result = await clearLogcat();

      expect(result).toBe(false);
    });
  });

  describe('getLogsByTag', () => {
    it('should get logs filtered by tags', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '12-21 10:30:00.123  1234  1234 D MyApp: Message',
        stderr: '',
        exitCode: 0,
      });

      mockedParseLogcatLine.mockReturnValue({
        level: 'D',
        message: 'Message',
        tag: 'MyApp',
        timestamp: new Date(),
        platform: 'android',
      });

      const entries = await getLogsByTag(['MyApp', 'OkHttp']);

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['MyApp:V', 'OkHttp:V', '*:S']),
        expect.any(Object)
      );
    });

    it('should apply maxLines option', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await getLogsByTag(['MyApp'], { maxLines: 50 });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-t', '50']),
        expect.any(Object)
      );
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      await getLogsByTag(['Tag'], { deviceId: 'emulator-5554' });

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        expect.arrayContaining(['-s', 'emulator-5554']),
        expect.any(Object)
      );
    });

    it('should return empty array on failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const entries = await getLogsByTag(['Tag']);

      expect(entries).toEqual([]);
    });
  });

  describe('getLogsByLevel', () => {
    it('should filter logs by minimum level', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'log content',
        stderr: '',
        exitCode: 0,
      });

      const mockEntries = [
        { level: 'D', message: 'Debug' },
        { level: 'E', message: 'Error' },
      ];

      mockedParseLogcatLine.mockReturnValue(mockEntries[0] as ReturnType<typeof parseLogcatLine>);
      mockedFilterLogEntries.mockReturnValue([mockEntries[1]]);

      const entries = await getLogsByLevel('E');

      expect(mockedFilterLogEntries).toHaveBeenCalledWith(
        expect.any(Array),
        { minLevel: 'E' }
      );
    });
  });

  describe('searchLogs', () => {
    it('should search logs by pattern', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'log content with error message',
        stderr: '',
        exitCode: 0,
      });

      mockedParseLogcatLine.mockReturnValue({
        level: 'E',
        message: 'error message',
        tag: 'Tag',
        timestamp: new Date(),
        platform: 'android',
      });

      mockedFilterLogEntries.mockImplementation((entries) => entries);

      await searchLogs('error');

      expect(mockedFilterLogEntries).toHaveBeenCalledWith(
        expect.any(Array),
        { pattern: 'error', ignoreCase: true }
      );
    });
  });

  describe('getLogcatStats', () => {
    it('should parse logcat buffer statistics', async () => {
      const mockStats = `main: ring buffer is 256KB (252KB consumed), max entry is 5120B, max payload is 4068B
system: ring buffer is 256KB (150KB consumed), max entry is 5120B, max payload is 4068B
crash: ring buffer is 64KB (0B consumed), max entry is 5120B, max payload is 4068B
events: ring buffer is 256KB (100KB consumed), max entry is 5120B, max payload is 4068B`;

      mockedExecuteShell.mockResolvedValue({
        stdout: mockStats,
        stderr: '',
        exitCode: 0,
      });

      const stats = await getLogcatStats();

      expect(stats).not.toBeNull();
      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['logcat', '-g'],
        expect.any(Object)
      );
    });

    it('should use device ID when provided', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'main: ring buffer is 256KB',
        stderr: '',
        exitCode: 0,
      });

      await getLogcatStats('emulator-5554');

      expect(mockedExecuteShell).toHaveBeenCalledWith(
        'adb',
        ['-s', 'emulator-5554', 'logcat', '-g'],
        expect.any(Object)
      );
    });

    it('should return null on failure', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
      });

      const stats = await getLogcatStats();

      expect(stats).toBeNull();
    });

    it('should return null on exception', async () => {
      mockedExecuteShell.mockRejectedValue(new Error('Command failed'));

      const stats = await getLogcatStats();

      expect(stats).toBeNull();
    });

    it('should return default stats when parsing fails', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: 'unexpected output format',
        stderr: '',
        exitCode: 0,
      });

      const stats = await getLogcatStats();

      expect(stats).toEqual({ main: 0, system: 0, crash: 0, events: 0 });
    });
  });
});
