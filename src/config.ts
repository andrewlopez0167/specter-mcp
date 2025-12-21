/**
 * Specter MCP Configuration
 * Environment-based configuration management
 */

/**
 * Configuration options for the MCP server
 */
export interface SpecterConfig {
  /** Server name */
  serverName: string;
  /** Server version */
  serverVersion: string;

  /** Enable debug logging */
  debug: boolean;
  /** Log level: 'error' | 'warn' | 'info' | 'debug' */
  logLevel: 'error' | 'warn' | 'info' | 'debug';

  /** Default timeout for shell commands (ms) */
  defaultTimeout: number;
  /** Maximum concurrent queue operations */
  maxConcurrency: number;

  /** Android SDK path */
  androidSdkPath?: string;
  /** Xcode path */
  xcodePath?: string;

  /** Default Android device ID */
  defaultAndroidDevice?: string;
  /** Default iOS simulator ID */
  defaultIOSDevice?: string;

  /** Maestro binary path */
  maestroPath?: string;
  /** Detekt config path */
  detektConfigPath?: string;

  /** Enable AI model routing */
  enableModelRouting: boolean;
  /** Primary AI model ID */
  primaryModel: string;
  /** Worker AI model ID for lightweight tasks */
  workerModel: string;
  /** Vision AI model ID for UI analysis */
  visionModel: string;

  /** Anthropic API key (for model routing) */
  anthropicApiKey?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: SpecterConfig = {
  serverName: 'specter-mcp',
  serverVersion: '1.0.0',

  debug: false,
  logLevel: 'info',

  defaultTimeout: 60000,
  maxConcurrency: 1,

  enableModelRouting: false,
  primaryModel: 'claude-3-5-sonnet-20241022',
  workerModel: 'claude-3-haiku-20240307',
  visionModel: 'claude-3-5-sonnet-20241022',
};

/**
 * Load configuration from environment variables
 */
function loadFromEnv(): Partial<SpecterConfig> {
  const env = process.env;

  return {
    debug: env.SPECTER_DEBUG === 'true' || env.DEBUG === 'true',
    logLevel: parseLogLevel(env.SPECTER_LOG_LEVEL || env.LOG_LEVEL),

    defaultTimeout: parseNumber(env.SPECTER_TIMEOUT, DEFAULT_CONFIG.defaultTimeout),
    maxConcurrency: parseNumber(env.SPECTER_CONCURRENCY, DEFAULT_CONFIG.maxConcurrency),

    androidSdkPath: env.ANDROID_SDK_ROOT || env.ANDROID_HOME,
    xcodePath: env.XCODE_PATH,

    defaultAndroidDevice: env.SPECTER_ANDROID_DEVICE,
    defaultIOSDevice: env.SPECTER_IOS_DEVICE,

    maestroPath: env.MAESTRO_PATH,
    detektConfigPath: env.DETEKT_CONFIG,

    enableModelRouting: env.SPECTER_MODEL_ROUTING === 'true',
    primaryModel: env.SPECTER_PRIMARY_MODEL || DEFAULT_CONFIG.primaryModel,
    workerModel: env.SPECTER_WORKER_MODEL || DEFAULT_CONFIG.workerModel,
    visionModel: env.SPECTER_VISION_MODEL || DEFAULT_CONFIG.visionModel,

    anthropicApiKey: env.ANTHROPIC_API_KEY,
  };
}

/**
 * Parse log level from string
 */
function parseLogLevel(value?: string): 'error' | 'warn' | 'info' | 'debug' {
  const level = value?.toLowerCase();
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
    return level;
  }
  return DEFAULT_CONFIG.logLevel;
}

/**
 * Parse number from string
 */
function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Singleton configuration instance
let configInstance: SpecterConfig | null = null;

/**
 * Get the global configuration instance
 */
export function getConfig(): SpecterConfig {
  if (!configInstance) {
    configInstance = {
      ...DEFAULT_CONFIG,
      ...loadFromEnv(),
    };
  }
  return configInstance;
}

/**
 * Override configuration (useful for testing)
 */
export function setConfig(config: Partial<SpecterConfig>): void {
  configInstance = {
    ...getConfig(),
    ...config,
  };
}

/**
 * Reset configuration to defaults (useful for testing)
 */
export function resetConfig(): void {
  configInstance = null;
}

/**
 * Check if running in debug mode
 */
export function isDebug(): boolean {
  return getConfig().debug;
}

/**
 * Get effective timeout for operations
 */
export function getTimeout(override?: number): number {
  return override ?? getConfig().defaultTimeout;
}

/**
 * Log message based on log level
 */
export function log(level: 'error' | 'warn' | 'info' | 'debug', message: string, ...args: unknown[]): void {
  const config = getConfig();
  const levels = { error: 0, warn: 1, info: 2, debug: 3 };

  if (levels[level] <= levels[config.logLevel]) {
    const prefix = `[specter-mcp:${level}]`;
    if (level === 'error') {
      console.error(prefix, message, ...args);
    } else if (level === 'warn') {
      console.warn(prefix, message, ...args);
    } else {
      console.error(prefix, message, ...args); // MCP uses stderr for logging
    }
  }
}

/**
 * Validate configuration and return warnings
 */
export function validateConfig(): string[] {
  const config = getConfig();
  const warnings: string[] = [];

  // Check for Android SDK
  if (!config.androidSdkPath) {
    warnings.push('ANDROID_SDK_ROOT not set - Android tools may not work');
  }

  // Check for model routing requirements
  if (config.enableModelRouting && !config.anthropicApiKey) {
    warnings.push('Model routing enabled but ANTHROPIC_API_KEY not set');
  }

  return warnings;
}

/**
 * Print configuration summary (for debugging)
 */
export function printConfigSummary(): void {
  const config = getConfig();
  log('info', 'Configuration:');
  log('info', `  Debug: ${config.debug}`);
  log('info', `  Log Level: ${config.logLevel}`);
  log('info', `  Timeout: ${config.defaultTimeout}ms`);
  log('info', `  Android SDK: ${config.androidSdkPath || 'not set'}`);
  log('info', `  Model Routing: ${config.enableModelRouting}`);
}
