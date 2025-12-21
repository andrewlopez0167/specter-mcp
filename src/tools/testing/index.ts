/**
 * Testing Tools Module
 * Exports all testing-related MCP tools
 */

export {
  runUnitTests,
  registerRunUnitTestsTool,
  type RunUnitTestsArgs,
  type RunUnitTestsResult,
} from './run-unit-tests.js';

export {
  runMaestroFlowTool,
  registerRunMaestroFlowTool,
  type RunMaestroFlowArgs,
  type RunMaestroFlowResult,
} from './run-maestro-flow.js';

export {
  runLinter,
  registerRunLinterTool,
  type RunLinterArgs,
  type RunLinterResult,
  type LinterType,
} from './run-linter.js';

export {
  runMaestroFlow,
  isMaestroAvailable,
  getMaestroVersion,
  type MaestroRunOptions,
} from './maestro-executor.js';

export {
  generateFailureBundle,
  createMinimalFailureBundle,
  serializeFailureBundle,
  getFailureBundleSummary,
  type FailureBundleOptions,
} from './failure-bundle.js';

/**
 * Register all testing tools
 */
export function registerTestingTools(): void {
  const { registerRunUnitTestsTool } = require('./run-unit-tests.js');
  const { registerRunMaestroFlowTool } = require('./run-maestro-flow.js');
  const { registerRunLinterTool } = require('./run-linter.js');

  registerRunUnitTestsTool();
  registerRunMaestroFlowTool();
  registerRunLinterTool();
}
