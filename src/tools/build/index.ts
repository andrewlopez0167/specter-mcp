/**
 * Build Tools Module
 * Exports all build-related MCP tools
 */

export { buildApp, registerBuildAppTool, type BuildAppArgs } from './build-app.js';
export { installApp, registerInstallAppTool, type InstallAppArgs, type InstallResult } from './install-app.js';
export { launchApp, registerLaunchAppTool, type LaunchAppArgs, type LaunchResult } from './launch-app.js';
export { parseBuildLog, parseGradleLog, parseXcodeLog, extractErrorContext, type ParsedLog } from './log-parser.js';

/**
 * Register all build tools
 */
export function registerBuildTools(): void {
  // Import dynamically to avoid circular dependencies
  const { registerBuildAppTool } = require('./build-app.js');
  const { registerInstallAppTool } = require('./install-app.js');
  const { registerLaunchAppTool } = require('./launch-app.js');

  registerBuildAppTool();
  registerInstallAppTool();
  registerLaunchAppTool();
}
