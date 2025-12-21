/**
 * UI Tools Module
 * Exports all UI-related MCP tools
 */

export {
  getUIContext,
  registerGetUIContextTool,
  type GetUIContextArgs,
} from './get-ui-context.js';

export {
  interactWithUI,
  registerInteractWithUITool,
  type InteractWithUIArgs,
} from './interact-with-ui.js';

/**
 * Register all UI tools
 */
export function registerUITools(): void {
  const { registerGetUIContextTool } = require('./get-ui-context.js');
  const { registerInteractWithUITool } = require('./interact-with-ui.js');

  registerGetUIContextTool();
  registerInteractWithUITool();
}
