/**
 * Navigation Tools Module
 * Exports all navigation-related MCP tools
 */

export {
  deepLinkNavigate,
  registerDeepLinkNavigateTool,
  formatNavigationResult,
  type DeepLinkNavigateArgs,
  type DeepLinkResult,
} from './deep-link-navigate.js';

/**
 * Register all navigation tools
 */
export function registerNavigationTools(): void {
  const { registerDeepLinkNavigateTool } = require('./deep-link-navigate.js');
  registerDeepLinkNavigateTool();
}
