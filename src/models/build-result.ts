/**
 * Build Result Types
 * Structured types for build outcomes with error parsing
 */

import { Platform, BuildVariant } from './constants.js';

/**
 * Single build error extracted from logs
 */
export interface BuildError {
  /** Error message text */
  message: string;
  /** Source file path (if available) */
  file?: string;
  /** Line number in source file */
  line?: number;
  /** Column number in source file */
  column?: number;
  /** Error code (e.g., "E0001", "error: cannot find symbol") */
  code?: string;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Context lines around the error */
  context?: string;
}

/**
 * Summary of build errors for AI consumption
 */
export interface BuildErrorSummary {
  /** Total number of errors */
  errorCount: number;
  /** Total number of warnings */
  warningCount: number;
  /** First few errors (most important) */
  topErrors: BuildError[];
  /** Categorized error types */
  errorCategories: ErrorCategory[];
  /** Common fix suggestions */
  suggestions: string[];
  /** Raw log excerpt (last N lines) */
  logTail?: string;
}

/**
 * Categorized error type for pattern analysis
 */
export interface ErrorCategory {
  /** Category name (e.g., "Type Errors", "Missing Import", "Syntax Error") */
  category: string;
  /** Number of errors in this category */
  count: number;
  /** Example error from this category */
  example: BuildError;
}

/**
 * Complete build result
 */
export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Target platform */
  platform: Platform;
  /** Build variant */
  variant: BuildVariant;
  /** Time taken in milliseconds */
  durationMs: number;
  /** Output artifact path (APK/IPA) */
  artifactPath?: string;
  /** Error summary (if build failed) */
  errorSummary?: BuildErrorSummary;
  /** Build command that was executed */
  command: string;
  /** Exit code from build process */
  exitCode: number;
}

/**
 * Build configuration options
 */
export interface BuildConfig {
  /** Target platform */
  platform: Platform;
  /** Build variant */
  variant: BuildVariant;
  /** Clean build (remove caches first) */
  clean?: boolean;
  /** Additional build arguments */
  extraArgs?: string[];
  /** Build timeout in milliseconds */
  timeoutMs?: number;
  /** Custom working directory */
  cwd?: string;
}

/**
 * Known error patterns for categorization
 */
export const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: string;
  suggestion: string;
}> = [
  {
    pattern: /cannot find symbol|unresolved reference/i,
    category: 'Missing Symbol',
    suggestion: 'Check for missing imports or typos in variable/function names',
  },
  {
    pattern: /type mismatch|incompatible types/i,
    category: 'Type Mismatch',
    suggestion: 'Verify that types match between assignment and declaration',
  },
  {
    pattern: /null pointer|nullable|null check|non-null|safe \(\?\.\)|!!\./i,
    category: 'Null Safety',
    suggestion: 'Add null checks or use safe call operators (?. or !!)',
  },
  {
    pattern: /expected|expecting|unexpected token/i,
    category: 'Syntax Error',
    suggestion: 'Check for missing brackets, semicolons, or parentheses',
  },
  {
    pattern: /duplicate|already defined/i,
    category: 'Duplicate Definition',
    suggestion: 'Remove duplicate declarations or rename conflicting symbols',
  },
  {
    pattern: /deprecated/i,
    category: 'Deprecation',
    suggestion: 'Update to use the recommended replacement API',
  },
  {
    pattern: /resource not found|missing resource/i,
    category: 'Missing Resource',
    suggestion: 'Verify resource file exists and is properly named',
  },
  {
    pattern: /build script|gradle|dependency/i,
    category: 'Build Configuration',
    suggestion: 'Check build.gradle files and dependency versions',
  },
];

/**
 * Parse error severity from message
 */
export function parseSeverity(message: string): 'error' | 'warning' {
  const lower = message.toLowerCase();
  if (lower.includes('warning:') || lower.startsWith('w:')) {
    return 'warning';
  }
  return 'error';
}

/**
 * Categorize an error based on known patterns
 */
export function categorizeError(error: BuildError): string {
  for (const { pattern, category } of ERROR_PATTERNS) {
    if (pattern.test(error.message)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Generate suggestions based on error categories
 */
export function generateSuggestions(categories: ErrorCategory[]): string[] {
  const suggestions: string[] = [];

  for (const cat of categories) {
    const pattern = ERROR_PATTERNS.find((p) => p.category === cat.category);
    if (pattern) {
      suggestions.push(pattern.suggestion);
    }
  }

  // Add general suggestions
  if (categories.length > 3) {
    suggestions.push('Consider running a clean build to resolve stale cache issues');
  }

  return [...new Set(suggestions)]; // Deduplicate
}
