/**
 * Android UI Normalizer
 * Converts Android UI hierarchy to unified UIElement format
 */

import {
  UIElement,
  UIContext,
  UIContextOptions,
} from '../../models/ui-context.js';
import { ANDROID_ELEMENT_MAP, ElementType } from '../../models/constants.js';
import { dumpUiHierarchy, takeScreenshot, listDevices, getDevice } from './adb.js';
import { parseAndroidHierarchy, extractInteractiveElements } from '../../utils/xml-parser.js';
import { compressScreenshot, createEmptyScreenshot } from '../../utils/image.js';
import { Errors } from '../../models/errors.js';

/**
 * Capture UI context from Android device
 */
export async function captureAndroidUIContext(
  options: UIContextOptions = {}
): Promise<UIContext> {
  const {
    deviceId,
    includeAllElements = false,
    maxDepth = 20,
    screenshotQuality = 50,
    skipScreenshot = false,
    elementTypes,
  } = options;

  // Find target device
  let targetDeviceId: string | undefined;

  if (deviceId) {
    const foundDevice = await getDevice(deviceId);
    if (!foundDevice) {
      const devices = await listDevices();
      throw Errors.deviceNotFound(deviceId, devices.map((d) => `${d.id} (${d.name})`));
    }
    targetDeviceId = foundDevice.id;
  } else {
    const devices = await listDevices();
    const bootedDevice = devices.find((d) => d.status === 'booted');
    if (!bootedDevice) {
      throw Errors.invalidArguments('No running Android device found');
    }
    targetDeviceId = bootedDevice.id;
  }

  // Capture screenshot
  let screenshotData = createEmptyScreenshot();
  if (!skipScreenshot) {
    try {
      const screenshotBuffer = await takeScreenshot(targetDeviceId);
      screenshotData = await compressScreenshot(screenshotBuffer, {
        quality: screenshotQuality,
        format: 'jpeg',
      });
    } catch (error) {
      console.error('[android-ui] Screenshot capture failed:', error);
      // Continue without screenshot
    }
  }

  // Dump UI hierarchy
  const hierarchyXml = await dumpUiHierarchy(targetDeviceId);

  // Parse hierarchy
  const allElements = await parseAndroidHierarchy(hierarchyXml, {
    includeInvisible: includeAllElements,
    flatten: true,
    maxDepth,
    elementTypes,
  });

  // Filter to interactive elements unless includeAllElements is true
  const elements = includeAllElements
    ? allElements
    : extractInteractiveElements(allElements);

  // Get screen size from screenshot or default
  const screenSize = {
    width: screenshotData.width || 1080,
    height: screenshotData.height || 2340,
  };

  return {
    platform: 'android',
    deviceId: targetDeviceId,
    screenshot: screenshotData,
    elements,
    totalElementCount: allElements.length,
    screenSize,
    timestamp: Date.now(),
  };
}

/**
 * Map Android class to unified element type
 */
export function mapAndroidElementType(className: string): ElementType {
  // Direct mapping
  if (className in ANDROID_ELEMENT_MAP) {
    return ANDROID_ELEMENT_MAP[className];
  }

  // Heuristic mapping
  const lowerClass = className.toLowerCase();

  if (lowerClass.includes('button') || lowerClass.includes('fab')) {
    return 'button';
  }
  if (
    lowerClass.includes('edittext') ||
    lowerClass.includes('textinput') ||
    lowerClass.includes('autocomplete')
  ) {
    return 'input';
  }
  if (lowerClass.includes('textview') && !lowerClass.includes('edit')) {
    return 'text';
  }
  if (lowerClass.includes('imageview') || lowerClass.includes('icon')) {
    return 'image';
  }
  if (
    lowerClass.includes('recyclerview') ||
    lowerClass.includes('listview') ||
    lowerClass.includes('gridview')
  ) {
    return 'list';
  }
  if (lowerClass.includes('scrollview') || lowerClass.includes('nestedscroll')) {
    return 'scroll';
  }
  if (lowerClass.includes('switch') || lowerClass.includes('toggle')) {
    return 'switch';
  }
  if (lowerClass.includes('checkbox') || lowerClass.includes('checkable')) {
    return 'checkbox';
  }
  if (
    lowerClass.includes('layout') ||
    lowerClass.includes('viewgroup') ||
    lowerClass.includes('frame') ||
    lowerClass.includes('constraint') ||
    lowerClass.includes('relative') ||
    lowerClass.includes('linear')
  ) {
    return 'container';
  }

  return 'other';
}

/**
 * Create a simplified element summary for AI consumption
 */
export function createElementSummary(elements: UIElement[]): string {
  const byType: Record<string, number> = {};
  const interactive: string[] = [];

  for (const el of elements) {
    byType[el.type] = (byType[el.type] || 0) + 1;

    // List interactive elements with their identifiers
    if (el.clickable || el.type === 'button' || el.type === 'input') {
      const identifier = el.resourceId || el.text || el.contentDescription || el.id;
      if (identifier) {
        interactive.push(`${el.type}: ${identifier}`);
      }
    }
  }

  const typesSummary = Object.entries(byType)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');

  return `Elements: ${typesSummary}\nInteractive: ${interactive.slice(0, 10).join(', ')}${interactive.length > 10 ? '...' : ''}`;
}
