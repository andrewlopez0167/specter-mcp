/**
 * E2E Test: UI Inspection
 * Tests UI capture and interaction tools (T052, T053)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getToolRegistry } from '../../src/tools/register.js';
import { resetConfig, setConfig } from '../../src/config.js';

// Import tool registration functions directly
import { registerGetUIContextTool } from '../../src/tools/ui/get-ui-context.js';
import { registerInteractWithUITool } from '../../src/tools/ui/interact-with-ui.js';
import { registerListDevicesTool } from '../../src/tools/environment/list-devices.js';

/**
 * Register UI tools for E2E testing
 */
function registerTestTools(): void {
  const registry = getToolRegistry();
  registry.clear();

  registerGetUIContextTool();
  registerInteractWithUITool();
  registerListDevicesTool();
}

describe('UI Inspection E2E (T052, T053)', () => {
  beforeAll(() => {
    resetConfig();
    setConfig({ debug: false, logLevel: 'error' });
    registerTestTools();
  });

  afterAll(() => {
    resetConfig();
    getToolRegistry().clear();
  });

  describe('Tool Registration', () => {
    it('should register UI inspection tools', () => {
      const registry = getToolRegistry();

      expect(registry.hasTool('get_ui_context')).toBe(true);
      expect(registry.hasTool('interact_with_ui')).toBe(true);
    });

    it('get_ui_context should have correct schema', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      expect(tool!.definition.inputSchema.properties).toHaveProperty('platform');
      expect(tool!.definition.inputSchema.properties).toHaveProperty('skipScreenshot');
      expect(tool!.definition.inputSchema.required).toContain('platform');
    });

    it('interact_with_ui should have correct schema', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      expect(tool!.definition.inputSchema.properties).toHaveProperty('platform');
      expect(tool!.definition.inputSchema.properties).toHaveProperty('action');
      expect(tool!.definition.inputSchema.required).toContain('platform');
      expect(tool!.definition.inputSchema.required).toContain('action');
    });
  });

  describe('T052: UI Context Capture', () => {
    it('should validate platform argument', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      await expect(
        tool!.handler({
          platform: 'invalid-platform',
        })
      ).rejects.toThrow(/Invalid platform/);
    });

    it('should accept valid Android platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      // Will fail due to no device, but should not reject on platform validation
      try {
        await tool!.handler({
          platform: 'android',
          skipScreenshot: true,
        });
      } catch (error) {
        // Expected to fail without device, but should get past platform validation
        expect(String(error)).not.toMatch(/Invalid platform/);
      }
    });

    it('should accept valid iOS platform', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      // Will fail due to no device, but should not reject on platform validation
      try {
        await tool!.handler({
          platform: 'ios',
          skipScreenshot: true,
        });
      } catch (error) {
        // Expected to fail without device, but should get past platform validation
        expect(String(error)).not.toMatch(/Invalid platform/);
      }
    });

    it('should accept optional skipScreenshot parameter', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      // Verify the schema accepts the parameter
      expect(tool!.definition.inputSchema.properties).toHaveProperty('skipScreenshot');
      expect(tool!.definition.inputSchema.properties.skipScreenshot.type).toBe('boolean');
    });

    it('should accept optional device parameter', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      // Verify the schema accepts the parameter
      expect(tool!.definition.inputSchema.properties).toHaveProperty('device');
    });
  });

  describe('T053: UI Interaction', () => {
    it('should validate platform argument', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      await expect(
        tool!.handler({
          platform: 'invalid-platform',
          action: 'tap',
          x: 100,
          y: 200,
        })
      ).rejects.toThrow(/Invalid platform/);
    });

    it('should validate action argument', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      await expect(
        tool!.handler({
          platform: 'android',
          action: 'invalid-action',
        })
      ).rejects.toThrow(/Invalid action/);
    });

    it('should require coordinates for tap action', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      await expect(
        tool!.handler({
          platform: 'android',
          action: 'tap',
          // Missing x, y coordinates
        })
      ).rejects.toThrow();
    });

    it('should require text for type action', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      await expect(
        tool!.handler({
          platform: 'android',
          action: 'type',
          // Missing text
        })
      ).rejects.toThrow();
    });

    it('should support swipe action with direction', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      // Verify schema supports swipe parameters
      const schema = tool!.definition.inputSchema;
      expect(schema.properties).toHaveProperty('direction');
    });

    it('should accept valid tap action with coordinates', async () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      try {
        await tool!.handler({
          platform: 'android',
          action: 'tap',
          x: 100,
          y: 200,
        });
      } catch (error) {
        // Expected to fail without device, but should get past validation
        expect(String(error)).not.toMatch(/Invalid action/);
        expect(String(error)).not.toMatch(/Invalid platform/);
      }
    });
  });

  describe('UI Tool Response Format', () => {
    it('get_ui_context should define UIContext return structure', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('get_ui_context');

      // Tool exists and has a handler
      expect(tool).toBeDefined();
      expect(tool!.handler).toBeInstanceOf(Function);
    });

    it('interact_with_ui should define interaction result structure', () => {
      const registry = getToolRegistry();
      const tool = registry.getTool('interact_with_ui');

      // Tool exists and has a handler
      expect(tool).toBeDefined();
      expect(tool!.handler).toBeInstanceOf(Function);
    });
  });
});
