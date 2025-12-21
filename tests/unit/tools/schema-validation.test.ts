/**
 * Tool Schema Validation Tests
 * Validates all tool schemas match their actual implementation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getToolRegistry } from '../../../src/tools/register.js';
import { resetConfig, setConfig } from '../../../src/config.js';

// Import all tool registration functions
import { registerBuildAppTool } from '../../../src/tools/build/build-app.js';
import { registerInstallAppTool } from '../../../src/tools/build/install-app.js';
import { registerLaunchAppTool } from '../../../src/tools/build/launch-app.js';
import { registerGetUIContextTool } from '../../../src/tools/ui/get-ui-context.js';
import { registerInteractWithUITool } from '../../../src/tools/ui/interact-with-ui.js';
import { registerRunUnitTestsTool } from '../../../src/tools/testing/run-unit-tests.js';
import { registerRunMaestroFlowTool } from '../../../src/tools/testing/run-maestro-flow.js';
import { registerRunLinterTool } from '../../../src/tools/testing/run-linter.js';
import { registerListDevicesTool } from '../../../src/tools/environment/list-devices.js';
import { registerManageEnvTool } from '../../../src/tools/environment/manage-env.js';
import { registerCleanProjectTool } from '../../../src/tools/environment/clean-project.js';
import { registerAnalyzeCrashTool } from '../../../src/tools/crash/analyze-crash.js';
import { registerDeepLinkNavigateTool } from '../../../src/tools/navigation/deep-link-navigate.js';
import { registerInspectAppStateTool } from '../../../src/tools/observability/inspect-app-state.js';
import { registerInspectLogsTool } from '../../../src/tools/observability/inspect-logs.js';

function registerAllTestTools(): void {
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

describe('Tool Schema Validation', () => {
  beforeAll(() => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    registerAllTestTools();
  });

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('Environment Tools', () => {
    describe('clean_project', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('clean_project');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('projectPath');
        expect(props).toHaveProperty('cleanGradle');
        expect(props).toHaveProperty('cleanDerivedData');
        expect(props).toHaveProperty('cleanBuild');
        expect(props).toHaveProperty('cleanNodeModules');
        expect(props).toHaveProperty('cleanPods');
      });

      it('should have projectPath as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('clean_project');

        expect(tool!.definition.inputSchema.required).toContain('projectPath');
      });

      it('should have boolean types for clean options', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('clean_project');
        const props = tool!.definition.inputSchema.properties;

        expect((props.cleanGradle as { type: string }).type).toBe('boolean');
        expect((props.cleanDerivedData as { type: string }).type).toBe('boolean');
        expect((props.cleanBuild as { type: string }).type).toBe('boolean');
      });
    });

    describe('manage_env', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('manage_env');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('action');
        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('device');
        expect(props).toHaveProperty('waitForReady');
        expect(props).toHaveProperty('timeoutMs');
      });

      it('should have action and platform as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('manage_env');

        expect(tool!.definition.inputSchema.required).toContain('action');
        expect(tool!.definition.inputSchema.required).toContain('platform');
      });

      it('should have correct action enum', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('manage_env');
        const actionProp = tool!.definition.inputSchema.properties.action as { enum: string[] };

        expect(actionProp.enum).toContain('boot');
        expect(actionProp.enum).toContain('shutdown');
        expect(actionProp.enum).toContain('restart');
      });

      it('should have correct platform enum', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('manage_env');
        const platformProp = tool!.definition.inputSchema.properties.platform as { enum: string[] };

        expect(platformProp.enum).toContain('android');
        expect(platformProp.enum).toContain('ios');
      });
    });

    describe('list_devices', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('list_devices');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('status');
        expect(props).toHaveProperty('includeAvds');
        expect(props).toHaveProperty('includeUnavailable');
      });

      it('should have no required fields', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('list_devices');

        expect(tool!.definition.inputSchema.required).toEqual([]);
      });
    });
  });

  describe('Observability Tools', () => {
    describe('inspect_app_state', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_app_state');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('appId');
        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('deviceId');
        expect(props).toHaveProperty('includePreferences');
        expect(props).toHaveProperty('includeDatabases');
        expect(props).toHaveProperty('preferencesFile');
      });

      it('should have platform and appId as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_app_state');

        expect(tool!.definition.inputSchema.required).toContain('platform');
        expect(tool!.definition.inputSchema.required).toContain('appId');
      });

      it('should have correct platform enum', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_app_state');
        const platformProp = tool!.definition.inputSchema.properties.platform as { enum: string[] };

        expect(platformProp.enum).toContain('android');
        expect(platformProp.enum).toContain('ios');
      });
    });

    describe('inspect_logs', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_logs');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('appId');
        expect(props).toHaveProperty('deviceId');
        expect(props).toHaveProperty('minLevel');
        expect(props).toHaveProperty('tags');
        expect(props).toHaveProperty('excludeTags');
      });

      it('should have platform as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_logs');

        expect(tool!.definition.inputSchema.required).toContain('platform');
      });

      it('should have correct minLevel enum', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_logs');
        const minLevelProp = tool!.definition.inputSchema.properties.minLevel as { enum: string[] };

        expect(minLevelProp.enum).toContain('verbose');
        expect(minLevelProp.enum).toContain('debug');
        expect(minLevelProp.enum).toContain('info');
        expect(minLevelProp.enum).toContain('warning');
        expect(minLevelProp.enum).toContain('error');
        expect(minLevelProp.enum).toContain('fatal');
      });

      it('should have tags as array type', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('inspect_logs');
        const tagsProp = tool!.definition.inputSchema.properties.tags as { type: string };

        expect(tagsProp.type).toBe('array');
      });
    });
  });

  describe('Testing Tools', () => {
    describe('run_unit_tests', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_unit_tests');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('projectPath');
        expect(props).toHaveProperty('sourceSet');
        expect(props).toHaveProperty('testClass');
        expect(props).toHaveProperty('testMethod');
        expect(props).toHaveProperty('module');
        expect(props).toHaveProperty('timeoutMs');
      });

      it('should have platform as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_unit_tests');

        expect(tool!.definition.inputSchema.required).toContain('platform');
      });
    });

    describe('run_maestro_flow', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_maestro_flow');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('flowPath');
        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('device');
        expect(props).toHaveProperty('appId');
        expect(props).toHaveProperty('timeoutMs');
        expect(props).toHaveProperty('generateFailureBundle');
        expect(props).toHaveProperty('env');
      });

      it('should have platform and flowPath as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_maestro_flow');

        expect(tool!.definition.inputSchema.required).toContain('platform');
        expect(tool!.definition.inputSchema.required).toContain('flowPath');
      });
    });

    describe('run_linter', () => {
      it('should have correct schema properties', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_linter');
        const props = tool!.definition.inputSchema.properties;

        expect(props).toHaveProperty('platform');
        expect(props).toHaveProperty('projectPath');
        expect(props).toHaveProperty('linter');
        expect(props).toHaveProperty('module');
        expect(props).toHaveProperty('configPath');
        expect(props).toHaveProperty('timeoutMs');
        expect(props).toHaveProperty('autoFix');
      });

      it('should have platform and projectPath as required', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_linter');

        expect(tool!.definition.inputSchema.required).toContain('platform');
        expect(tool!.definition.inputSchema.required).toContain('projectPath');
      });

      it('should have correct linter enum', () => {
        const registry = getToolRegistry();
        const tool = registry.getTool('run_linter');
        const linterProp = tool!.definition.inputSchema.properties.linter as { enum: string[] };

        expect(linterProp.enum).toContain('detekt');
        expect(linterProp.enum).toContain('android-lint');
        expect(linterProp.enum).toContain('swiftlint');
        expect(linterProp.enum).toContain('ktlint');
      });
    });
  });

  describe('All Tools Have Required Structure', () => {
    it('all tools should have name, description, and inputSchema', () => {
      const registry = getToolRegistry();
      const tools = registry.listTools();

      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('all tools should have handlers', () => {
      const registry = getToolRegistry();
      const tools = registry.listTools();

      for (const tool of tools) {
        const registered = registry.getTool(tool.name);
        expect(registered).toBeDefined();
        expect(registered!.handler).toBeInstanceOf(Function);
      }
    });
  });
});
