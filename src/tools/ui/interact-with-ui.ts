/**
 * interact_with_ui Tool Handler
 * MCP tool for performing UI interactions (tap, swipe, input text)
 */

import { isPlatform, InteractionType, INTERACTION_TYPES, SwipeDirection } from '../../models/constants.js';
import { InteractionResult, Point, UIElement } from '../../models/ui-context.js';
import { Errors } from '../../models/errors.js';
import { tap, inputText, swipe, listDevices as listAndroidDevices, dumpUiHierarchy } from '../../platforms/android/adb.js';
import { listDevices as listIOSDevices, getBootedDevice } from '../../platforms/ios/simctl.js';
import { executeShell } from '../../utils/shell.js';
import { parseAndroidHierarchy, findElementInHierarchy } from '../../utils/xml-parser.js';
import { getToolRegistry, createInputSchema } from '../register.js';

/**
 * Input arguments for interact_with_ui tool
 */
export interface InteractWithUIArgs {
  /** Target platform */
  platform: string;
  /** Interaction type */
  action: string;
  /** Target element ID or text (for element-based interactions) */
  element?: string;
  /** X coordinate (for coordinate-based interactions) */
  x?: number;
  /** Y coordinate (for coordinate-based interactions) */
  y?: number;
  /** Text to input (for input_text action) */
  text?: string;
  /** Swipe direction (for swipe action) */
  direction?: string;
  /** Duration in ms (for long_press and swipe) */
  durationMs?: number;
  /** Target device ID or name */
  device?: string;
}

/**
 * Interact with UI tool handler
 */
export async function interactWithUI(args: InteractWithUIArgs): Promise<InteractionResult> {
  const {
    platform,
    action,
    element,
    x,
    y,
    text,
    direction,
    durationMs = 300,
    device,
  } = args;

  // Validate platform
  if (!isPlatform(platform)) {
    throw Errors.invalidArguments(`Invalid platform: ${platform}. Must be 'android' or 'ios'`);
  }

  // Validate action
  if (!INTERACTION_TYPES.includes(action as InteractionType)) {
    throw Errors.invalidArguments(
      `Invalid action: ${action}. Must be one of: ${INTERACTION_TYPES.join(', ')}`
    );
  }

  const interactionType = action as InteractionType;
  const startTime = Date.now();

  // Determine target coordinates
  let targetCoords: Point;
  let targetElement: UIElement | undefined;

  if (element) {
    // Find element by ID or text
    const foundElement = await findTargetElement(platform, element, device);
    if (!foundElement) {
      throw Errors.elementNotFound(element);
    }
    targetElement = foundElement;
    targetCoords = foundElement.center;
  } else if (x !== undefined && y !== undefined) {
    targetCoords = { x, y };
  } else if (interactionType !== 'input_text' && interactionType !== 'clear') {
    throw Errors.invalidArguments('Either element or coordinates (x, y) must be provided');
  } else {
    // For input_text and clear, we operate on the focused element
    targetCoords = { x: 0, y: 0 };
  }

  // Perform interaction
  try {
    if (platform === 'android') {
      await performAndroidInteraction(interactionType, targetCoords, {
        text,
        direction: direction as SwipeDirection,
        durationMs,
        device,
      });
    } else {
      await performIOSInteraction(interactionType, targetCoords, {
        text,
        direction: direction as SwipeDirection,
        durationMs,
        device,
      });
    }

    return {
      success: true,
      interactionType: action,
      targetElement: targetElement
        ? {
            id: targetElement.id,
            type: targetElement.type,
            bounds: targetElement.bounds,
          }
        : undefined,
      coordinates: targetCoords,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      interactionType: action,
      coordinates: targetCoords,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Find target element on device
 */
async function findTargetElement(
  platform: string,
  elementQuery: string,
  device?: string
): Promise<UIElement | undefined> {
  if (platform === 'android') {
    // Get target device
    let deviceId: string | undefined;
    if (device) {
      const devices = await listAndroidDevices();
      const found = devices.find(
        (d) => d.id === device || d.name === device || d.model === device
      );
      deviceId = found?.id;
    }

    // Dump UI hierarchy and find element
    const hierarchyXml = await dumpUiHierarchy(deviceId);
    const elements = await parseAndroidHierarchy(hierarchyXml, { flatten: true });
    return findElementInHierarchy(elements, elementQuery);
  } else {
    // iOS element finding - simplified implementation
    // Full implementation would require XCTest integration
    console.warn('[interact_with_ui] iOS element finding requires XCTest integration');
    return undefined;
  }
}

/**
 * Perform Android UI interaction
 */
async function performAndroidInteraction(
  action: InteractionType,
  coords: Point,
  options: {
    text?: string;
    direction?: SwipeDirection;
    durationMs: number;
    device?: string;
  }
): Promise<void> {
  const { text, direction, durationMs, device } = options;

  // Get target device ID
  let deviceId: string | undefined;
  if (device) {
    const devices = await listAndroidDevices();
    const found = devices.find(
      (d) => d.id === device || d.name === device || d.model === device
    );
    deviceId = found?.id;
  }

  switch (action) {
    case 'tap':
      await tap(coords.x, coords.y, deviceId);
      break;

    case 'long_press':
      // Implement as swipe with same start and end
      await swipe(coords.x, coords.y, coords.x, coords.y, durationMs, deviceId);
      break;

    case 'swipe':
      if (!direction) {
        throw Errors.invalidArguments('direction is required for swipe action');
      }
      const swipeCoords = calculateSwipeCoordinates(coords, direction, 500);
      await swipe(
        swipeCoords.startX,
        swipeCoords.startY,
        swipeCoords.endX,
        swipeCoords.endY,
        durationMs,
        deviceId
      );
      break;

    case 'input_text':
      if (!text) {
        throw Errors.invalidArguments('text is required for input_text action');
      }
      await inputText(text, deviceId);
      break;

    case 'clear':
      // Select all and delete
      await executeShell('adb', [
        ...(deviceId ? ['-s', deviceId] : []),
        'shell',
        'input',
        'keyevent',
        'KEYCODE_CTRL_A',
      ]);
      await executeShell('adb', [
        ...(deviceId ? ['-s', deviceId] : []),
        'shell',
        'input',
        'keyevent',
        'KEYCODE_DEL',
      ]);
      break;
  }
}

/**
 * Perform iOS UI interaction
 * Note: iOS simulator doesn't support direct touch input via simctl.
 * For UI automation, use Maestro (run_maestro_flow) instead.
 */
async function performIOSInteraction(
  action: InteractionType,
  _coords: Point, // Coords unused - iOS simctl doesn't support coordinate-based touch
  options: {
    text?: string;
    direction?: SwipeDirection;
    durationMs: number;
    device?: string;
  }
): Promise<void> {
  const { text, device } = options;

  // Get target device UDID
  let udid: string;
  if (device) {
    const devices = await listIOSDevices();
    const found = devices.find((d) => d.id === device || d.name === device);
    if (!found) {
      throw Errors.deviceNotFound(device, devices.map((d) => `${d.id} (${d.name})`));
    }
    udid = found.id;
  } else {
    const booted = await getBootedDevice();
    if (!booted) {
      throw Errors.invalidArguments('No running iOS simulator found');
    }
    udid = booted.id;
  }

  // iOS simctl doesn't support direct touch interactions (tap, swipe, long_press)
  // For these, use Maestro via run_maestro_flow tool instead
  switch (action) {
    case 'tap':
    case 'long_press':
    case 'swipe':
      throw Errors.invalidArguments(
        `iOS simulator doesn't support direct ${action} via simctl. ` +
        `Use run_maestro_flow tool for iOS UI automation instead.`
      );

    case 'input_text':
      if (!text) {
        throw Errors.invalidArguments('text is required for input_text action');
      }
      // Use pbcopy + paste simulation via AppleScript
      // First copy text to clipboard
      await executeShell('bash', ['-c', `echo -n "${text.replace(/"/g, '\\"')}" | pbcopy`]);
      // Then paste via simctl (paste from host clipboard to simulator)
      await executeShell('xcrun', ['simctl', 'pbsync', udid, 'host']);
      // Trigger paste via keyboard shortcut using AppleScript
      await executeShell('osascript', [
        '-e',
        'tell application "Simulator" to activate',
        '-e',
        'tell application "System Events" to keystroke "v" using command down',
      ]);
      break;

    case 'clear':
      // Select all and delete via AppleScript
      await executeShell('osascript', [
        '-e',
        'tell application "Simulator" to activate',
        '-e',
        'tell application "System Events" to keystroke "a" using command down',
        '-e',
        'tell application "System Events" to key code 51', // Delete key
      ]);
      break;
  }
}

/**
 * Calculate swipe coordinates based on direction
 */
function calculateSwipeCoordinates(
  center: Point,
  direction: SwipeDirection,
  distance: number
): { startX: number; startY: number; endX: number; endY: number } {
  switch (direction) {
    case 'up':
      return {
        startX: center.x,
        startY: center.y + distance / 2,
        endX: center.x,
        endY: center.y - distance / 2,
      };
    case 'down':
      return {
        startX: center.x,
        startY: center.y - distance / 2,
        endX: center.x,
        endY: center.y + distance / 2,
      };
    case 'left':
      return {
        startX: center.x + distance / 2,
        startY: center.y,
        endX: center.x - distance / 2,
        endY: center.y,
      };
    case 'right':
      return {
        startX: center.x - distance / 2,
        startY: center.y,
        endX: center.x + distance / 2,
        endY: center.y,
      };
  }
}

/**
 * Register the interact_with_ui tool
 */
export function registerInteractWithUITool(): void {
  getToolRegistry().register(
    'interact_with_ui',
    {
      description:
        'Perform UI interactions like tap, swipe, or text input. Can target elements by ID/text or by coordinates.',
      inputSchema: createInputSchema(
        {
          platform: {
            type: 'string',
            enum: ['android', 'ios'],
            description: 'Target platform',
          },
          action: {
            type: 'string',
            enum: ['tap', 'long_press', 'swipe', 'input_text', 'clear'],
            description: 'Type of interaction to perform',
          },
          element: {
            type: 'string',
            description: 'Element ID, resource ID, or text to interact with',
          },
          x: {
            type: 'number',
            description: 'X coordinate for coordinate-based interaction',
          },
          y: {
            type: 'number',
            description: 'Y coordinate for coordinate-based interaction',
          },
          text: {
            type: 'string',
            description: 'Text to input (for input_text action)',
          },
          direction: {
            type: 'string',
            enum: ['up', 'down', 'left', 'right'],
            description: 'Swipe direction (for swipe action)',
          },
          durationMs: {
            type: 'number',
            description: 'Duration in milliseconds (for long_press and swipe, default: 300)',
          },
          device: {
            type: 'string',
            description: 'Device ID or name (optional)',
          },
        },
        ['platform', 'action']
      ),
    },
    (args) => interactWithUI(args as unknown as InteractWithUIArgs)
  );
}
