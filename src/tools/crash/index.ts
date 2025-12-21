/**
 * Crash Analysis Tools Module
 * Exports all crash-related MCP tools
 */

export {
  analyzeCrash,
  registerAnalyzeCrashTool,
  formatAnalysisForAI,
  type AnalyzeCrashArgs,
  type ExtendedCrashAnalysis,
} from './analyze-crash.js';

export {
  analyzePatterns,
  generateCrashDescription,
  getTopSuspects,
  isLikelyReproducible,
  type PatternAnalysis,
  type CrashCategory,
} from './pattern-detector.js';

/**
 * Register all crash analysis tools
 */
export function registerCrashTools(): void {
  const { registerAnalyzeCrashTool } = require('./analyze-crash.js');
  registerAnalyzeCrashTool();
}
