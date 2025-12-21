/**
 * build_app Tool Handler
 * MCP tool for building Android and iOS apps
 */

import { BuildVariant, isPlatform, isBuildVariant, DEFAULTS } from '../../models/constants.js';
import { BuildResult } from '../../models/build-result.js';
import { Errors } from '../../models/errors.js';
import { buildGradle, GradleBuildOptions } from '../../platforms/android/gradle.js';
import { buildXcode, XcodeBuildOptions, isXcodebuildAvailable } from '../../platforms/ios/xcodebuild.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for build_app tool
 */
export interface BuildAppArgs {
  /** Target platform */
  platform: string;
  /** Build variant */
  variant?: string;
  /** Clean before build */
  clean?: boolean;
  /** iOS simulator destination */
  iosDestination?: string;
  /** Android module name */
  androidModule?: string;
  /** iOS scheme name */
  iosScheme?: string;
  /** Build timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Build app tool handler
 */
export async function buildApp(args: BuildAppArgs): Promise<BuildResult> {
  const {
    platform,
    variant = 'debug',
    clean = false,
    iosDestination = 'platform=iOS Simulator,name=iPhone 15 Pro',
    androidModule = 'androidApp',
    iosScheme = 'iosApp',
    timeoutMs = DEFAULTS.BUILD_TIMEOUT_MS,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate variant
  if (!isBuildVariant(variant)) {
    throw Errors.invalidArguments(`Invalid variant: ${variant}. Must be 'debug' or 'release'`);
  }

  // Build based on platform
  if (platform === 'android') {
    return buildAndroid({
      variant,
      clean,
      moduleName: androidModule,
      timeoutMs,
    });
  } else {
    return buildIOS({
      variant,
      clean,
      destination: iosDestination,
      scheme: iosScheme,
      timeoutMs,
    });
  }
}

/**
 * Build Android app
 */
async function buildAndroid(options: {
  variant: BuildVariant;
  clean: boolean;
  moduleName: string;
  timeoutMs: number;
}): Promise<BuildResult> {
  const gradleOptions: GradleBuildOptions = {
    variant: options.variant,
    clean: options.clean,
    moduleName: options.moduleName,
    timeoutMs: options.timeoutMs,
  };

  return buildGradle(gradleOptions);
}

/**
 * Build iOS app
 */
async function buildIOS(options: {
  variant: BuildVariant;
  clean: boolean;
  destination: string;
  scheme: string;
  timeoutMs: number;
}): Promise<BuildResult> {
  // Check if xcodebuild is available
  const available = await isXcodebuildAvailable();
  if (!available) {
    throw Errors.platformUnavailable('ios');
  }

  const xcodeOptions: XcodeBuildOptions = {
    variant: options.variant,
    clean: options.clean,
    destination: options.destination,
    scheme: options.scheme,
    timeoutMs: options.timeoutMs,
  };

  return buildXcode(xcodeOptions);
}

/**
 * Register the build_app tool
 */
export function registerBuildAppTool(): void {
  getToolRegistry().register(
    'build_app',
    {
      description: 'Build a KMM application for Android or iOS. Returns structured build result with error details on failure.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform to build for',
          },
          variant: {
            type: 'string',
            enum: ['debug', 'release'],
            description: 'Build variant (default: debug)',
          },
          clean: {
            type: 'boolean',
            description: 'Clean before building (default: false)',
          },
          iosDestination: {
            type: 'string',
            description: 'iOS simulator destination (e.g., "platform=iOS Simulator,name=iPhone 15 Pro")',
          },
          androidModule: {
            type: 'string',
            description: 'Android module name (default: androidApp)',
          },
          iosScheme: {
            type: 'string',
            description: 'iOS scheme name (default: iosApp)',
          },
          timeoutMs: {
            type: 'number',
            description: 'Build timeout in milliseconds (default: 30 minutes)',
          },
        },
        ['platform']
      ),
    },
    (args) => buildApp(args as unknown as BuildAppArgs)
  );
}
