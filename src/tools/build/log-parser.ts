/**
 * Build Log Parser
 * Unified parsing for Gradle and xcodebuild outputs
 */

import { Platform } from '../../models/constants.js';
import {
  BuildError,
  BuildErrorSummary,
  ErrorCategory,
  categorizeError,
  generateSuggestions,
} from '../../models/build-result.js';

export interface ParsedLog {
  errors: BuildError[];
  warnings: BuildError[];
  summary: BuildErrorSummary;
}

/**
 * Parse build log based on platform
 */
export function parseBuildLog(output: string, platform: Platform): ParsedLog {
  const parser = platform === 'android' ? parseGradleLog : parseXcodeLog;
  return parser(output);
}

/**
 * Parse Gradle build log
 */
export function parseGradleLog(output: string): ParsedLog {
  const errors: BuildError[] = [];
  const warnings: BuildError[] = [];
  const lines = output.split('\n');

  // Kotlin/Java error pattern: e: file:///path/file.kt:line:col message
  const kotlinErrorPattern = /^([ew]):\s*(?:file:\/\/)?([^:]+):(\d+):(\d+)\s*(.+)$/;

  // Java compiler error pattern: path.java:line: error: message
  const javaErrorPattern = /^(.+\.java):(\d+):\s*(error|warning):\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Kotlin compiler errors
    const kotlinMatch = trimmed.match(kotlinErrorPattern);
    if (kotlinMatch) {
      const [, severity, filePath, lineStr, colStr, message] = kotlinMatch;
      const error: BuildError = {
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity === 'w' ? 'warning' : 'error',
      };

      if (severity === 'w') {
        warnings.push(error);
      } else {
        errors.push(error);
      }
      continue;
    }

    // Match Java compiler errors
    const javaMatch = trimmed.match(javaErrorPattern);
    if (javaMatch) {
      const [, filePath, lineStr, severity, message] = javaMatch;
      const error: BuildError = {
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        severity: severity === 'warning' ? 'warning' : 'error',
      };

      if (severity === 'warning') {
        warnings.push(error);
      } else {
        errors.push(error);
      }
      continue;
    }

    // Match generic Gradle errors
    if (trimmed.startsWith('FAILURE:') || trimmed.includes('Execution failed for task')) {
      errors.push({
        message: trimmed,
        severity: 'error',
      });
    }
  }

  return {
    errors,
    warnings,
    summary: createSummary(errors, warnings, lines),
  };
}

/**
 * Parse xcodebuild log
 */
export function parseXcodeLog(output: string): ParsedLog {
  const errors: BuildError[] = [];
  const warnings: BuildError[] = [];
  const lines = output.split('\n');

  // Swift/Clang error pattern: /path/file.swift:line:col: error: message
  const swiftErrorPattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/;

  // Linker error pattern
  const linkerErrorPattern = /^(ld|clang):\s*(error|warning):\s*(.+)$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match Swift/Clang compiler errors
    const swiftMatch = trimmed.match(swiftErrorPattern);
    if (swiftMatch) {
      const [, filePath, lineStr, colStr, severity, message] = swiftMatch;
      const error: BuildError = {
        message: message.trim(),
        file: filePath,
        line: parseInt(lineStr, 10),
        column: parseInt(colStr, 10),
        severity: severity as 'error' | 'warning',
      };

      if (severity === 'warning') {
        warnings.push(error);
      } else {
        errors.push(error);
      }
      continue;
    }

    // Match linker errors
    const linkerMatch = trimmed.match(linkerErrorPattern);
    if (linkerMatch) {
      const [, , severity, message] = linkerMatch;
      const error: BuildError = {
        message: message.trim(),
        severity: severity as 'error' | 'warning',
      };

      if (severity === 'warning') {
        warnings.push(error);
      } else {
        errors.push(error);
      }
      continue;
    }

    // Match BUILD FAILED
    if (trimmed.includes('** BUILD FAILED **')) {
      // Don't add this as a separate error, it's just a marker
    }
  }

  return {
    errors,
    warnings,
    summary: createSummary(errors, warnings, lines),
  };
}

/**
 * Create error summary from parsed errors
 */
function createSummary(
  errors: BuildError[],
  warnings: BuildError[],
  logLines: string[]
): BuildErrorSummary {
  // Categorize errors
  const categoryMap = new Map<string, { errors: BuildError[]; example: BuildError }>();

  for (const error of errors) {
    const category = categorizeError(error);
    const existing = categoryMap.get(category);
    if (existing) {
      existing.errors.push(error);
    } else {
      categoryMap.set(category, { errors: [error], example: error });
    }
  }

  const errorCategories: ErrorCategory[] = Array.from(categoryMap.entries()).map(
    ([category, data]) => ({
      category,
      count: data.errors.length,
      example: data.example,
    })
  );

  // Sort by count descending
  errorCategories.sort((a, b) => b.count - a.count);

  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    topErrors: errors.slice(0, 5),
    errorCategories,
    suggestions: generateSuggestions(errorCategories),
    logTail: logLines.slice(-50).join('\n'),
  };
}

/**
 * Extract context around an error line
 */
export function extractErrorContext(
  fileContent: string,
  line: number,
  contextLines = 3
): string {
  const lines = fileContent.split('\n');
  const startLine = Math.max(0, line - contextLines - 1);
  const endLine = Math.min(lines.length, line + contextLines);

  return lines
    .slice(startLine, endLine)
    .map((l, i) => {
      const lineNum = startLine + i + 1;
      const marker = lineNum === line ? '>' : ' ';
      return `${marker} ${lineNum.toString().padStart(4)}: ${l}`;
    })
    .join('\n');
}
