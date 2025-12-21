/**
 * get_ui_context Tool Handler
 * MCP tool for capturing UI state with screenshots and interactive elements
 */

import { isPlatform, ElementType, ELEMENT_TYPES } from '../../models/constants.js';
import { UIContext, UIContextOptions } from '../../models/ui-context.js';
import { Errors } from '../../models/errors.js';
import { captureAndroidUIContext } from '../../platforms/android/ui-normalizer.js';
import { captureIOSUIContext } from '../../platforms/ios/ui-normalizer.js';
import { isSimctlAvailable } from '../../platforms/ios/simctl.js';
import { isAdbAvailable } from '../../platforms/android/adb.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for get_ui_context tool
 */
export interface GetUIContextArgs {
  /** Target platform */
  platform: string;
  /** Target device ID or name */
  deviceId?: string;
  /** Include all elements (not just interactive) */
  includeAllElements?: boolean;
  /** Maximum depth to traverse in hierarchy */
  maxDepth?: number;
  /** Screenshot quality (1-100) */
  screenshotQuality?: number;
  /** Skip screenshot capture */
  skipScreenshot?: boolean;
  /** Filter to specific element types */
  elementTypes?: string[];
}

/**
 * Get UI context tool handler
 */
export async function getUIContext(args: GetUIContextArgs): Promise<UIContext> {
  const {
    platform,
    deviceId,
    includeAllElements = false,
    maxDepth = 20,
    screenshotQuality = 50,
    skipScreenshot = false,
    elementTypes,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate element types if provided
  let validElementTypes: ElementType[] | undefined;
  if (elementTypes && elementTypes.length > 0) {
    validElementTypes = [];
    for (const type of elementTypes) {
      if (ELEMENT_TYPES.includes(type as ElementType)) {
        validElementTypes.push(type as ElementType);
      }
    }
  }

  const options: UIContextOptions = {
    deviceId,
    includeAllElements,
    maxDepth,
    screenshotQuality,
    skipScreenshot,
    elementTypes: validElementTypes,
  };

  if (platform === 'android') {
    return captureAndroidContext(options);
  } else {
    return captureIOSContext(options);
  }
}

/**
 * Capture Android UI context
 */
async function captureAndroidContext(options: UIContextOptions): Promise<UIContext> {
  // Check if ADB is available
  const adbAvailable = await isAdbAvailable();
  if (!adbAvailable) {
    throw Errors.platformUnavailable('android');
  }

  return captureAndroidUIContext(options);
}

/**
 * Capture iOS UI context
 */
async function captureIOSContext(options: UIContextOptions): Promise<UIContext> {
  // Check if simctl is available
  const simctlAvailable = await isSimctlAvailable();
  if (!simctlAvailable) {
    throw Errors.platformUnavailable('ios');
  }

  return captureIOSUIContext(options);
}

/**
 * Register the get_ui_context tool
 */
export function registerGetUIContextTool(): void {
  getToolRegistry().register(
    'get_ui_context',
    {
      description:
        'Capture the current UI state including screenshot and interactive elements. Returns a compressed screenshot and a list of UI elements with their properties.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          deviceId: {
            type: 'string',
            description: 'Device ID or name (optional, uses first running device if not specified)',
          },
          includeAllElements: {
            type: 'boolean',
            description: 'Include all elements, not just interactive ones (default: false)',
          },
          maxDepth: {
            type: 'number',
            description: 'Maximum depth to traverse in UI hierarchy (default: 20)',
          },
          screenshotQuality: {
            type: 'number',
            description: 'Screenshot JPEG quality 1-100 (default: 50)',
          },
          skipScreenshot: {
            type: 'boolean',
            description: 'Skip screenshot capture for faster response (default: false)',
          },
          elementTypes: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['button', 'text', 'input', 'image', 'list', 'scroll', 'container', 'switch', 'checkbox', 'other'],
            },
            description: 'Filter to specific element types',
          },
        },
        ['platform']
      ),
    },
    (args) => getUIContext(args as unknown as GetUIContextArgs)
  );
}
