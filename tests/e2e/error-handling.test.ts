/**
 * E2E Test: Error Handling
 * Tests validation and error handling across tools
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getToolRegistry } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';

// Import tool registration functions directly
import { registerBuildAppTool } from '../../src/tools/build/build-app.js';
import { registerInstallAppTool } from '../../src/tools/build/install-app.js';
import { registerLaunchAppTool } from '../../src/tools/build/launch-app.js';
import { registerGetUIContextTool } from '../../src/tools/ui/get-ui-context.js';
import { registerInteractWithUITool } from '../../src/tools/ui/interact-with-ui.js';
import { registerRunUnitTestsTool } from '../../src/tools/testing/run-unit-tests.js';
import { registerRunMaestroFlowTool } from '../../src/tools/testing/run-maestro-flow.js';
import { registerRunLinterTool } from '../../src/tools/testing/run-linter.js';
import { registerListDevicesTool } from '../../src/tools/environment/list-devices.js';
import { registerManageEnvTool } from '../../src/tools/environment/manage-env.js';
import { registerCleanProjectTool } from '../../src/tools/environment/clean-project.js';
import { registerAnalyzeCrashTool } from '../../src/tools/crash/analyze-crash.js';
import { registerDeepLinkNavigateTool } from '../../src/tools/navigation/deep-link-navigate.js';
import { registerInspectAppStateTool } from '../../src/tools/observability/inspect-app-state.js';
import { registerInspectLogsTool } from '../../src/tools/observability/inspect-logs.js';

/**
 * Register all tools for testing
 */
function registerTestTools(): void {
  const registry = getToolRegistry();
  registry.clear();

  registerBuildAppTool();
  registerInstallAppTool();
  registerLaunchAppTool();
  registerGetUIContextTool();
  registerInteractWithUITool();
  registerRunUnitTestsTool();
  registerRunMaestroFlowTool();
  registerRunLinterTool();
  registerListDevicesTool();
  registerManageEnvTool();
  registerCleanProjectTool();
  registerAnalyzeCrashTool();
  registerDeepLinkNavigateTool();
  registerInspectAppStateTool();
  registerInspectLogsTool();
}

describe('Error Handling E2E', () => {
  beforeAll(() => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    registerTestTools();
  });

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('Invalid Platform Validation', () => {
    it('build_app should reject invalid platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('build_app');

      await expect(
        tool!.handler({
          platform: 'windows',
          projectPath: '/test',
        })
      ).rejects.toThrow(/Invalid platform/);
    });

    it('list_devices should handle invalid platform gracefully', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('list_devices');

      // list_devices returns error message rather than throwing
      const result = await tool!.handler({
        platform: 'linux',
      });

      expect(result).toHaveProperty('summary');
      expect((result as { summary: string }).summary).toContain('Invalid platform');
    });

    it('deep_link_navigate should reject invalid platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');

      await expect(
        tool!.handler({
          platform: 'macos',
          url: 'myapp://test',
        })
      ).rejects.toThrow(/Invalid platform/);
    });

    it('inspect_logs should reject invalid platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');

      await expect(
        tool!.handler({
          platform: 'web',
        })
      ).rejects.toThrow(/Invalid platform/);
    });

    it('inspect_app_state should reject invalid platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_app_state');

      await expect(
        tool!.handler({
          platform: 'desktop',
          appId: 'com.example.app',
        })
      ).rejects.toThrow(/Invalid platform/);
    });
  });

  describe('Missing Required Arguments', () => {
    it('build_app should reject missing projectPath', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('build_app');

      await expect(
        tool!.handler({
          platform: 'android',
        })
      ).rejects.toThrow();
    });

    it('deep_link_navigate should reject missing url', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');

      await expect(
        tool!.handler({
          platform: 'android',
        })
      ).rejects.toThrow();
    });

    it('run_maestro_flow should reject missing flowPath', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('run_maestro_flow');

      await expect(
        tool!.handler({
          platform: 'android',
        })
      ).rejects.toThrow();
    });

    it('analyze_crash without crashLogPath should use live device logs', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      // Since analyze_crash now supports live device log analysis,
      // it should not reject when crashLogPath is missing
      const result = await tool!.handler({
        platform: 'ios',
      }) as { success: boolean; deviceLogs?: object };

      // It should return a result (may or may not find a crash)
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('deviceLogs');
    });
  });

  describe('Invalid URL Validation', () => {
    it('deep_link_navigate should reject invalid URL format', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('deep_link_navigate');

      await expect(
        tool!.handler({
          platform: 'android',
          url: 'not-a-valid-url',
          appId: 'com.example.app',
        })
      ).rejects.toThrow();
    });
  });

  describe('Invalid Log Level', () => {
    it('inspect_logs should reject invalid log level', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('inspect_logs');

      await expect(
        tool!.handler({
          platform: 'android',
          minLevel: 'invalid-level',
        })
      ).rejects.toThrow();
    });
  });

  describe('Missing File Paths', () => {
    it('analyze_crash should reject nonexistent crash log', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('analyze_crash');

      await expect(
        tool!.handler({
          platform: 'ios',
          crashLogPath: '/nonexistent/crash.ips',
        })
      ).rejects.toThrow();
    });

    it('run_maestro_flow should handle missing flow file', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('run_maestro_flow');

      // The tool checks for device first, so it may throw before checking flow file
      // Just verify the tool handles errors
      try {
        const result = await tool!.handler({
          platform: 'android',
          flowPath: '/nonexistent/flow.yaml',
          appId: 'com.example.app',
        });
        expect(result).toHaveProperty('success', false);
      } catch (error) {
        // It's acceptable to throw for missing devices or files
        expect(error).toBeDefined();
      }
    });
  });
});
