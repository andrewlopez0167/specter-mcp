/**
 * inspect_app_state Tool Handler
 * MCP tool for inspecting app preferences and databases
 */

import { isPlatform, Platform } from '../../models/constants.js';
import { Errors } from '../../models/errors.js';
import {
  AppState,
  AppStateResult,
  DatabaseQueryResult,
  generateAppStateSummary,
} from '../../models/app-state.js';
import { readSharedPreferences } from '../../platforms/android/prefs-reader.js';
import { readUserDefaults, getAppContainerPath } from '../../platforms/ios/prefs-reader.js';
import {
  listDatabases,
  executeAndroidQuery,
  executeIOSQuery,
} from './sqlite-inspector.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for inspect_app_state tool
 */
export interface InspectAppStateArgs {
  /** App package/bundle ID */
  appId: string;
  /** Target platform */
  platform: string;
  /** Device ID */
  deviceId?: string;
  /** Include preferences */
  includePreferences?: boolean;
  /** Include databases */
  includeDatabases?: boolean;
  /** Specific preferences file name */
  preferencesFile?: string;
  /** Specific database name */
  databaseName?: string;
  /** SQL query to run */
  sqlQuery?: string;
  /** Maximum rows to return */
  maxRows?: number;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Inspect app state tool handler
 */
export async function inspectAppState(args: InspectAppStateArgs): Promise<AppStateResult> {
  const {
    appId,
    platform,
    deviceId,
    includePreferences = true,
    includeDatabases = true,
    preferencesFile,
    databaseName,
    sqlQuery,
    maxRows = 100,
    timeoutMs = 30000,
  } = args;

  const startTime = Date.now();

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate app ID
  if (!appId || appId.trim().length === 0) {
    throw Errors.invalidArguments('App ID is required');
  }

  try {
    // If SQL query is provided, execute it directly
    if (sqlQuery && databaseName) {
      const queryResult = await executeSqlQuery(
        appId,
        platform,
        databaseName,
        sqlQuery,
        { deviceId, maxRows, timeoutMs }
      );

      return {
        success: true,
        queryResult,
        durationMs: Date.now() - startTime,
      };
    }

    // Collect app state
    const state = await collectAppState(appId, platform, {
      deviceId,
      includePreferences,
      includeDatabases,
      preferencesFile,
      databaseName,
      timeoutMs,
    });

    return {
      success: true,
      state,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: String(error),
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Collect app state from device
 */
async function collectAppState(
  appId: string,
  platform: Platform,
  options: {
    deviceId?: string;
    includePreferences: boolean;
    includeDatabases: boolean;
    preferencesFile?: string;
    databaseName?: string;
    timeoutMs: number;
  }
): Promise<AppState> {
  const state: AppState = {
    platform,
    appId,
    preferences: [],
    databases: [],
    timestamp: new Date(),
    durationMs: 0,
  };

  const startTime = Date.now();

  // Collect preferences
  if (options.includePreferences) {
    if (platform === 'android') {
      state.preferences = await readSharedPreferences(appId, {
        deviceId: options.deviceId,
        fileName: options.preferencesFile,
        timeoutMs: options.timeoutMs,
      });
    } else {
      state.preferences = await readUserDefaults(appId, {
        deviceId: options.deviceId,
        fileName: options.preferencesFile,
        timeoutMs: options.timeoutMs,
      });
    }
  }

  // Collect databases
  if (options.includeDatabases) {
    state.databases = await listDatabases(appId, platform, {
      deviceId: options.deviceId,
      databaseName: options.databaseName,
      timeoutMs: options.timeoutMs,
    });
  }

  state.durationMs = Date.now() - startTime;

  return state;
}

/**
 * Execute SQL query on database
 */
async function executeSqlQuery(
  appId: string,
  platform: Platform,
  databaseName: string,
  query: string,
  options: { deviceId?: string; maxRows: number; timeoutMs: number }
): Promise<DatabaseQueryResult> {
  if (platform === 'android') {
    return executeAndroidQuery(appId, databaseName, query, options);
  } else {
    // For iOS, we need to get the full database path first
    const containerPath = await getAppContainerPath(
      appId,
      options.deviceId || 'booted',
      5000
    );

    if (!containerPath) {
      throw new Error(`App ${appId} not found on device`);
    }

    // Try common locations
    const possiblePaths = [
      `${containerPath}/Documents/${databaseName}`,
      `${containerPath}/Library/${databaseName}`,
      `${containerPath}/Library/Application Support/${databaseName}`,
    ];

    for (const dbPath of possiblePaths) {
      try {
        return await executeIOSQuery(dbPath, query, options);
      } catch {
        // Try next path
      }
    }

    throw new Error(`Database ${databaseName} not found for app ${appId}`);
  }
}

/**
 * Format inspection result for AI
 */
export function formatInspectionResult(result: AppStateResult): string {
  const lines: string[] = [];

  if (!result.success) {
    lines.push(`## App State Inspection: Failed`);
    lines.push(``);
    lines.push(`**Error**: ${result.error}`);
    return lines.join('\n');
  }

  if (result.queryResult) {
    lines.push(`## SQL Query Result`);
    lines.push(``);
    lines.push(`**Rows**: ${result.queryResult.rowCount}`);
    lines.push(`**Columns**: ${result.queryResult.columns.join(', ')}`);
    lines.push(``);

    if (result.queryResult.rows.length > 0) {
      lines.push(`### Data`);
      lines.push(``);

      // Format as markdown table
      lines.push(`| ${result.queryResult.columns.join(' | ')} |`);
      lines.push(`| ${result.queryResult.columns.map(() => '---').join(' | ')} |`);

      for (const row of result.queryResult.rows.slice(0, 20)) {
        const values = result.queryResult.columns.map((col) => {
          const value = row[col];
          if (value === null) return 'NULL';
          if (typeof value === 'string' && value.length > 30) {
            return value.slice(0, 30) + '...';
          }
          return String(value);
        });
        lines.push(`| ${values.join(' | ')} |`);
      }

      if (result.queryResult.rows.length > 20) {
        lines.push(``);
        lines.push(`*Showing 20 of ${result.queryResult.rows.length} rows*`);
      }
    }

    return lines.join('\n');
  }

  if (result.state) {
    return generateAppStateSummary(result.state);
  }

  return 'No data available';
}

/**
 * Register the inspect_app_state tool
 */
export function registerInspectAppStateTool(): void {
  getToolRegistry().register(
    'inspect_app_state',
    {
      description:
        'Inspect app preferences (SharedPreferences/UserDefaults) and SQLite databases. ' +
        'Can list all preferences, inspect specific databases, or run SQL queries.',
      inputSchema: createInputSchema(
        {
          appId: {
            type: 'string',
            description: 'App package name (Android) or bundle ID (iOS)',
          },
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID (optional, uses first available)',
          },
          includePreferences: {
            type: 'boolean',
            description: 'Include preferences in inspection (default: true)',
          },
          includeDatabases: {
            type: 'boolean',
            description: 'Include databases in inspection (default: true)',
          },
          preferencesFile: {
            type: 'string',
            description: 'Specific preferences file to inspect',
          },
          databaseName: {
            type: 'string',
            description: 'Specific database name to inspect or query',
          },
          sqlQuery: {
            type: 'string',
            description: 'SQL query to execute (requires databaseName)',
          },
          maxRows: {
            type: 'number',
            description: 'Maximum rows to return from query (default: 100)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Timeout in milliseconds (default: 30000)',
          },
        },
        ['appId', 'platform']
      ),
    },
    async (args) => {
      const result = await inspectAppState(args as unknown as InspectAppStateArgs);
      return {
        ...result,
        formattedOutput: formatInspectionResult(result),
      };
    }
  );
}
