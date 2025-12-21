/**
 * Lint Result Models
 * Unified lint result types for Detekt, Android Lint, and SwiftLint
 */

import { Platform } from './constants.js';

/**
 * Lint issue severity
 */
export type LintSeverity = 'error' | 'warning' | 'info' | 'style';

/**
 * Individual lint issue
 */
export interface LintIssue {
  /** Issue ID/rule name */
  ruleId: string;
  /** Issue severity */
  severity: LintSeverity;
  /** Issue message */
  message: string;
  /** Source file path */
  file: string;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based, optional) */
  column?: number;
  /** End line (for range issues) */
  endLine?: number;
  /** End column (for range issues) */
  endColumn?: number;
  /** Category/group */
  category?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Lint result for a single file
 */
export interface FileLintResult {
  /** File path */
  file: string;
  /** Issues in this file */
  issues: LintIssue[];
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
}

/**
 * Overall lint result
 */
export interface LintResult {
  /** Target platform */
  platform: Platform;
  /** Linter tool used */
  linter: 'detekt' | 'android-lint' | 'swiftlint' | 'ktlint';
  /** Overall success (no errors) */
  success: boolean;
  /** Total issues found */
  totalIssues: number;
  /** Error count */
  errorCount: number;
  /** Warning count */
  warningCount: number;
  /** Info count */
  infoCount: number;
  /** Style count */
  styleCount: number;
  /** Files with issues */
  files: FileLintResult[];
  /** Duration in milliseconds */
  durationMs: number;
  /** Timestamp */
  timestamp: number;
  /** Raw output (truncated) */
  rawOutput?: string;
}

/**
 * Parse Detekt XML output
 */
export function parseDetektXml(xml: string): LintIssue[] {
  const issues: LintIssue[] = [];

  // Get all file elements first
  const fileMatches = Array.from(xml.matchAll(/<file[^>]*name="([^"]*)"[^>]*>([\s\S]*?)<\/file>/g));

  for (const fileMatch of fileMatches) {
    const [, fileName, fileContent] = fileMatch;

    // Match error elements within this file
    const errorMatches = fileContent.matchAll(
      /<error[^>]*\/?>/g
    );

    for (const errorMatch of errorMatches) {
      const errorTag = errorMatch[0];

      // Extract attributes individually for flexibility
      const lineMatch = errorTag.match(/line="(\d+)"/);
      const columnMatch = errorTag.match(/column="(\d+)"/);
      const severityMatch = errorTag.match(/severity="([^"]*)"/);
      const messageMatch = errorTag.match(/message="([^"]*)"/);
      const sourceMatch = errorTag.match(/source="([^"]*)"/);

      if (lineMatch && severityMatch && messageMatch && sourceMatch) {
        const source = sourceMatch[1];
        issues.push({
          ruleId: source.split('.').pop() || source,
          severity: mapSeverity(severityMatch[1]),
          message: decodeXmlEntities(messageMatch[1]),
          file: fileName,
          line: parseInt(lineMatch[1]),
          column: columnMatch ? parseInt(columnMatch[1]) : undefined,
          category: source.split('.').slice(0, -1).join('.'),
        });
      }
    }
  }

  return issues;
}

/**
 * Parse Android Lint XML output
 */
export function parseAndroidLintXml(xml: string): LintIssue[] {
  const issues: LintIssue[] = [];

  const issueMatches = xml.matchAll(
    /<issue[^>]*id="([^"]*)"[^>]*severity="([^"]*)"[^>]*message="([^"]*)"[^>]*category="([^"]*)"[^>]*>[^<]*<location[^>]*file="([^"]*)"[^>]*line="(\d+)"[^>]*(?:column="(\d+)")?[^>]*\/?>/g
  );

  for (const match of issueMatches) {
    const [, id, severity, message, category, file, line, column] = match;

    issues.push({
      ruleId: id,
      severity: mapSeverity(severity),
      message: decodeXmlEntities(message),
      file,
      line: parseInt(line),
      column: column ? parseInt(column) : undefined,
      category,
    });
  }

  return issues;
}

/**
 * Parse SwiftLint JSON output
 */
export function parseSwiftLintJson(json: string): LintIssue[] {
  const issues: LintIssue[] = [];

  try {
    const results = JSON.parse(json) as Array<{
      file: string;
      line: number;
      character?: number;
      severity: string;
      type: string;
      rule_id: string;
      reason: string;
    }>;

    for (const result of results) {
      issues.push({
        ruleId: result.rule_id,
        severity: mapSeverity(result.severity),
        message: result.reason,
        file: result.file,
        line: result.line,
        column: result.character,
        category: result.type,
      });
    }
  } catch {
    // Failed to parse JSON
  }

  return issues;
}

/**
 * Map severity string to LintSeverity
 */
function mapSeverity(severity: string): LintSeverity {
  const lower = severity.toLowerCase();
  if (lower === 'error' || lower === 'fatal') return 'error';
  if (lower === 'warning') return 'warning';
  if (lower === 'info' || lower === 'information') return 'info';
  return 'style';
}

/**
 * Decode XML entities
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Group issues by file
 */
export function groupIssuesByFile(issues: LintIssue[]): FileLintResult[] {
  const fileMap = new Map<string, LintIssue[]>();

  for (const issue of issues) {
    const existing = fileMap.get(issue.file) || [];
    existing.push(issue);
    fileMap.set(issue.file, existing);
  }

  return Array.from(fileMap.entries()).map(([file, fileIssues]) => ({
    file,
    issues: fileIssues,
    errorCount: fileIssues.filter((i) => i.severity === 'error').length,
    warningCount: fileIssues.filter((i) => i.severity === 'warning').length,
  }));
}

/**
 * Create lint summary for AI consumption
 */
export function createLintSummary(result: LintResult): string {
  const lines: string[] = [
    `Lint Results: ${result.success ? 'PASSED' : 'FAILED'}`,
    `Linter: ${result.linter}`,
    `Total: ${result.totalIssues} | Errors: ${result.errorCount} | Warnings: ${result.warningCount}`,
    `Duration: ${(result.durationMs / 1000).toFixed(2)}s`,
  ];

  if (result.errorCount > 0) {
    lines.push('', 'Errors:');
    const errors = result.files
      .flatMap((f) => f.issues)
      .filter((i) => i.severity === 'error')
      .slice(0, 5);

    for (const error of errors) {
      const location = `${error.file.split('/').pop()}:${error.line}`;
      lines.push(`  [${error.ruleId}] ${location}: ${error.message.slice(0, 80)}`);
    }

    if (result.errorCount > 5) {
      lines.push(`  ... and ${result.errorCount - 5} more errors`);
    }
  }

  return lines.join('\n');
}

/**
 * Get fix suggestions for common lint issues
 */
export function getLintSuggestions(issue: LintIssue): string | undefined {
  const ruleId = issue.ruleId.toLowerCase();

  // Detekt rules
  if (ruleId.includes('magicnumber')) {
    return 'Extract magic numbers to named constants for better readability.';
  }
  if (ruleId.includes('longmethod')) {
    return 'Consider breaking this method into smaller, focused methods.';
  }
  if (ruleId.includes('complexity')) {
    return 'Reduce cyclomatic complexity by extracting conditions or using early returns.';
  }
  if (ruleId.includes('unused')) {
    return 'Remove unused code to improve maintainability.';
  }

  // Android Lint rules
  if (ruleId.includes('hardcodedtext')) {
    return 'Move hardcoded strings to strings.xml for localization support.';
  }
  if (ruleId.includes('missingpermission')) {
    return 'Add the required permission to AndroidManifest.xml.';
  }
  if (ruleId.includes('obsoleteapi')) {
    return 'Update to use the recommended replacement API.';
  }

  // SwiftLint rules
  if (ruleId.includes('line_length')) {
    return 'Break long lines for better readability.';
  }
  if (ruleId.includes('force_cast') || ruleId.includes('force_unwrap')) {
    return 'Use optional binding (if let/guard let) instead of force unwrapping.';
  }

  return undefined;
}
