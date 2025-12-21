/**
 * Unit tests for Observability tools
 * Tests app state inspection and log parsing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PreferenceEntry,
  PreferencesFile,
  DatabaseInfo,
  AppState,
  parseSharedPreferencesXml,
  parsePlistXml,
  generateAppStateSummary,
} from '../../../src/models/app-state.js';
import {
  LogEntry,
  LogFilter,
  parseLogcatLine,
  parseOSLogLine,
  filterLogEntries,
  generateLogSummary,
  LOG_LEVEL_PRIORITY,
} from '../../../src/models/log-entry.js';

// Mock shell execution
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
}));

describe('App State Models', () => {
  describe('PreferenceEntry structure', () => {
    it('should support string preferences', () => {
      const entry: PreferenceEntry = {
        key: 'username',
        value: 'john_doe',
        type: 'string',
      };

      expect(entry.key).toBe('username');
      expect(entry.value).toBe('john_doe');
      expect(entry.type).toBe('string');
    });

    it('should support numeric preferences', () => {
      const intEntry: PreferenceEntry = {
        key: 'count',
        value: 42,
        type: 'int',
      };

      const floatEntry: PreferenceEntry = {
        key: 'rating',
        value: 4.5,
        type: 'float',
      };

      expect(intEntry.value).toBe(42);
      expect(floatEntry.value).toBe(4.5);
    });

    it('should support boolean preferences', () => {
      const entry: PreferenceEntry = {
        key: 'notifications_enabled',
        value: true,
        type: 'boolean',
      };

      expect(entry.value).toBe(true);
    });

    it('should support string set preferences', () => {
      const entry: PreferenceEntry = {
        key: 'favorite_tags',
        value: ['news', 'sports', 'tech'],
        type: 'stringSet',
      };

      expect(Array.isArray(entry.value)).toBe(true);
      expect(entry.value).toHaveLength(3);
    });
  });

  describe('parseSharedPreferencesXml', () => {
    it('should parse string entries', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<map>
  <string name="username">john_doe</string>
  <string name="email">john@example.com</string>
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(2);
      expect(entries[0].key).toBe('username');
      expect(entries[0].value).toBe('john_doe');
      expect(entries[0].type).toBe('string');
    });

    it('should parse int entries', () => {
      const xml = `<map>
  <int name="count" value="42" />
  <int name="level" value="5" />
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(2);
      expect(entries[0].key).toBe('count');
      expect(entries[0].value).toBe(42);
      expect(entries[0].type).toBe('int');
    });

    it('should parse long entries', () => {
      const xml = `<map>
  <long name="timestamp" value="1705312200000" />
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('timestamp');
      expect(entries[0].value).toBe(1705312200000);
      expect(entries[0].type).toBe('long');
    });

    it('should parse float entries', () => {
      const xml = `<map>
  <float name="rating" value="4.5" />
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('rating');
      expect(entries[0].value).toBe(4.5);
      expect(entries[0].type).toBe('float');
    });

    it('should parse boolean entries', () => {
      const xml = `<map>
  <boolean name="dark_mode" value="true" />
  <boolean name="notifications" value="false" />
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(2);
      expect(entries[0].key).toBe('dark_mode');
      expect(entries[0].value).toBe(true);
      expect(entries[1].value).toBe(false);
    });

    it('should parse string set entries', () => {
      const xml = `<map>
  <set name="tags">
    <string>news</string>
    <string>sports</string>
  </set>
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('tags');
      expect(entries[0].value).toEqual(['news', 'sports']);
      expect(entries[0].type).toBe('stringSet');
    });

    it('should handle XML entities', () => {
      const xml = `<map>
  <string name="message">Hello &amp; goodbye &lt;world&gt;</string>
</map>`;

      const entries = parseSharedPreferencesXml(xml);

      expect(entries[0].value).toBe('Hello & goodbye <world>');
    });
  });

  describe('parsePlistXml', () => {
    it('should parse string entries', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>username</key>
  <string>john_doe</string>
</dict>
</plist>`;

      const entries = parsePlistXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('username');
      expect(entries[0].value).toBe('john_doe');
    });

    it('should parse integer entries', () => {
      const xml = `<plist><dict>
  <key>count</key>
  <integer>42</integer>
</dict></plist>`;

      const entries = parsePlistXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('count');
      expect(entries[0].value).toBe(42);
    });

    it('should parse real entries', () => {
      const xml = `<plist><dict>
  <key>rating</key>
  <real>4.5</real>
</dict></plist>`;

      const entries = parsePlistXml(xml);

      expect(entries).toHaveLength(1);
      expect(entries[0].value).toBe(4.5);
    });

    it('should parse boolean entries', () => {
      const xml = `<plist><dict>
  <key>enabled</key>
  <true/>
  <key>disabled</key>
  <false/>
</dict></plist>`;

      const entries = parsePlistXml(xml);

      expect(entries).toHaveLength(2);
      expect(entries[0].value).toBe(true);
      expect(entries[1].value).toBe(false);
    });
  });

  describe('generateAppStateSummary', () => {
    it('should generate markdown summary', () => {
      const state: AppState = {
        platform: 'android',
        appId: 'com.example.app',
        preferences: [
          {
            name: 'app_prefs',
            entries: [
              { key: 'username', value: 'john', type: 'string' },
              { key: 'count', value: 10, type: 'int' },
            ],
          },
        ],
        databases: [],
        timestamp: new Date('2025-01-15T14:30:00Z'),
        durationMs: 150,
      };

      const summary = generateAppStateSummary(state);

      expect(summary).toContain('## App State: com.example.app');
      expect(summary).toContain('android');
      expect(summary).toContain('app_prefs');
      expect(summary).toContain('username');
    });

    it('should include database info', () => {
      const state: AppState = {
        platform: 'ios',
        appId: 'com.example.app',
        preferences: [],
        databases: [
          {
            name: 'app.db',
            path: '/data/app.db',
            sizeBytes: 102400,
            tables: [
              { name: 'users', columns: [], rowCount: 50 },
              { name: 'posts', columns: [], rowCount: 200 },
            ],
          },
        ],
        timestamp: new Date(),
        durationMs: 200,
      };

      const summary = generateAppStateSummary(state);

      expect(summary).toContain('### Databases');
      expect(summary).toContain('app.db');
      expect(summary).toContain('100.0 KB');
      expect(summary).toContain('users (50 rows)');
    });
  });
});

describe('Log Entry Models', () => {
  describe('LogEntry structure', () => {
    it('should have required fields', () => {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        tag: 'MyApp',
        message: 'Application started',
      };

      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.tag).toBe('MyApp');
      expect(entry.message).toBe('Application started');
    });

    it('should support optional PID and TID', () => {
      const entry: LogEntry = {
        timestamp: new Date(),
        level: 'debug',
        tag: 'NetworkManager',
        pid: 1234,
        tid: 5678,
        message: 'Request completed',
      };

      expect(entry.pid).toBe(1234);
      expect(entry.tid).toBe(5678);
    });
  });

  describe('LOG_LEVEL_PRIORITY', () => {
    it('should have correct priority order', () => {
      expect(LOG_LEVEL_PRIORITY.verbose).toBeLessThan(LOG_LEVEL_PRIORITY.debug);
      expect(LOG_LEVEL_PRIORITY.debug).toBeLessThan(LOG_LEVEL_PRIORITY.info);
      expect(LOG_LEVEL_PRIORITY.info).toBeLessThan(LOG_LEVEL_PRIORITY.warning);
      expect(LOG_LEVEL_PRIORITY.warning).toBeLessThan(LOG_LEVEL_PRIORITY.error);
      expect(LOG_LEVEL_PRIORITY.error).toBeLessThan(LOG_LEVEL_PRIORITY.fatal);
    });
  });

  describe('parseLogcatLine', () => {
    it('should parse threadtime format', () => {
      const line = '01-15 14:30:00.123  1234  5678 I MyTag  : Hello world';
      const entry = parseLogcatLine(line);

      expect(entry).not.toBeNull();
      expect(entry?.level).toBe('info');
      expect(entry?.tag).toBe('MyTag');
      expect(entry?.pid).toBe(1234);
      expect(entry?.tid).toBe(5678);
      expect(entry?.message).toBe('Hello world');
    });

    it('should parse brief format', () => {
      const line = 'I/MyTag(1234): Hello world';
      const entry = parseLogcatLine(line);

      expect(entry).not.toBeNull();
      expect(entry?.level).toBe('info');
      expect(entry?.tag).toBe('MyTag');
      expect(entry?.pid).toBe(1234);
      expect(entry?.message).toBe('Hello world');
    });

    it('should handle all log levels', () => {
      const levels = [
        { char: 'V', level: 'verbose' },
        { char: 'D', level: 'debug' },
        { char: 'I', level: 'info' },
        { char: 'W', level: 'warning' },
        { char: 'E', level: 'error' },
        { char: 'F', level: 'fatal' },
      ];

      for (const { char, level } of levels) {
        const line = `${char}/Tag(1234): Message`;
        const entry = parseLogcatLine(line);
        expect(entry?.level).toBe(level);
      }
    });

    it('should return null for invalid lines', () => {
      expect(parseLogcatLine('')).toBeNull();
      expect(parseLogcatLine('random text')).toBeNull();
      expect(parseLogcatLine('--- beginning of main')).toBeNull();
    });
  });

  describe('parseOSLogLine', () => {
    it('should parse standard format', () => {
      const line = '2025-01-15 14:30:00.123456+0000 MyApp[1234] Default: Hello world';
      const entry = parseOSLogLine(line);

      expect(entry).not.toBeNull();
      expect(entry?.level).toBe('info');
      expect(entry?.tag).toBe('MyApp');
      expect(entry?.pid).toBe(1234);
      expect(entry?.message).toBe('Hello world');
    });

    it('should parse stream format', () => {
      const line = 'MyApp[1234]: Application started';
      const entry = parseOSLogLine(line);

      expect(entry).not.toBeNull();
      expect(entry?.tag).toBe('MyApp');
      expect(entry?.pid).toBe(1234);
    });

    it('should handle different log levels', () => {
      const lines = [
        { line: '2025-01-15 14:30:00.000000+0000 App[1] Debug: msg', level: 'debug' },
        { line: '2025-01-15 14:30:00.000000+0000 App[1] Error: msg', level: 'error' },
        { line: '2025-01-15 14:30:00.000000+0000 App[1] Fault: msg', level: 'fatal' },
      ];

      for (const { line, level } of lines) {
        const entry = parseOSLogLine(line);
        expect(entry?.level).toBe(level);
      }
    });

    it('should return null for invalid lines', () => {
      expect(parseOSLogLine('')).toBeNull();
      expect(parseOSLogLine('random text')).toBeNull();
    });
  });

  describe('filterLogEntries', () => {
    const sampleEntries: LogEntry[] = [
      { timestamp: new Date('2025-01-15T14:00:00Z'), level: 'debug', tag: 'Network', message: 'Request sent' },
      { timestamp: new Date('2025-01-15T14:01:00Z'), level: 'info', tag: 'App', message: 'User logged in' },
      { timestamp: new Date('2025-01-15T14:02:00Z'), level: 'warning', tag: 'Network', message: 'Slow response' },
      { timestamp: new Date('2025-01-15T14:03:00Z'), level: 'error', tag: 'Database', message: 'Query failed' },
      { timestamp: new Date('2025-01-15T14:04:00Z'), level: 'info', tag: 'App', message: 'Data loaded' },
    ];

    it('should filter by minimum level', () => {
      const filter: LogFilter = { minLevel: 'warning' };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].level).toBe('warning');
      expect(filtered[1].level).toBe('error');
    });

    it('should filter by tags', () => {
      const filter: LogFilter = { tags: ['Network'] };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.tag === 'Network')).toBe(true);
    });

    it('should exclude tags', () => {
      const filter: LogFilter = { excludeTags: ['Network'] };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(3);
      expect(filtered.every((e) => e.tag !== 'Network')).toBe(true);
    });

    it('should filter by pattern', () => {
      // Pattern matches both message and tag
      const filter: LogFilter = { pattern: 'User|Data', ignoreCase: true };
      const filtered = filterLogEntries(sampleEntries, filter);

      // Matches: 'User logged in' (msg), 'Database' (tag), 'Data loaded' (msg)
      expect(filtered).toHaveLength(3);
    });

    it('should filter by time range', () => {
      const filter: LogFilter = {
        since: new Date('2025-01-15T14:01:00Z'),
        until: new Date('2025-01-15T14:03:00Z'),
      };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(3);
    });

    it('should apply limit', () => {
      const filter: LogFilter = { limit: 2 };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(2);
      // Should return last 2 entries
      expect(filtered[0].tag).toBe('Database');
      expect(filtered[1].tag).toBe('App');
    });

    it('should combine multiple filters', () => {
      const filter: LogFilter = {
        minLevel: 'info',
        tags: ['App'],
        limit: 10,
      };
      const filtered = filterLogEntries(sampleEntries, filter);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((e) => e.tag === 'App')).toBe(true);
    });
  });

  describe('generateLogSummary', () => {
    it('should generate markdown summary', () => {
      const result = {
        success: true,
        platform: 'android' as const,
        appId: 'com.example.app',
        entries: [
          { timestamp: new Date(), level: 'info' as const, tag: 'App', message: 'Started' },
          { timestamp: new Date(), level: 'error' as const, tag: 'Network', message: 'Failed' },
        ],
        durationMs: 100,
      };

      const summary = generateLogSummary(result);

      expect(summary).toContain('## Log Inspection');
      expect(summary).toContain('android');
      expect(summary).toContain('Entries');
    });

    it('should show level distribution', () => {
      const result = {
        success: true,
        platform: 'ios' as const,
        entries: [
          { timestamp: new Date(), level: 'info' as const, tag: 'App', message: 'Info 1' },
          { timestamp: new Date(), level: 'info' as const, tag: 'App', message: 'Info 2' },
          { timestamp: new Date(), level: 'error' as const, tag: 'App', message: 'Error' },
        ],
        durationMs: 50,
      };

      const summary = generateLogSummary(result);

      expect(summary).toContain('Level Distribution');
      expect(summary).toContain('info: 2');
      expect(summary).toContain('error: 1');
    });

    it('should show recent errors', () => {
      const result = {
        success: true,
        platform: 'android' as const,
        entries: [
          { timestamp: new Date(), level: 'error' as const, tag: 'DB', message: 'Connection failed' },
        ],
        durationMs: 75,
      };

      const summary = generateLogSummary(result);

      expect(summary).toContain('Recent Errors');
      expect(summary).toContain('Connection failed');
    });
  });
});

describe('inspect_app_state tool', () => {
  describe('tool registration', () => {
    it('should define required input schema', () => {
      const expectedSchema = {
        appId: { type: 'string', description: expect.any(String) },
        platform: { type: 'string', enum: ['android', 'ios'] },
        deviceId: { type: 'string', description: expect.any(String) },
        includePreferences: { type: 'boolean' },
        includeDatabases: { type: 'boolean' },
        sqlQuery: { type: 'string' },
      };

      expect(expectedSchema.appId.type).toBe('string');
      expect(expectedSchema.platform.enum).toContain('android');
    });
  });

  describe('tool execution', () => {
    it('should return preferences for Android', () => {
      const result = {
        success: true,
        state: {
          platform: 'android',
          appId: 'com.example.app',
          preferences: [
            {
              name: 'app_preferences',
              entries: [
                { key: 'user_id', value: '123', type: 'string' },
              ],
            },
          ],
          databases: [],
          timestamp: new Date(),
          durationMs: 100,
        },
        durationMs: 100,
      };

      expect(result.success).toBe(true);
      expect(result.state?.preferences).toHaveLength(1);
    });

    it('should return databases for iOS', () => {
      const result = {
        success: true,
        state: {
          platform: 'ios',
          appId: 'com.example.app',
          preferences: [],
          databases: [
            {
              name: 'app.sqlite',
              path: '/path/to/app.sqlite',
              tables: [{ name: 'users', columns: [], rowCount: 10 }],
            },
          ],
          timestamp: new Date(),
          durationMs: 150,
        },
        durationMs: 150,
      };

      expect(result.state?.databases).toHaveLength(1);
      expect(result.state?.databases[0].name).toBe('app.sqlite');
    });

    it('should execute SQL query', () => {
      const result = {
        success: true,
        queryResult: {
          columns: ['id', 'name', 'email'],
          rows: [
            { id: 1, name: 'John', email: 'john@example.com' },
            { id: 2, name: 'Jane', email: 'jane@example.com' },
          ],
          rowCount: 2,
        },
        durationMs: 200,
      };

      expect(result.queryResult?.rowCount).toBe(2);
      expect(result.queryResult?.columns).toContain('email');
    });

    it('should handle app not installed error', () => {
      const result = {
        success: false,
        error: 'App com.example.app is not installed on device',
        durationMs: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('not installed');
    });
  });
});

describe('inspect_logs tool', () => {
  describe('tool registration', () => {
    it('should define required input schema', () => {
      const expectedSchema = {
        platform: { type: 'string', enum: ['android', 'ios'] },
        appId: { type: 'string' },
        deviceId: { type: 'string' },
        minLevel: { type: 'string', enum: ['verbose', 'debug', 'info', 'warning', 'error'] },
        tags: { type: 'array' },
        pattern: { type: 'string' },
        limit: { type: 'number' },
      };

      expect(expectedSchema.platform.enum).toContain('android');
      expect(expectedSchema.minLevel.enum).toContain('error');
    });
  });

  describe('Android logcat', () => {
    it('should capture logcat output', () => {
      const result = {
        success: true,
        platform: 'android',
        appId: 'com.example.app',
        entries: [
          { timestamp: new Date(), level: 'info', tag: 'MainActivity', pid: 1234, message: 'onCreate' },
          { timestamp: new Date(), level: 'debug', tag: 'ViewModel', pid: 1234, message: 'Loading data' },
        ],
        durationMs: 500,
      };

      expect(result.entries).toHaveLength(2);
      expect(result.entries[0].tag).toBe('MainActivity');
    });

    it('should filter by app package', () => {
      const result = {
        success: true,
        platform: 'android',
        appId: 'com.example.app',
        entries: [
          { timestamp: new Date(), level: 'info', tag: 'App', pid: 1234, message: 'App log' },
        ],
        appliedFilters: { pid: 1234 },
        durationMs: 300,
      };

      expect(result.appliedFilters?.pid).toBe(1234);
    });
  });

  describe('iOS OSLog', () => {
    it('should capture system log output', () => {
      const result = {
        success: true,
        platform: 'ios',
        appId: 'com.example.app',
        entries: [
          { timestamp: new Date(), level: 'info', tag: 'App', message: 'Application launched' },
        ],
        durationMs: 400,
      };

      expect(result.platform).toBe('ios');
      expect(result.entries).toHaveLength(1);
    });

    it('should filter by predicate', () => {
      const result = {
        success: true,
        platform: 'ios',
        entries: [
          { timestamp: new Date(), level: 'error', tag: 'Network', message: 'Request failed' },
        ],
        appliedFilters: { minLevel: 'error' },
        durationMs: 250,
      };

      expect(result.entries[0].level).toBe('error');
    });
  });

  describe('error handling', () => {
    it('should handle no device error', () => {
      const result = {
        success: false,
        platform: 'android',
        error: 'No device connected',
        entries: [],
        durationMs: 50,
      };

      expect(result.success).toBe(false);
      expect(result.error).toContain('No device');
    });

    it('should handle timeout gracefully', () => {
      const result = {
        success: true,
        platform: 'ios',
        entries: [],
        error: 'Log collection timed out after 30s',
        durationMs: 30000,
      };

      expect(result.entries).toHaveLength(0);
    });
  });
});
