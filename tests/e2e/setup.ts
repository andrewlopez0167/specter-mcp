/**
 * E2E Test Setup
 * Provides utilities for testing the MCP server as a whole
 */

import { spawn, ChildProcess, execFileSync } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { vi } from 'vitest';

/**
 * Device availability and auto-launch utilities
 */

export interface DeviceSetupResult {
  androidAvailable: boolean;
  iosAvailable: boolean;
  androidDeviceId: string | null;
  iosDeviceId: string | null;
  androidLaunched: boolean;
  iosLaunched: boolean;
}

/**
 * Check if Android device/emulator is available
 */
export async function isAndroidAvailable(): Promise<boolean> {
  try {
    const result = execFileSync('adb', ['devices'], { encoding: 'utf-8', timeout: 10000 });
    const lines = result.split('\n').filter(l => l.includes('device') && !l.includes('List'));
    return lines.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if iOS simulator is booted
 */
export async function isIOSAvailable(): Promise<boolean> {
  try {
    const result = execFileSync('xcrun', ['simctl', 'list', 'devices'], { encoding: 'utf-8', timeout: 10000 });
    return result.includes('(Booted)');
  } catch {
    return false;
  }
}

/**
 * Get first booted iOS device UDID
 */
export async function getBootedIOSDevice(): Promise<string | null> {
  try {
    const result = execFileSync('xcrun', ['simctl', 'list', 'devices'], { encoding: 'utf-8', timeout: 10000 });
    const bootedMatch = result.match(/([A-F0-9-]{36})\) \(Booted\)/);
    return bootedMatch ? bootedMatch[1] : null;
  } catch {
    return null;
  }
}

/**
 * Get first connected Android device ID
 */
export async function getAndroidDeviceId(): Promise<string | null> {
  try {
    const result = execFileSync('adb', ['devices'], { encoding: 'utf-8', timeout: 10000 });
    const lines = result.split('\n');
    for (const line of lines) {
      const match = line.match(/^([\w-]+)\s+device$/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * List available Android AVDs
 */
export async function listAndroidAvds(): Promise<string[]> {
  try {
    const result = execFileSync('emulator', ['-list-avds'], { encoding: 'utf-8', timeout: 10000 });
    return result.split('\n').filter(line => line.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * List available iOS simulators
 */
export async function listIOSSimulators(): Promise<Array<{ udid: string; name: string; state: string }>> {
  try {
    const result = execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf-8', timeout: 10000 });
    const parsed = JSON.parse(result);
    const devices: Array<{ udid: string; name: string; state: string }> = [];

    for (const runtime of Object.values(parsed.devices) as Array<Array<{ udid: string; name: string; state: string; isAvailable?: boolean }>>) {
      for (const device of runtime) {
        if (device.isAvailable !== false) {
          devices.push({
            udid: device.udid,
            name: device.name,
            state: device.state,
          });
        }
      }
    }
    return devices;
  } catch {
    return [];
  }
}

/**
 * Launch Android emulator if none is running
 * @param avdName Optional specific AVD name, otherwise uses first available
 * @param timeoutMs Timeout to wait for emulator to boot (default: 120s)
 * @returns Device ID if launched successfully, null otherwise
 */
export async function ensureAndroidEmulator(
  avdName?: string,
  timeoutMs = 120000
): Promise<string | null> {
  // Check if already available
  if (await isAndroidAvailable()) {
    console.log('[setup] Android emulator already running');
    return getAndroidDeviceId();
  }

  // Get AVD to launch
  const avds = await listAndroidAvds();
  const targetAvd = avdName || avds[0];

  if (!targetAvd) {
    console.log('[setup] No Android AVDs available to launch');
    return null;
  }

  console.log(`[setup] Launching Android emulator: ${targetAvd}...`);

  // Launch emulator in background (non-blocking)
  const emulatorProcess = spawn('emulator', ['-avd', targetAvd, '-no-snapshot-load'], {
    detached: true,
    stdio: 'ignore',
  });
  emulatorProcess.unref();

  // Wait for device to be available
  const startTime = Date.now();
  const pollInterval = 3000;

  while (Date.now() - startTime < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    if (await isAndroidAvailable()) {
      // Wait a bit more for the device to be fully ready
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Wait for boot completion
      try {
        execFileSync('adb', ['wait-for-device'], { timeout: 30000 });
        // Check if boot is complete
        const bootCompleted = execFileSync('adb', ['shell', 'getprop', 'sys.boot_completed'], {
          encoding: 'utf-8',
          timeout: 10000,
        }).trim();
        if (bootCompleted === '1') {
          console.log('[setup] Android emulator booted successfully');
          return getAndroidDeviceId();
        }
      } catch {
        // Continue waiting
      }
    }
  }

  console.log('[setup] Timeout waiting for Android emulator to boot');
  return null;
}

/**
 * Launch iOS simulator if none is running
 * @param udidOrName Optional specific simulator UDID or name, otherwise uses first available iPhone
 * @param timeoutMs Timeout to wait for simulator to boot (default: 60s)
 * @returns Device UDID if launched successfully, null otherwise
 */
export async function ensureIOSSimulator(
  udidOrName?: string,
  timeoutMs = 60000
): Promise<string | null> {
  // Check if already available
  if (await isIOSAvailable()) {
    console.log('[setup] iOS simulator already running');
    return getBootedIOSDevice();
  }

  // Get simulator to launch
  const simulators = await listIOSSimulators();

  let targetSim: { udid: string; name: string } | undefined;

  if (udidOrName) {
    targetSim = simulators.find(s => s.udid === udidOrName || s.name === udidOrName);
  } else {
    // Prefer iPhone simulators
    targetSim = simulators.find(s => s.name.includes('iPhone')) || simulators[0];
  }

  if (!targetSim) {
    console.log('[setup] No iOS simulators available to launch');
    return null;
  }

  console.log(`[setup] Launching iOS simulator: ${targetSim.name}...`);

  try {
    // Boot the simulator
    execFileSync('xcrun', ['simctl', 'boot', targetSim.udid], { timeout: 30000 });

    // Open Simulator.app to show the UI
    spawn('open', ['-a', 'Simulator'], { detached: true, stdio: 'ignore' }).unref();

    // Wait for simulator to be fully booted
    const startTime = Date.now();
    const pollInterval = 2000;

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      if (await isIOSAvailable()) {
        console.log('[setup] iOS simulator booted successfully');
        return targetSim.udid;
      }
    }

    console.log('[setup] Timeout waiting for iOS simulator to boot');
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Check if already booted
    if (message.includes('already booted')) {
      console.log('[setup] iOS simulator already booted');
      return targetSim.udid;
    }
    console.log(`[setup] Failed to boot iOS simulator: ${message}`);
    return null;
  }
}

/**
 * Ensure both Android emulator and iOS simulator are available
 * Launches them if not running
 * @returns Setup result with device availability and IDs
 */
export async function ensureDevicesAvailable(): Promise<DeviceSetupResult> {
  console.log('[setup] Checking device availability...');

  // Check initial state
  const initialAndroid = await isAndroidAvailable();
  const initialIOS = await isIOSAvailable();

  const result: DeviceSetupResult = {
    androidAvailable: initialAndroid,
    iosAvailable: initialIOS,
    androidDeviceId: null,
    iosDeviceId: null,
    androidLaunched: false,
    iosLaunched: false,
  };

  // Launch missing devices in parallel
  const promises: Promise<void>[] = [];

  if (!initialAndroid) {
    promises.push(
      ensureAndroidEmulator().then(deviceId => {
        if (deviceId) {
          result.androidAvailable = true;
          result.androidDeviceId = deviceId;
          result.androidLaunched = true;
        }
      })
    );
  } else {
    result.androidDeviceId = await getAndroidDeviceId();
  }

  if (!initialIOS) {
    promises.push(
      ensureIOSSimulator().then(deviceId => {
        if (deviceId) {
          result.iosAvailable = true;
          result.iosDeviceId = deviceId;
          result.iosLaunched = true;
        }
      })
    );
  } else {
    result.iosDeviceId = await getBootedIOSDevice();
  }

  await Promise.all(promises);

  console.log(`[setup] Device setup complete:`);
  console.log(`  Android: ${result.androidAvailable ? 'available' : 'not available'} (${result.androidDeviceId || 'none'})${result.androidLaunched ? ' [launched]' : ''}`);
  console.log(`  iOS: ${result.iosAvailable ? 'available' : 'not available'} (${result.iosDeviceId || 'none'})${result.iosLaunched ? ' [launched]' : ''}`);

  return result;
}

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
export async function mockShellCommand(
  responses: Record<string, { stdout: string; stderr?: string; exitCode?: number }>
): Promise<void> {
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
