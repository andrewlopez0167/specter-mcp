/**
 * E2E Test Setup
 * Provides utilities for testing the MCP server as a whole
 */

import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { vi } from 'vitest';

/**
 * Test client wrapper for E2E tests
 */
export class TestClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverProcess: ChildProcess | null = null;

  /**
   * Start the MCP server and connect a client
   */
  async connect(): Promise<void> {
    // Spawn the server process
    this.serverProcess = spawn('node', ['dist/index.js'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Create transport using the server's stdio
    this.transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.js'],
    });

    // Create and connect client
    this.client = new Client(
      {
        name: 'specter-mcp-test-client',
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );

    await this.client.connect(this.transport);
  }

  /**
   * Disconnect client and stop server
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }

    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }

    if (this.serverProcess) {
      this.serverProcess.kill('SIGTERM');
      this.serverProcess = null;
    }
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<{ name: string; description?: string }[]> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    const result = await this.client.listTools();
    return result.tools.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  /**
   * Call a tool with arguments
   */
  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<{
    result: T;
    isError: boolean;
  }> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    const response = await this.client.callTool({
      name,
      arguments: args,
    });

    const content = response.content[0];
    if (content?.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const parsed = JSON.parse(content.text);
    return {
      result: parsed.error ? parsed : parsed,
      isError: response.isError ?? false,
    };
  }
}

/**
 * In-process test helper that doesn't spawn a subprocess
 * Useful for faster unit-like E2E tests
 */
export class InProcessTestClient {
  private registry: typeof import('../../src/tools/register.js') | null = null;

  async setup(): Promise<void> {
    // Dynamically import to avoid circular dependencies
    this.registry = await import('../../src/tools/register.js');
    await this.registry.registerAllTools();
  }

  async teardown(): Promise<void> {
    if (this.registry) {
      this.registry.getToolRegistry().clear();
    }
  }

  async listTools(): Promise<string[]> {
    if (!this.registry) {
      throw new Error('Test client not set up');
    }
    return this.registry.getToolRegistry().listTools().map((t) => t.name);
  }

  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.registry) {
      throw new Error('Test client not set up');
    }

    const tool = this.registry.getToolRegistry().getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }

    return tool.handler(args) as Promise<T>;
  }
}

/**
 * Create a mock for shell commands in E2E tests
 */
export function mockShellCommand(
  responses: Record<string, { stdout: string; stderr?: string; exitCode?: number }>
): void {
  const shellModule = vi.mocked(
    await import('../../src/utils/shell.js')
  );

  shellModule.executeShell.mockImplementation(async (command, args = []) => {
    const key = `${command} ${args.join(' ')}`.trim();
    const response = responses[key] || responses[command];

    if (!response) {
      return {
        stdout: '',
        stderr: `Command not mocked: ${key}`,
        exitCode: 1,
      };
    }

    return {
      stdout: response.stdout,
      stderr: response.stderr ?? '',
      exitCode: response.exitCode ?? 0,
    };
  });
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Create temporary test fixtures
 */
export function createFixtures(): {
  cleanup: () => Promise<void>;
  paths: Record<string, string>;
} {
  const paths: Record<string, string> = {};
  const filesToCleanup: string[] = [];

  return {
    paths,
    cleanup: async () => {
      // Clean up any created files
      for (const file of filesToCleanup) {
        try {
          await import('fs/promises').then((fs) => fs.unlink(file));
        } catch {
          // Ignore cleanup errors
        }
      }
    },
  };
}
