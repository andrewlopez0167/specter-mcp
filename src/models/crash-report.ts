/**
 * Crash Report Types
 * Structured types for iOS crash log parsing and symbolication
 */

import { Platform } from './constants.js';

/**
 * Single stack frame in a crash thread
 */
export interface StackFrame {
  /** Frame index (0 = crash point) */
  index: number;
  /** Binary/library name */
  binary: string;
  /** Memory address */
  address: string;
  /** Symbol name (after symbolication, or raw address) */
  symbol: string;
  /** Offset from symbol base */
  offset?: number;
  /** Source file path (if symbolicated) */
  file?: string;
  /** Line number (if symbolicated) */
  line?: number;
  /** Whether this frame is from app code vs system */
  isAppCode: boolean;
}

/**
 * Thread information from crash report
 */
export interface ThreadInfo {
  /** Thread index */
  index: number;
  /** Thread name (if available) */
  name?: string;
  /** Whether this thread crashed */
  crashed: boolean;
  /** Stack frames for this thread */
  frames: StackFrame[];
  /** Thread state (if available) */
  state?: string;
}

/**
 * Exception/signal information
 */
export interface CrashException {
  /** Exception type (e.g., "EXC_BAD_ACCESS", "SIGABRT") */
  type: string;
  /** Exception code/subcode */
  codes?: string;
  /** Signal number (if signal-based) */
  signal?: string;
  /** Signal code */
  signalCode?: string;
  /** Faulting address (for memory access crashes) */
  faultAddress?: string;
}

/**
 * Binary image for symbolication
 */
export interface BinaryImage {
  /** Binary name */
  name: string;
  /** Architecture (e.g., "arm64") */
  arch: string;
  /** UUID for dSYM matching */
  uuid: string;
  /** Load address */
  loadAddress: string;
  /** End address */
  endAddress?: string;
  /** Path to binary */
  path: string;
}

/**
 * Detected crash pattern with suggested cause
 */
export interface CrashPattern {
  /** Pattern identifier */
  id: string;
  /** Human-readable pattern name */
  name: string;
  /** Severity level */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Description of what this pattern indicates */
  description: string;
  /** Likely root cause */
  likelyCause: string;
  /** Suggested fix or investigation steps */
  suggestion: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Related stack frames that matched */
  matchedFrames?: StackFrame[];
}

/**
 * Complete crash report
 */
export interface CrashReport {
  /** Report identifier (from crash file) */
  reportId?: string;
  /** Crash timestamp */
  timestamp: Date;
  /** Target platform */
  platform: Platform;
  /** Device model */
  deviceModel?: string;
  /** OS version */
  osVersion?: string;
  /** Process name */
  processName: string;
  /** Bundle identifier */
  bundleId?: string;
  /** App version */
  appVersion?: string;
  /** Exception/signal information */
  exception: CrashException;
  /** All threads in the crash */
  threads: ThreadInfo[];
  /** Crashed thread (convenience accessor) */
  crashedThread: ThreadInfo;
  /** Binary images for symbolication */
  binaryImages: BinaryImage[];
  /** Whether the crash has been symbolicated */
  isSymbolicated: boolean;
  /** Detected patterns (after analysis) */
  patterns: CrashPattern[];
  /** Raw crash log text (for reference) */
  rawLog?: string;
}

/**
 * Crash analysis result from analyze_crash tool
 */
export interface CrashAnalysisResult {
  /** Whether analysis was successful */
  success: boolean;
  /** Parsed crash report */
  report?: CrashReport;
  /** AI-friendly summary of the crash */
  summary: string;
  /** Detected patterns ordered by severity/confidence */
  patterns: CrashPattern[];
  /** Suggested next steps */
  suggestions: string[];
  /** Error if analysis failed */
  error?: string;
  /** Analysis duration */
  durationMs: number;
}

/**
 * Known crash patterns for iOS
 */
export const CRASH_PATTERNS: Array<{
  id: string;
  name: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  matcher: (report: CrashReport) => boolean;
  description: string;
  likelyCause: string;
  suggestion: string;
}> = [
  {
    id: 'exc_bad_access_null',
    name: 'Null Pointer Dereference',
    severity: 'critical',
    matcher: (r) =>
      r.exception.type === 'EXC_BAD_ACCESS' &&
      (r.exception.faultAddress === '0x0' || r.exception.faultAddress?.startsWith('0x0000') === true),
    description: 'Attempted to access memory at a null pointer address',
    likelyCause: 'Force-unwrapping nil optional or accessing deallocated object',
    suggestion: 'Check for optional binding before accessing. Use guard let or if let.',
  },
  {
    id: 'exc_bad_access_kern_invalid',
    name: 'Invalid Memory Access',
    severity: 'critical',
    matcher: (r) =>
      r.exception.type === 'EXC_BAD_ACCESS' &&
      (r.exception.codes?.includes('KERN_INVALID_ADDRESS') ?? false),
    description: 'Attempted to access invalid memory region',
    likelyCause: 'Use-after-free, dangling pointer, or buffer overflow',
    suggestion: 'Enable Address Sanitizer in Xcode to catch memory issues at development time.',
  },
  {
    id: 'sigabrt_assertion',
    name: 'Assertion Failure',
    severity: 'high',
    matcher: (r) =>
      r.exception.type === 'SIGABRT' &&
      r.crashedThread.frames.some((f) =>
        f.symbol.includes('assert') || f.symbol.includes('fatalError')
      ),
    description: 'Application terminated due to assertion or fatalError',
    likelyCause: 'Precondition failed or explicit abort in code',
    suggestion: 'Check the assertion message in crash log for specific failure condition.',
  },
  {
    id: 'sigabrt_uncaught_exception',
    name: 'Uncaught Exception',
    severity: 'high',
    matcher: (r) =>
      r.exception.type === 'SIGABRT' &&
      r.crashedThread.frames.some((f) =>
        f.symbol.includes('objc_exception_throw') || f.symbol.includes('NSException')
      ),
    description: 'Uncaught Objective-C exception caused crash',
    likelyCause: 'NSException thrown but not caught (array bounds, invalid selector, etc.)',
    suggestion: 'Check Last Exception Backtrace in crash log for exception type and message.',
  },
  {
    id: 'watchdog_timeout',
    name: 'Watchdog Timeout',
    severity: 'critical',
    matcher: (r) =>
      r.exception.type === 'EXC_CRASH' &&
      ((r.rawLog?.includes('8badf00d') ?? false) || (r.rawLog?.toLowerCase().includes('watchdog') ?? false)),
    description: 'App was terminated by iOS watchdog for taking too long',
    likelyCause: 'Main thread blocked for too long (network, heavy computation, deadlock)',
    suggestion: 'Move long-running operations to background threads. Use async/await.',
  },
  {
    id: 'oom_jetsam',
    name: 'Out of Memory (Jetsam)',
    severity: 'high',
    matcher: (r) =>
      r.exception.type === 'EXC_RESOURCE' ||
      (r.rawLog?.includes('jetsam') ?? false) ||
      (r.rawLog?.includes('EXC_RESOURCE') ?? false),
    description: 'App was terminated due to excessive memory usage',
    likelyCause: 'Memory leak, loading large assets, or insufficient memory management',
    suggestion: 'Profile with Instruments. Check for retain cycles and large allocations.',
  },
  {
    id: 'sigbus_alignment',
    name: 'Bus Error (Alignment)',
    severity: 'critical',
    matcher: (r) => r.exception.type === 'SIGBUS',
    description: 'Memory alignment or hardware access error',
    likelyCause: 'Misaligned memory access or corrupted memory',
    suggestion: 'Check for pointer casting issues or corrupted data structures.',
  },
  {
    id: 'stack_overflow',
    name: 'Stack Overflow',
    severity: 'high',
    matcher: (r) => {
      const crashedFrames = r.crashedThread.frames;
      if (crashedFrames.length < 50) return false;
      // Check for repeating function pattern
      const funcCounts = new Map<string, number>();
      for (const f of crashedFrames) {
        funcCounts.set(f.symbol, (funcCounts.get(f.symbol) || 0) + 1);
      }
      return Array.from(funcCounts.values()).some((count) => count > 10);
    },
    description: 'Stack exhausted due to deep or infinite recursion',
    likelyCause: 'Recursive function without proper base case',
    suggestion: 'Check for infinite recursion. Consider using iterative approach.',
  },
  {
    id: 'swift_runtime_failure',
    name: 'Swift Runtime Error',
    severity: 'high',
    matcher: (r) =>
      r.crashedThread.frames.some((f) =>
        f.symbol.includes('swift_fatalError') ||
        f.symbol.includes('swift_unexpectedError') ||
        f.symbol.includes('_swift_stdlib_')
      ),
    description: 'Swift runtime detected an unrecoverable error',
    likelyCause: 'Force unwrap of nil, array index out of bounds, or precondition failure',
    suggestion: 'Look for force unwrap (!) or subscript access in the code path.',
  },
  {
    id: 'dispatch_queue_crash',
    name: 'GCD/Dispatch Crash',
    severity: 'medium',
    matcher: (r) =>
      r.crashedThread.frames.some((f) =>
        f.symbol.includes('dispatch_') || f.binary.includes('libdispatch')
      ),
    description: 'Crash in Grand Central Dispatch',
    likelyCause: 'Thread safety issue, accessing UI from background, or dispatch_sync deadlock',
    suggestion: 'Ensure UI updates on main thread. Check for dispatch_sync from same queue.',
  },
];

/**
 * Detect crash patterns from a crash report
 */
export function detectCrashPatterns(report: CrashReport): CrashPattern[] {
  const detected: CrashPattern[] = [];

  for (const pattern of CRASH_PATTERNS) {
    try {
      if (pattern.matcher(report)) {
        detected.push({
          id: pattern.id,
          name: pattern.name,
          severity: pattern.severity,
          description: pattern.description,
          likelyCause: pattern.likelyCause,
          suggestion: pattern.suggestion,
          confidence: calculateConfidence(pattern, report),
        });
      }
    } catch {
      // Pattern matcher failed, skip
    }
  }

  // Sort by severity then confidence
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  detected.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    return sevDiff !== 0 ? sevDiff : b.confidence - a.confidence;
  });

  return detected;
}

/**
 * Calculate confidence score for a pattern match
 */
function calculateConfidence(
  pattern: (typeof CRASH_PATTERNS)[0],
  report: CrashReport
): number {
  let confidence = 0.7; // Base confidence

  // Higher confidence if symbolicated
  if (report.isSymbolicated) {
    confidence += 0.1;
  }

  // Higher confidence for critical patterns with clear indicators
  if (pattern.severity === 'critical') {
    confidence += 0.1;
  }

  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

/**
 * Generate AI-friendly crash summary
 */
export function generateCrashSummary(report: CrashReport): string {
  const lines: string[] = [];

  lines.push(`## Crash Summary`);
  lines.push(``);
  lines.push(`**Process**: ${report.processName} (${report.bundleId || 'unknown'})`);
  lines.push(`**Exception**: ${report.exception.type}${report.exception.codes ? ` (${report.exception.codes})` : ''}`);
  lines.push(`**Device**: ${report.deviceModel || 'Unknown'} - ${report.osVersion || 'Unknown'}`);
  lines.push(`**Time**: ${report.timestamp.toISOString()}`);
  lines.push(``);

  // Crashed thread summary
  const crashed = report.crashedThread;
  lines.push(`### Crashed Thread (${crashed.index})`);
  lines.push(``);

  // Show top frames (first few app frames)
  const appFrames = crashed.frames.filter((f) => f.isAppCode).slice(0, 5);
  if (appFrames.length > 0) {
    lines.push(`**App Code:**`);
    for (const frame of appFrames) {
      const location = frame.file && frame.line ? ` (${frame.file}:${frame.line})` : '';
      lines.push(`  ${frame.index}: ${frame.symbol}${location}`);
    }
    lines.push(``);
  }

  // Show top system frames if no app frames
  if (appFrames.length === 0) {
    const topFrames = crashed.frames.slice(0, 5);
    lines.push(`**Stack:**`);
    for (const frame of topFrames) {
      lines.push(`  ${frame.index}: ${frame.binary} - ${frame.symbol}`);
    }
    lines.push(``);
  }

  // Detected patterns
  if (report.patterns.length > 0) {
    lines.push(`### Detected Patterns`);
    lines.push(``);
    for (const pattern of report.patterns) {
      lines.push(`- **${pattern.name}** (${pattern.severity}): ${pattern.description}`);
      lines.push(`  *Likely cause*: ${pattern.likelyCause}`);
    }
    lines.push(``);
  }

  return lines.join('\n');
}

/**
 * Generate suggestions from crash patterns
 */
export function generateCrashSuggestions(patterns: CrashPattern[]): string[] {
  const suggestions: string[] = [];

  for (const pattern of patterns) {
    suggestions.push(pattern.suggestion);
  }

  // Add general suggestions
  if (patterns.length === 0) {
    suggestions.push('Enable symbolication to get detailed stack traces');
    suggestions.push('Check application logs around crash time for context');
  }

  if (patterns.some((p) => p.severity === 'critical')) {
    suggestions.push('This is a critical crash - prioritize investigation');
  }

  return [...new Set(suggestions)]; // Deduplicate
}
