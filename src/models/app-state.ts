/**
 * App State Types
 * Structured types for app state inspection (preferences, databases)
 */

import { Platform } from './constants.js';

/**
 * Preference value types
 */
export type PreferenceValue = string | number | boolean | string[] | null;

/**
 * Single preference entry
 */
export interface PreferenceEntry {
  /** Preference key */
  key: string;
  /** Preference value */
  value: PreferenceValue;
  /** Value type */
  type: 'string' | 'int' | 'long' | 'float' | 'boolean' | 'stringSet' | 'null';
}

/**
 * Preferences file/container
 */
export interface PreferencesFile {
  /** File name or container name */
  name: string;
  /** Full path to preferences file */
  path?: string;
  /** Preference entries */
  entries: PreferenceEntry[];
  /** Last modified time */
  lastModified?: Date;
}

/**
 * Database table info
 */
export interface DatabaseTable {
  /** Table name */
  name: string;
  /** Column definitions */
  columns: DatabaseColumn[];
  /** Row count */
  rowCount: number;
}

/**
 * Database column definition
 */
export interface DatabaseColumn {
  /** Column name */
  name: string;
  /** Column type (TEXT, INTEGER, REAL, BLOB, etc.) */
  type: string;
  /** Whether column is nullable */
  nullable: boolean;
  /** Whether column is primary key */
  primaryKey: boolean;
  /** Default value */
  defaultValue?: string;
}

/**
 * Database query result
 */
export interface DatabaseQueryResult {
  /** Column names */
  columns: string[];
  /** Row data */
  rows: Record<string, unknown>[];
  /** Number of rows returned */
  rowCount: number;
  /** Number of rows affected (for INSERT/UPDATE/DELETE) */
  rowsAffected?: number;
}

/**
 * Database info
 */
export interface DatabaseInfo {
  /** Database file name */
  name: string;
  /** Full path to database file */
  path: string;
  /** Database size in bytes */
  sizeBytes?: number;
  /** Tables in the database */
  tables: DatabaseTable[];
  /** SQLite version */
  sqliteVersion?: string;
}

/**
 * Complete app state snapshot
 */
export interface AppState {
  /** Target platform */
  platform: Platform;
  /** App package/bundle ID */
  appId: string;
  /** Preferences containers */
  preferences: PreferencesFile[];
  /** Databases */
  databases: DatabaseInfo[];
  /** Capture timestamp */
  timestamp: Date;
  /** Duration of capture in milliseconds */
  durationMs: number;
}

/**
 * App state inspection options
 */
export interface InspectAppStateOptions {
  /** App package/bundle ID */
  appId: string;
  /** Target platform */
  platform: Platform;
  /** Device ID */
  deviceId?: string;
  /** Include preferences */
  includePreferences?: boolean;
  /** Include databases */
  includeDatabases?: boolean;
  /** Specific preferences file to inspect */
  preferencesFile?: string;
  /** Specific database to inspect */
  databaseName?: string;
  /** SQL query to run on database */
  sqlQuery?: string;
  /** Maximum rows to return from query */
  maxRows?: number;
}

/**
 * Result of app state inspection
 */
export interface AppStateResult {
  /** Whether inspection was successful */
  success: boolean;
  /** App state data */
  state?: AppState;
  /** Query result (if SQL query was provided) */
  queryResult?: DatabaseQueryResult;
  /** Error message if failed */
  error?: string;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Parse Android SharedPreferences XML
 */
export function parseSharedPreferencesXml(xml: string): PreferenceEntry[] {
  const entries: PreferenceEntry[] = [];

  // Parse string entries: <string name="key">value</string>
  const stringMatches = xml.matchAll(/<string\s+name="([^"]+)">(.*?)<\/string>/gs);
  for (const match of stringMatches) {
    entries.push({
      key: match[1],
      value: unescapeXml(match[2]),
      type: 'string',
    });
  }

  // Parse int entries: <int name="key" value="123" />
  const intMatches = xml.matchAll(/<int\s+name="([^"]+)"\s+value="([^"]+)"\s*\/>/g);
  for (const match of intMatches) {
    entries.push({
      key: match[1],
      value: parseInt(match[2], 10),
      type: 'int',
    });
  }

  // Parse long entries: <long name="key" value="123" />
  const longMatches = xml.matchAll(/<long\s+name="([^"]+)"\s+value="([^"]+)"\s*\/>/g);
  for (const match of longMatches) {
    entries.push({
      key: match[1],
      value: parseInt(match[2], 10),
      type: 'long',
    });
  }

  // Parse float entries: <float name="key" value="1.23" />
  const floatMatches = xml.matchAll(/<float\s+name="([^"]+)"\s+value="([^"]+)"\s*\/>/g);
  for (const match of floatMatches) {
    entries.push({
      key: match[1],
      value: parseFloat(match[2]),
      type: 'float',
    });
  }

  // Parse boolean entries: <boolean name="key" value="true" />
  const boolMatches = xml.matchAll(/<boolean\s+name="([^"]+)"\s+value="([^"]+)"\s*\/>/g);
  for (const match of boolMatches) {
    entries.push({
      key: match[1],
      value: match[2] === 'true',
      type: 'boolean',
    });
  }

  // Parse string-set entries: <set name="key"><string>value1</string>...</set>
  const setMatches = xml.matchAll(/<set\s+name="([^"]+)">(.*?)<\/set>/gs);
  for (const match of setMatches) {
    const setContent = match[2];
    const values: string[] = [];
    const setStringMatches = setContent.matchAll(/<string>(.*?)<\/string>/g);
    for (const sm of setStringMatches) {
      values.push(unescapeXml(sm[1]));
    }
    entries.push({
      key: match[1],
      value: values,
      type: 'stringSet',
    });
  }

  return entries;
}

/**
 * Unescape XML entities
 */
function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Parse iOS plist (property list) - basic XML plist parsing
 */
export function parsePlistXml(xml: string): PreferenceEntry[] {
  const entries: PreferenceEntry[] = [];

  // Find dict content
  const dictMatch = xml.match(/<dict>(.*?)<\/dict>/s);
  if (!dictMatch) {
    return entries;
  }

  const dictContent = dictMatch[1];

  // Parse key-value pairs
  const keyValuePattern = /<key>([^<]+)<\/key>\s*(<string>([^<]*)<\/string>|<integer>([^<]+)<\/integer>|<real>([^<]+)<\/real>|<true\s*\/>|<false\s*\/>|<data>([^<]*)<\/data>|<array>.*?<\/array>|<dict>.*?<\/dict>)/gs;

  let match;
  while ((match = keyValuePattern.exec(dictContent)) !== null) {
    const key = match[1];
    const valueTag = match[2];

    if (valueTag.startsWith('<string>')) {
      entries.push({
        key,
        value: match[3] || '',
        type: 'string',
      });
    } else if (valueTag.startsWith('<integer>')) {
      entries.push({
        key,
        value: parseInt(match[4], 10),
        type: 'int',
      });
    } else if (valueTag.startsWith('<real>')) {
      entries.push({
        key,
        value: parseFloat(match[5]),
        type: 'float',
      });
    } else if (valueTag.includes('<true')) {
      entries.push({
        key,
        value: true,
        type: 'boolean',
      });
    } else if (valueTag.includes('<false')) {
      entries.push({
        key,
        value: false,
        type: 'boolean',
      });
    }
  }

  return entries;
}

/**
 * Generate AI-friendly summary of app state
 */
export function generateAppStateSummary(state: AppState): string {
  const lines: string[] = [];

  lines.push(`## App State: ${state.appId}`);
  lines.push(``);
  lines.push(`**Platform**: ${state.platform}`);
  lines.push(`**Captured**: ${state.timestamp.toISOString()}`);
  lines.push(``);

  // Preferences summary
  if (state.preferences.length > 0) {
    lines.push(`### Preferences`);
    lines.push(``);
    for (const pref of state.preferences) {
      lines.push(`**${pref.name}** (${pref.entries.length} entries)`);
      const preview = pref.entries.slice(0, 5);
      for (const entry of preview) {
        const valueStr = formatPreferenceValue(entry.value);
        lines.push(`  - \`${entry.key}\`: ${valueStr}`);
      }
      if (pref.entries.length > 5) {
        lines.push(`  - ... and ${pref.entries.length - 5} more`);
      }
      lines.push(``);
    }
  }

  // Database summary
  if (state.databases.length > 0) {
    lines.push(`### Databases`);
    lines.push(``);
    for (const db of state.databases) {
      const sizeStr = db.sizeBytes
        ? ` (${(db.sizeBytes / 1024).toFixed(1)} KB)`
        : '';
      lines.push(`**${db.name}**${sizeStr}`);
      lines.push(`Tables: ${db.tables.map((t) => `${t.name} (${t.rowCount} rows)`).join(', ')}`);
      lines.push(``);
    }
  }

  return lines.join('\n');
}

/**
 * Format preference value for display
 */
function formatPreferenceValue(value: PreferenceValue): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    if (value.length > 50) {
      return `"${value.slice(0, 50)}..."`;
    }
    return `"${value}"`;
  }
  if (Array.isArray(value)) {
    return `[${value.slice(0, 3).join(', ')}${value.length > 3 ? ', ...' : ''}]`;
  }
  return String(value);
}
