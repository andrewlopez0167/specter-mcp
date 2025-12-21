/**
 * Crash Pattern Detector
 * Analyzes crash reports to identify common crash patterns and root causes
 */

import {
  CrashReport,
  CrashPattern,
  StackFrame,
  detectCrashPatterns,
  generateCrashSuggestions,
} from '../../models/crash-report.js';

/**
 * Extended pattern analysis result
 */
export interface PatternAnalysis {
  /** Detected patterns ordered by severity/confidence */
  patterns: CrashPattern[];
  /** Suggested investigation steps */
  suggestions: string[];
  /** Primary crash category */
  category: CrashCategory;
  /** Severity assessment */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Whether this looks like a user-reportable bug */
  isUserReportable: boolean;
  /** Key frames to investigate */
  keyFrames: StackFrame[];
}

/**
 * High-level crash category
 */
export type CrashCategory =
  | 'memory'
  | 'threading'
  | 'assertion'
  | 'exception'
  | 'resource'
  | 'watchdog'
  | 'unknown';

/**
 * Analyze crash report for patterns
 */
export function analyzePatterns(report: CrashReport): PatternAnalysis {
  // Detect patterns using the model's pattern detector
  const patterns = detectCrashPatterns(report);

  // Generate suggestions
  const suggestions = generateCrashSuggestions(patterns);

  // Determine category
  const category = determineCategory(report, patterns);

  // Determine severity
  const severity = determineSeverity(patterns, report);

  // Check if user-reportable
  const isUserReportable = checkUserReportable(report, patterns);

  // Find key frames to investigate
  const keyFrames = findKeyFrames(report);

  // Add additional context-specific suggestions
  const enhancedSuggestions = enhanceSuggestions(suggestions, report, patterns);

  return {
    patterns,
    suggestions: enhancedSuggestions,
    category,
    severity,
    isUserReportable,
    keyFrames,
  };
}

/**
 * Determine the high-level crash category
 */
function determineCategory(report: CrashReport, patterns: CrashPattern[]): CrashCategory {
  const exceptionType = report.exception.type;

  // Check for memory-related crashes
  if (
    exceptionType === 'EXC_BAD_ACCESS' ||
    exceptionType === 'SIGBUS' ||
    patterns.some((p) =>
      ['exc_bad_access_null', 'exc_bad_access_kern_invalid', 'stack_overflow'].includes(p.id)
    )
  ) {
    return 'memory';
  }

  // Check for threading issues
  if (
    patterns.some((p) => p.id === 'dispatch_queue_crash') ||
    report.crashedThread.frames.some(
      (f) => f.symbol.includes('dispatch_') || f.symbol.includes('pthread_')
    )
  ) {
    return 'threading';
  }

  // Check for assertions
  if (
    patterns.some((p) => ['sigabrt_assertion', 'swift_runtime_failure'].includes(p.id))
  ) {
    return 'assertion';
  }

  // Check for exceptions
  if (
    exceptionType === 'SIGABRT' ||
    patterns.some((p) => p.id === 'sigabrt_uncaught_exception')
  ) {
    return 'exception';
  }

  // Check for resource issues
  if (
    exceptionType === 'EXC_RESOURCE' ||
    patterns.some((p) => p.id === 'oom_jetsam')
  ) {
    return 'resource';
  }

  // Check for watchdog
  if (patterns.some((p) => p.id === 'watchdog_timeout')) {
    return 'watchdog';
  }

  return 'unknown';
}

/**
 * Determine overall severity
 */
function determineSeverity(
  patterns: CrashPattern[],
  report: CrashReport
): 'critical' | 'high' | 'medium' | 'low' {
  // If any critical pattern, return critical
  if (patterns.some((p) => p.severity === 'critical')) {
    return 'critical';
  }

  // If any high pattern, return high
  if (patterns.some((p) => p.severity === 'high')) {
    return 'high';
  }

  // If crash is in app code, at least medium
  if (report.crashedThread.frames.some((f) => f.isAppCode)) {
    return 'medium';
  }

  // Default to low
  return patterns.length > 0 ? 'medium' : 'low';
}

/**
 * Check if this crash should be reported to users
 */
function checkUserReportable(report: CrashReport, patterns: CrashPattern[]): boolean {
  // Watchdog timeouts usually indicate serious issues
  if (patterns.some((p) => p.id === 'watchdog_timeout')) {
    return true;
  }

  // OOM issues are user-reportable
  if (patterns.some((p) => p.id === 'oom_jetsam')) {
    return true;
  }

  // Crashes in app code are reportable
  if (report.crashedThread.frames.some((f) => f.isAppCode)) {
    return true;
  }

  return false;
}

/**
 * Find key frames to investigate
 */
function findKeyFrames(report: CrashReport): StackFrame[] {
  const keyFrames: StackFrame[] = [];
  const seen = new Set<string>();

  // Get app code frames from crashed thread first
  for (const frame of report.crashedThread.frames) {
    if (frame.isAppCode && !seen.has(frame.symbol)) {
      keyFrames.push(frame);
      seen.add(frame.symbol);
      if (keyFrames.length >= 5) break;
    }
  }

  // If we don't have enough app frames, include top system frames
  if (keyFrames.length < 3) {
    for (const frame of report.crashedThread.frames.slice(0, 3)) {
      if (!seen.has(frame.symbol)) {
        keyFrames.push(frame);
        seen.add(frame.symbol);
      }
    }
  }

  return keyFrames;
}

/**
 * Enhance suggestions with context-specific advice
 */
function enhanceSuggestions(
  baseSuggestions: string[],
  report: CrashReport,
  patterns: CrashPattern[]
): string[] {
  const enhanced = [...baseSuggestions];
  const category = determineCategory(report, patterns);

  // Add symbolication suggestion if not symbolicated
  if (!report.isSymbolicated) {
    enhanced.unshift(
      'Symbolicate the crash log with the matching dSYM to get detailed stack traces'
    );
  }

  // Category-specific suggestions
  switch (category) {
    case 'memory':
      if (!enhanced.some((s) => s.includes('Address Sanitizer'))) {
        enhanced.push('Run the app with Address Sanitizer enabled to catch memory issues');
      }
      if (!enhanced.some((s) => s.includes('Zombie'))) {
        enhanced.push('Enable Zombie Objects in Xcode to detect use-after-free');
      }
      break;

    case 'threading':
      enhanced.push('Use Thread Sanitizer to detect race conditions');
      enhanced.push('Check for UI updates from background threads');
      break;

    case 'resource':
      enhanced.push('Profile memory usage with Instruments Allocations tool');
      enhanced.push('Check for image and data caching strategies');
      break;

    case 'watchdog':
      enhanced.push('Profile main thread blocking with Time Profiler');
      enhanced.push('Check for synchronous network calls or file I/O on main thread');
      break;
  }

  // Deduplicate
  return [...new Set(enhanced)];
}

/**
 * Generate a concise crash description
 */
export function generateCrashDescription(report: CrashReport): string {
  const patterns = detectCrashPatterns(report);

  if (patterns.length > 0) {
    const primary = patterns[0];
    return `${primary.name}: ${primary.description}`;
  }

  const exceptionType = report.exception.type;
  const signal = report.exception.signal;

  if (signal) {
    return `${exceptionType} (${signal})`;
  }

  return exceptionType;
}

/**
 * Get top suspect functions from crash
 */
export function getTopSuspects(report: CrashReport): string[] {
  const suspects: string[] = [];

  for (const frame of report.crashedThread.frames) {
    if (frame.isAppCode && frame.symbol && !frame.symbol.startsWith('0x')) {
      // Clean up Swift mangled names
      const cleaned = cleanSymbolName(frame.symbol);
      if (!suspects.includes(cleaned)) {
        suspects.push(cleaned);
      }
      if (suspects.length >= 3) break;
    }
  }

  return suspects;
}

/**
 * Clean up symbol names for display
 */
function cleanSymbolName(symbol: string): string {
  // Swift demangled names are already readable
  // Try to extract the function name from mangled symbols
  const match = symbol.match(/\$s\d*(\w+)C\d*(\w+)/);
  if (match) {
    return `${match[1]}.${match[2]}()`;
  }

  // Objective-C style
  const objcMatch = symbol.match(/[-+]\[(\w+)\s+(\w+)\]/);
  if (objcMatch) {
    return `${objcMatch[1]}.${objcMatch[2]}()`;
  }

  // Already clean or can't parse
  return symbol;
}

/**
 * Check if crash is likely reproducible
 */
export function isLikelyReproducible(report: CrashReport): boolean {
  const patterns = detectCrashPatterns(report);

  // Null pointer crashes are usually reproducible with same input
  if (patterns.some((p) => p.id === 'exc_bad_access_null')) {
    return true;
  }

  // Assertion failures are reproducible
  if (patterns.some((p) => p.id === 'sigabrt_assertion')) {
    return true;
  }

  // Threading issues may be flaky
  if (report.crashedThread.frames.some((f) => f.symbol.includes('dispatch_'))) {
    return false;
  }

  // Memory issues may be timing-dependent
  if (patterns.some((p) => p.id === 'oom_jetsam')) {
    return false;
  }

  return true;
}
