/**
 * SQLite Database Inspector
 * Inspects SQLite databases on Android and iOS devices
 */

import { executeShell } from '../../utils/shell.js';
import {
  DatabaseInfo,
  DatabaseTable,
  DatabaseColumn,
  DatabaseQueryResult,
} from '../../models/app-state.js';
import { Platform } from '../../models/constants.js';

/**
 * Options for database inspection
 */
export interface DatabaseInspectOptions {
  /** Device ID */
  deviceId?: string;
  /** Specific database name */
  databaseName?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * List databases for an app
 */
export async function listDatabases(
  appId: string,
  platform: Platform,
  options: DatabaseInspectOptions = {}
): Promise<DatabaseInfo[]> {
  const { deviceId, timeoutMs = 15000 } = options;

  if (platform === 'android') {
    return listAndroidDatabases(appId, deviceId, timeoutMs);
  } else {
    return listIOSDatabases(appId, deviceId || 'booted', timeoutMs);
  }
}

/**
 * List Android databases
 */
async function listAndroidDatabases(
  packageName: string,
  deviceId?: string,
  timeoutMs: number = 15000
): Promise<DatabaseInfo[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const dbDir = `/data/data/${packageName}/databases`;
  args.push('shell', 'run-as', packageName, 'ls', '-la', dbDir);

  try {
    // Use silent: true since missing databases dir is normal for apps without SQLite
    const result = await executeShell('adb', args, { timeoutMs, silent: true });

    if (result.exitCode !== 0) {
      return [];
    }

    const databases: DatabaseInfo[] = [];
    const lines = result.stdout.split('\n');

    for (const line of lines) {
      // Parse ls -la output
      const match = line.match(/^[-rwx]+\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\S+\s+(.+\.db)$/);
      if (match) {
        const sizeBytes = parseInt(match[1], 10);
        const name = match[2];

        // Get table info
        const tables = await getAndroidDatabaseTables(
          packageName, name, deviceId, timeoutMs
        );

        databases.push({
          name,
          path: `${dbDir}/${name}`,
          sizeBytes,
          tables,
        });
      }
    }

    return databases;
  } catch {
    return [];
  }
}

/**
 * Get Android database tables
 */
async function getAndroidDatabaseTables(
  packageName: string,
  dbName: string,
  deviceId?: string,
  timeoutMs: number = 10000
): Promise<DatabaseTable[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const dbPath = `/data/data/${packageName}/databases/${dbName}`;

  // Query sqlite_master for tables
  args.push(
    'shell', 'run-as', packageName,
    'sqlite3', dbPath,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%';"
  );

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const tables: DatabaseTable[] = [];
    const tableNames = result.stdout.split('\n').filter((n) => n.trim());

    for (const tableName of tableNames) {
      const columns = await getAndroidTableColumns(
        packageName, dbName, tableName.trim(), deviceId, timeoutMs
      );
      const rowCount = await getAndroidTableRowCount(
        packageName, dbName, tableName.trim(), deviceId, timeoutMs
      );

      tables.push({
        name: tableName.trim(),
        columns,
        rowCount,
      });
    }

    return tables;
  } catch {
    return [];
  }
}

/**
 * Get Android table columns
 */
async function getAndroidTableColumns(
  packageName: string,
  dbName: string,
  tableName: string,
  deviceId?: string,
  timeoutMs: number = 5000
): Promise<DatabaseColumn[]> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const dbPath = `/data/data/${packageName}/databases/${dbName}`;
  args.push(
    'shell', 'run-as', packageName,
    'sqlite3', dbPath,
    `PRAGMA table_info(${tableName});`
  );

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const columns: DatabaseColumn[] = [];
    const lines = result.stdout.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      // PRAGMA table_info format: cid|name|type|notnull|dflt_value|pk
      const parts = line.split('|');
      if (parts.length >= 6) {
        columns.push({
          name: parts[1],
          type: parts[2] || 'TEXT',
          nullable: parts[3] !== '1',
          primaryKey: parts[5] === '1',
          defaultValue: parts[4] || undefined,
        });
      }
    }

    return columns;
  } catch {
    return [];
  }
}

/**
 * Get Android table row count
 */
async function getAndroidTableRowCount(
  packageName: string,
  dbName: string,
  tableName: string,
  deviceId?: string,
  timeoutMs: number = 5000
): Promise<number> {
  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const dbPath = `/data/data/${packageName}/databases/${dbName}`;
  args.push(
    'shell', 'run-as', packageName,
    'sqlite3', dbPath,
    `SELECT COUNT(*) FROM ${tableName};`
  );

  try {
    const result = await executeShell('adb', args, { timeoutMs });
    return result.exitCode === 0 ? parseInt(result.stdout.trim(), 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Execute SQL query on Android database
 */
export async function executeAndroidQuery(
  packageName: string,
  dbName: string,
  query: string,
  options: { deviceId?: string; maxRows?: number; timeoutMs?: number } = {}
): Promise<DatabaseQueryResult> {
  const { deviceId, maxRows = 100, timeoutMs = 15000 } = options;

  const args: string[] = [];

  if (deviceId) {
    args.push('-s', deviceId);
  }

  const dbPath = `/data/data/${packageName}/databases/${dbName}`;

  // Add LIMIT if it's a SELECT query without one
  let finalQuery = query.trim();
  if (finalQuery.toLowerCase().startsWith('select') && !finalQuery.toLowerCase().includes('limit')) {
    finalQuery = `${finalQuery} LIMIT ${maxRows}`;
  }

  args.push(
    'shell', 'run-as', packageName,
    'sqlite3', '-header', '-separator', '|', dbPath,
    finalQuery
  );

  try {
    const result = await executeShell('adb', args, { timeoutMs });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Query execution failed');
    }

    return parseQueryOutput(result.stdout);
  } catch (error) {
    throw error;
  }
}

/**
 * List iOS databases
 */
async function listIOSDatabases(
  bundleId: string,
  deviceId: string,
  timeoutMs: number = 15000
): Promise<DatabaseInfo[]> {
  // Get app container path
  const containerResult = await executeShell('xcrun', [
    'simctl', 'get_app_container', deviceId, bundleId, 'data',
  ], { timeoutMs: 5000 });

  if (containerResult.exitCode !== 0) {
    return [];
  }

  const containerPath = containerResult.stdout.trim();
  const documentsDir = `${containerPath}/Documents`;
  const libraryDir = `${containerPath}/Library`;

  const databases: DatabaseInfo[] = [];

  // Search for .sqlite and .db files
  for (const searchDir of [documentsDir, libraryDir]) {
    const findResult = await executeShell('find', [
      searchDir, '-name', '*.sqlite', '-o', '-name', '*.db',
    ], { timeoutMs });

    if (findResult.exitCode === 0) {
      const files = findResult.stdout.split('\n').filter((f) => f.trim());

      for (const filePath of files) {
        const name = filePath.split('/').pop() || '';
        const tables = await getIOSDatabaseTables(filePath, timeoutMs);

        databases.push({
          name,
          path: filePath,
          tables,
        });
      }
    }
  }

  return databases;
}

/**
 * Get iOS database tables
 */
async function getIOSDatabaseTables(
  dbPath: string,
  timeoutMs: number = 10000
): Promise<DatabaseTable[]> {
  const query = "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';";

  try {
    const result = await executeShell('sqlite3', [dbPath, query], { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const tables: DatabaseTable[] = [];
    const tableNames = result.stdout.split('\n').filter((n) => n.trim());

    for (const tableName of tableNames) {
      const columns = await getIOSTableColumns(dbPath, tableName.trim(), timeoutMs);
      const rowCount = await getIOSTableRowCount(dbPath, tableName.trim(), timeoutMs);

      tables.push({
        name: tableName.trim(),
        columns,
        rowCount,
      });
    }

    return tables;
  } catch {
    return [];
  }
}

/**
 * Get iOS table columns
 */
async function getIOSTableColumns(
  dbPath: string,
  tableName: string,
  timeoutMs: number = 5000
): Promise<DatabaseColumn[]> {
  try {
    const result = await executeShell('sqlite3', [
      dbPath, `PRAGMA table_info(${tableName});`,
    ], { timeoutMs });

    if (result.exitCode !== 0) {
      return [];
    }

    const columns: DatabaseColumn[] = [];
    const lines = result.stdout.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 6) {
        columns.push({
          name: parts[1],
          type: parts[2] || 'TEXT',
          nullable: parts[3] !== '1',
          primaryKey: parts[5] === '1',
          defaultValue: parts[4] || undefined,
        });
      }
    }

    return columns;
  } catch {
    return [];
  }
}

/**
 * Get iOS table row count
 */
async function getIOSTableRowCount(
  dbPath: string,
  tableName: string,
  timeoutMs: number = 5000
): Promise<number> {
  try {
    const result = await executeShell('sqlite3', [
      dbPath, `SELECT COUNT(*) FROM ${tableName};`,
    ], { timeoutMs });

    return result.exitCode === 0 ? parseInt(result.stdout.trim(), 10) || 0 : 0;
  } catch {
    return 0;
  }
}

/**
 * Execute SQL query on iOS database
 */
export async function executeIOSQuery(
  dbPath: string,
  query: string,
  options: { maxRows?: number; timeoutMs?: number } = {}
): Promise<DatabaseQueryResult> {
  const { maxRows = 100, timeoutMs = 15000 } = options;

  let finalQuery = query.trim();
  if (finalQuery.toLowerCase().startsWith('select') && !finalQuery.toLowerCase().includes('limit')) {
    finalQuery = `${finalQuery} LIMIT ${maxRows}`;
  }

  try {
    const result = await executeShell('sqlite3', [
      '-header', '-separator', '|', dbPath, finalQuery,
    ], { timeoutMs });

    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'Query execution failed');
    }

    return parseQueryOutput(result.stdout);
  } catch (error) {
    throw error;
  }
}

/**
 * Parse sqlite query output
 */
function parseQueryOutput(output: string): DatabaseQueryResult {
  const lines = output.split('\n').filter((l) => l.trim());

  if (lines.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }

  // First line is headers
  const columns = lines[0].split('|');
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('|');
    const row: Record<string, unknown> = {};

    for (let j = 0; j < columns.length; j++) {
      const value = values[j];
      // Try to parse as number or boolean
      if (value === 'NULL' || value === '') {
        row[columns[j]] = null;
      } else if (/^-?\d+$/.test(value)) {
        row[columns[j]] = parseInt(value, 10);
      } else if (/^-?\d+\.\d+$/.test(value)) {
        row[columns[j]] = parseFloat(value);
      } else {
        row[columns[j]] = value;
      }
    }

    rows.push(row);
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
  };
}
