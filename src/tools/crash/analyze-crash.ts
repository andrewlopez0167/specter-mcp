/**
 * analyze_crash Tool Handler
 * MCP tool for analyzing iOS crash logs with symbolication and pattern detection
 */

import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  CrashReport,
  CrashAnalysisResult,
  generateCrashSummary,
  detectCrashPatterns,
} from '../../models/crash-report.js';
import { Errors } from '../../models/errors.js';
import { parseCrashLog, findAppBinary } from '../../platforms/ios/crash-parser.js';
import {
  symbolicateCrashReport,
  findDSYMFile,
  findDSYMInCommonLocations,
  verifyDSYMMatch,
} from '../../platforms/ios/symbolicate.js';
import {
  analyzePatterns,
  generateCrashDescription,
  getTopSuspects,
  isLikelyReproducible,
} from './pattern-detector.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for analyze_crash tool
 */
export interface AnalyzeCrashArgs {
  /** Path to the crash log file (.ips or .crash) */
  crashLogPath: string;
  /** Path to dSYM file or directory (optional, will search common locations) */
  dsymPath?: string;
  /** Bundle ID of the app (helps find dSYM) */
  bundleId?: string;
  /** Skip symbolication (faster, less detailed) */
  skipSymbolication?: boolean;
  /** Include raw crash log in output */
  includeRawLog?: boolean;
}

/**
 * Extended analysis result with additional context
 */
export interface ExtendedCrashAnalysis extends CrashAnalysisResult {
  /** Crash description */
  description: string;
  /** Top suspect functions */
  suspects: string[];
  /** Whether crash is likely reproducible */
  reproducible: boolean;
  /** Crash category */
  category: string;
  /** dSYM status */
  dsymStatus: 'found' | 'not_found' | 'skipped' | 'mismatch';
}

/**
 * Analyze crash log tool handler
 */
export async function analyzeCrash(args: AnalyzeCrashArgs): Promise<ExtendedCrashAnalysis> {
  const {
    crashLogPath,
    dsymPath,
    bundleId,
    skipSymbolication = false,
    includeRawLog = false,
  } = args;

  const startTime = Date.now();

  // Validate crash log exists
  const resolvedPath = resolve(crashLogPath);
  if (!existsSync(resolvedPath)) {
    throw Errors.noCrashLogs(crashLogPath);
  }

  // Parse crash log
  let report: CrashReport;
  try {
    report = parseCrashLog(resolvedPath);
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse crash log: ${error}`,
      summary: '',
      patterns: [],
      suggestions: ['Ensure the crash log file is a valid .ips or .crash format'],
      durationMs: Date.now() - startTime,
      description: 'Parse Error',
      suspects: [],
      reproducible: false,
      category: 'unknown',
      dsymStatus: 'skipped',
    };
  }

  // Update bundle ID if provided
  if (bundleId && !report.bundleId) {
    report.bundleId = bundleId;
  }

  // Try to symbolicate
  let dsymStatus: 'found' | 'not_found' | 'skipped' | 'mismatch' = 'skipped';

  if (!skipSymbolication) {
    const symbolicationResult = await attemptSymbolication(report, dsymPath, bundleId);
    report = symbolicationResult.report;
    dsymStatus = symbolicationResult.status;
  }

  // Detect patterns
  const patterns = detectCrashPatterns(report);
  report.patterns = patterns;

  // Analyze patterns for extended info
  const analysis = analyzePatterns(report);

  // Generate summary
  const summary = generateCrashSummary(report);

  // Get description and suspects
  const description = generateCrashDescription(report);
  const suspects = getTopSuspects(report);
  const reproducible = isLikelyReproducible(report);

  // Clean up raw log if not requested
  if (!includeRawLog) {
    report.rawLog = undefined;
  }

  return {
    success: true,
    report,
    summary,
    patterns: analysis.patterns,
    suggestions: analysis.suggestions,
    durationMs: Date.now() - startTime,
    description,
    suspects,
    reproducible,
    category: analysis.category,
    dsymStatus,
  };
}

/**
 * Attempt to symbolicate the crash report
 */
async function attemptSymbolication(
  report: CrashReport,
  dsymPath?: string,
  bundleId?: string
): Promise<{ report: CrashReport; status: 'found' | 'not_found' | 'mismatch' }> {
  // Already symbolicated?
  if (report.isSymbolicated) {
    return { report, status: 'found' };
  }

  // Find app binary
  const appBinary = findAppBinary(report);
  if (!appBinary) {
    return { report, status: 'not_found' };
  }

  // Try to find dSYM
  let dsymFile: string | undefined;

  if (dsymPath) {
    dsymFile = findDSYMFile(dsymPath, appBinary.name);
    if (!dsymFile) {
      console.error(`[analyze_crash] dSYM not found at specified path: ${dsymPath}`);
    }
  }

  // Search common locations if not found
  if (!dsymFile) {
    const searchBundleId = bundleId || report.bundleId;
    if (searchBundleId) {
      dsymFile = findDSYMInCommonLocations(searchBundleId, appBinary.uuid);
    }
  }

  if (!dsymFile) {
    return { report, status: 'not_found' };
  }

  // Verify UUID match (optional but recommended)
  const uuidMatches = await verifyDSYMMatch(dsymFile, appBinary.uuid);
  if (!uuidMatches) {
    console.error(
      `[analyze_crash] dSYM UUID mismatch. Expected: ${appBinary.uuid}`
    );
    // Continue anyway - user may have provided correct dSYM
  }

  // Symbolicate
  try {
    const symbolicated = await symbolicateCrashReport(report, {
      dsymPath: dsymFile,
      arch: appBinary.arch,
      timeoutMs: 30000,
    });

    return {
      report: symbolicated,
      status: uuidMatches || symbolicated.isSymbolicated ? 'found' : 'mismatch',
    };
  } catch (error) {
    console.error(`[analyze_crash] Symbolication failed: ${error}`);
    return { report, status: 'not_found' };
  }
}

/**
 * Create AI-friendly output for the crash analysis
 */
export function formatAnalysisForAI(result: ExtendedCrashAnalysis): string {
  const lines: string[] = [];

  if (!result.success) {
    lines.push(`## Crash Analysis Failed`);
    lines.push(``);
    lines.push(`**Error**: ${result.error}`);
    lines.push(``);
    lines.push(`**Suggestions**:`);
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    return lines.join('\n');
  }

  lines.push(`## Crash Analysis`);
  lines.push(``);
  lines.push(`**Description**: ${result.description}`);
  lines.push(`**Category**: ${result.category}`);
  lines.push(`**Severity**: ${result.patterns[0]?.severity || 'unknown'}`);
  lines.push(`**Reproducible**: ${result.reproducible ? 'Likely' : 'May be flaky'}`);
  lines.push(`**Symbolication**: ${result.dsymStatus}`);
  lines.push(``);

  if (result.suspects.length > 0) {
    lines.push(`### Suspect Functions`);
    lines.push(``);
    for (const suspect of result.suspects) {
      lines.push(`- \`${suspect}\``);
    }
    lines.push(``);
  }

  lines.push(result.summary);

  if (result.suggestions.length > 0) {
    lines.push(``);
    lines.push(`### Recommended Actions`);
    lines.push(``);
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
  }

  return lines.join('\n');
}

/**
 * Register the analyze_crash tool
 */
export function registerAnalyzeCrashTool(): void {
  getToolRegistry().register(
    'analyze_crash',
    {
      description:
        'Analyze iOS crash logs (.ips or .crash files) to identify crash patterns, ' +
        'symbolicate stack traces, and provide root cause analysis with suggestions.',
      inputSchema: createInputSchema(
        {
          crashLogPath: {
            type: 'string',
            description: 'Path to the crash log file (.ips or .crash)',
          },
          dsymPath: {
            type: 'string',
            description:
              'Path to dSYM file or directory containing dSYMs (optional, will search common locations)',
          },
          bundleId: {
            type: 'string',
            description: 'Bundle ID of the crashed app (helps locate dSYM)',
          },
          skipSymbolication: {
            type: 'boolean',
            description: 'Skip symbolication for faster analysis (default: false)',
          },
          includeRawLog: {
            type: 'boolean',
            description: 'Include raw crash log in output (default: false)',
          },
        },
        ['crashLogPath']
      ),
    },
    async (args) => {
      const result = await analyzeCrash(args as unknown as AnalyzeCrashArgs);
      return {
        ...result,
        formattedOutput: formatAnalysisForAI(result),
      };
    }
  );
}
