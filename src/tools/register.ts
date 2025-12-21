/**
 * Tool Registration Helper
 * Central registry for all MCP tools with schema definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Handler function type for tool execution
 */
export type ToolHandler<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs
) => Promise<TResult>;

/**
 * Registered tool with handler
 */
export interface RegisteredTool {
  definition: Tool;
  handler: ToolHandler;
}

/**
 * Tool registry for managing MCP tools
 */
class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  /**
   * Register a new tool
   */
  register(
    name: string,
    definition: Omit<Tool, 'name'>,
    handler: ToolHandler
  ): void {
    if (this.tools.has(name)) {
      console.warn(`[registry] Tool '${name}' already registered, overwriting`);
    }

    this.tools.set(name, {
      definition: { name, ...definition },
      handler,
    });
  }

  /**
   * Get a registered tool by name
   */
  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tool definitions
   */
  listTools(): Tool[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  /**
   * Check if a tool is registered
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get the number of registered tools
   */
  get count(): number {
    return this.tools.size;
  }

  /**
   * Clear all registered tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
  }
}

// Singleton instance
let globalRegistry: ToolRegistry | null = null;

/**
 * Get the global tool registry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!globalRegistry) {
    globalRegistry = new ToolRegistry();
  }
  return globalRegistry;
}

/**
 * Helper to create JSON schema for tool input
 */
export function createInputSchema(
  properties: Record<string, object>,
  required: string[] = []
): Tool['inputSchema'] {
  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Register all tools
 * This function will be called during server startup
 * Tool implementations will register themselves here
 */
export async function registerAllTools(): Promise<void> {
  const registry = getToolRegistry();

  // Clear existing registrations (for hot reload scenarios)
  registry.clear();

  // Register build tools
  const { registerBuildAppTool } = await import('./build/build-app.js');
  const { registerInstallAppTool } = await import('./build/install-app.js');
  const { registerLaunchAppTool } = await import('./build/launch-app.js');

  registerBuildAppTool();
  registerInstallAppTool();
  registerLaunchAppTool();

  // Register UI tools
  const { registerGetUIContextTool } = await import('./ui/get-ui-context.js');
  const { registerInteractWithUITool } = await import('./ui/interact-with-ui.js');

  registerGetUIContextTool();
  registerInteractWithUITool();

  // Register testing tools
  const { registerRunUnitTestsTool } = await import('./testing/run-unit-tests.js');
  const { registerRunMaestroFlowTool } = await import('./testing/run-maestro-flow.js');
  const { registerRunLinterTool } = await import('./testing/run-linter.js');

  registerRunUnitTestsTool();
  registerRunMaestroFlowTool();
  registerRunLinterTool();

  // Register environment tools
  const { registerListDevicesTool } = await import('./environment/list-devices.js');
  const { registerManageEnvTool } = await import('./environment/manage-env.js');
  const { registerCleanProjectTool } = await import('./environment/clean-project.js');

  registerListDevicesTool();
  registerManageEnvTool();
  registerCleanProjectTool();

  // Register crash analysis tools
  const { registerAnalyzeCrashTool } = await import('./crash/analyze-crash.js');

  registerAnalyzeCrashTool();

  // Register navigation tools
  const { registerDeepLinkNavigateTool } = await import('./navigation/deep-link-navigate.js');

  registerDeepLinkNavigateTool();

  // Register observability tools
  const { registerInspectAppStateTool } = await import('./observability/inspect-app-state.js');
  const { registerInspectLogsTool } = await import('./observability/inspect-logs.js');

  registerInspectAppStateTool();
  registerInspectLogsTool();

  console.error(`[registry] ${registry.count} tools registered`);
}

/**
 * Decorator to auto-register a tool handler
 */
export function tool(
  name: string,
  definition: Omit<Tool, 'name'>
): (handler: ToolHandler) => ToolHandler {
  return (handler: ToolHandler) => {
    getToolRegistry().register(name, definition, handler);
    return handler;
  };
}

export { ToolRegistry };
