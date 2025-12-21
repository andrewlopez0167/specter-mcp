import { describe, it, expect } from 'vitest';
import {
  executeShell,
  executeShellOrThrow,
  commandExists,
  parseLines,
} from '../../../src/utils/shell.js';

// Console output is silenced globally via tests/setup.ts

describe('shell utilities', () => {
  describe('executeShell', () => {
    it('should execute a simple command successfully', async () => {
      const result = await executeShell('echo', ['hello']);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello');
      expect(result.stderr).toBe('');
    });

    it('should capture stderr on command failure', async () => {
      const result = await executeShell('ls', ['/nonexistent-path-12345']);
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('No such file');
    });

    it('should timeout long-running commands', async () => {
      await expect(
        executeShell('sleep', ['10'], { timeoutMs: 100 })
      ).rejects.toMatchObject({
        code: 'TIMEOUT',
      });
    });

    it('should pass environment variables', async () => {
      const result = await executeShell('printenv', ['TEST_VAR'], {
        env: { TEST_VAR: 'test_value' },
      });
      expect(result.stdout).toBe('test_value');
    });

    it('should respect cwd option', async () => {
      const result = await executeShell('pwd', [], { cwd: '/tmp' });
      expect(result.stdout).toMatch(/\/tmp|\/private\/tmp/);
    });
  });

  describe('executeShellOrThrow', () => {
    it('should return result on success', async () => {
      const result = await executeShellOrThrow('echo', ['success']);
      expect(result.stdout).toBe('success');
    });

    it('should throw on command failure', async () => {
      await expect(
        executeShellOrThrow('ls', ['/nonexistent-path-12345'])
      ).rejects.toMatchObject({
        code: 'SHELL_EXECUTION_FAILED',
      });
    });
  });

  describe('commandExists', () => {
    it('should return true for existing commands', async () => {
      const exists = await commandExists('echo');
      expect(exists).toBe(true);
    });

    it('should return false for non-existing commands', async () => {
      const exists = await commandExists('nonexistent-command-12345');
      expect(exists).toBe(false);
    });
  });

  describe('parseLines', () => {
    it('should parse multi-line output', () => {
      const output = 'line1\nline2\nline3';
      expect(parseLines(output)).toEqual(['line1', 'line2', 'line3']);
    });

    it('should filter empty lines', () => {
      const output = 'line1\n\nline2\n  \nline3\n';
      expect(parseLines(output)).toEqual(['line1', 'line2', 'line3']);
    });

    it('should trim whitespace', () => {
      const output = '  line1  \n  line2  ';
      expect(parseLines(output)).toEqual(['line1', 'line2']);
    });

    it('should handle empty input', () => {
      expect(parseLines('')).toEqual([]);
    });
  });
});
