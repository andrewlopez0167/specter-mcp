/**
 * Environment Tools Module
 * Exports all environment-related MCP tools
 */

export {
  listDevices,
  registerListDevicesTool,
  type ListDevicesArgs,
  type ListDevicesResult,
} from './list-devices.js';

export {
  manageEnv,
  registerManageEnvTool,
  type ManageEnvArgs,
} from './manage-env.js';

export {
  cleanProject,
  registerCleanProjectTool,
  createCleanSummary,
  type CleanProjectArgs,
} from './clean-project.js';

/**
 * Register all environment tools
 */
export function registerEnvironmentTools(): void {
  const { registerListDevicesTool } = require('./list-devices.js');
  const { registerManageEnvTool } = require('./manage-env.js');
  const { registerCleanProjectTool } = require('./clean-project.js');

  registerListDevicesTool();
  registerManageEnvTool();
  registerCleanProjectTool();
}
