/**
 * iOS UI Normalizer
 * Converts iOS UI hierarchy to unified UIElement format
 */

import {
  UIElement,
  UIContext,
  UIContextOptions,
  calculateCenter,
  generateElementId,
  Bounds,
} from '../../models/ui-context.js';
import { IOS_ELEMENT_MAP, ElementType } from '../../models/constants.js';
import { takeScreenshot, listDevices, getDevice, getBootedDevice } from './simctl.js';
import { compressScreenshot, createEmptyScreenshot } from '../../utils/image.js';
import { Errors } from '../../models/errors.js';
import { executeShell } from '../../utils/shell.js';

/**
 * iOS accessibility element from hierarchy
 */
interface IOSAccessibilityElement {
  type?: string;
  label?: string;
  identifier?: string;
  value?: string;
  frame?: { x: number; y: number; width: number; height: number };
  enabled?: boolean;
  selected?: boolean;
  focused?: boolean;
  children?: IOSAccessibilityElement[];
}

/**
 * Capture UI context from iOS simulator
 */
export async function captureIOSUIContext(
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
  let targetDeviceId: string;

  if (deviceId) {
    const foundDevice = await getDevice(deviceId);
    if (!foundDevice) {
      const devices = await listDevices();
      throw Errors.deviceNotFound(deviceId, devices.map((d) => `${d.id} (${d.name})`));
    }
    targetDeviceId = foundDevice.id;
  } else {
    const bootedDevice = await getBootedDevice();
    if (!bootedDevice) {
      throw Errors.invalidArguments('No running iOS simulator found');
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
      console.error('[ios-ui] Screenshot capture failed:', error);
    }
  }

  // For iOS, we use simctl's accessibility hierarchy if available
  // This is a simplified implementation - full implementation would use
  // XCTest or Appium for better element access
  const elements = await captureIOSElements(targetDeviceId, {
    includeAll: includeAllElements,
    maxDepth,
    elementTypes,
  });

  // Get screen size from screenshot or default
  const screenSize = {
    width: screenshotData.width || 390,
    height: screenshotData.height || 844,
  };

  return {
    platform: 'ios',
    deviceId: targetDeviceId,
    screenshot: screenshotData,
    elements,
    totalElementCount: elements.length,
    screenSize,
    timestamp: Date.now(),
  };
}

/**
 * Capture iOS accessibility elements
 * Note: This is a simplified implementation. Full accessibility tree
 * requires XCTest or Appium integration.
 */
async function captureIOSElements(
  udid: string,
  _options: {
    includeAll?: boolean;
    maxDepth?: number;
    elementTypes?: ElementType[];
  }
): Promise<UIElement[]> {
  // Attempt to get accessibility elements using simctl
  // This is limited compared to XCTest but works without additional tools
  try {
    // Use simctl io to capture accessibility info (experimental)
    await executeShell(
      'xcrun',
      ['simctl', 'spawn', udid, 'launchctl', 'print', 'user/com.apple.accessibility.AccessibilityUIServer'],
      { silent: true, timeoutMs: 5000 }
    );

    // If accessibility info is available, parse it
    // For now, return empty since this requires more complex integration
    console.warn('[ios-ui] Full accessibility tree requires XCTest integration');
    return [];
  } catch {
    // Accessibility capture failed - this is expected without XCTest
    return [];
  }
}

/**
 * Parse iOS accessibility element to unified format
 */
function parseIOSElement(
  element: IOSAccessibilityElement,
  depth: number,
  index: number
): UIElement | null {
  const frame = element.frame || { x: 0, y: 0, width: 0, height: 0 };
  const bounds: Bounds = {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };

  // Skip zero-sized elements
  if (bounds.width === 0 && bounds.height === 0) {
    return null;
  }

  const type = mapIOSElementType(element.type || '');
  const id = generateElementId(index, depth, element.identifier);

  return {
    id,
    type,
    text: element.label || undefined,
    contentDescription: element.label,
    resourceId: element.identifier,
    className: element.type || 'Unknown',
    bounds,
    center: calculateCenter(bounds),
    clickable: type === 'button' || type === 'input' || type === 'switch',
    enabled: element.enabled !== false,
    focused: element.focused === true,
    visible: true,
    scrollable: type === 'scroll' || type === 'list',
    isPassword: element.type === 'XCUIElementTypeSecureTextField',
    depth,
    index,
  };
}

/**
 * Flatten iOS element hierarchy
 * Exported for future XCTest integration
 */
export function flattenIOSHierarchy(
  elements: IOSAccessibilityElement[],
  depth = 0,
  maxDepth = 20
): UIElement[] {
  const result: UIElement[] = [];
  let index = 0;

  function processElement(el: IOSAccessibilityElement, d: number): void {
    if (d > maxDepth) return;

    const uiElement = parseIOSElement(el, d, index++);
    if (uiElement) {
      result.push(uiElement);
    }

    if (el.children) {
      for (const child of el.children) {
        processElement(child, d + 1);
      }
    }
  }

  for (const element of elements) {
    processElement(element, depth);
  }

  return result;
}

/**
 * Map iOS element type to unified type
 */
export function mapIOSElementType(iosType: string): ElementType {
  // Direct mapping
  if (iosType in IOS_ELEMENT_MAP) {
    return IOS_ELEMENT_MAP[iosType];
  }

  // Heuristic mapping
  const lowerType = iosType.toLowerCase();

  if (lowerType.includes('button')) return 'button';
  if (lowerType.includes('textfield') || lowerType.includes('textview')) return 'input';
  if (lowerType.includes('statictext') || lowerType.includes('label')) return 'text';
  if (lowerType.includes('image')) return 'image';
  if (lowerType.includes('table') || lowerType.includes('collection')) return 'list';
  if (lowerType.includes('scroll')) return 'scroll';
  if (lowerType.includes('switch') || lowerType.includes('toggle')) return 'switch';
  if (lowerType.includes('checkbox')) return 'checkbox';
  if (lowerType.includes('cell') || lowerType.includes('other')) return 'container';

  return 'other';
}

/**
 * Create element summary for AI consumption
 */
export function createIOSElementSummary(elements: UIElement[]): string {
  const byType: Record<string, number> = {};
  const interactive: string[] = [];

  for (const el of elements) {
    byType[el.type] = (byType[el.type] || 0) + 1;

    if (el.clickable || el.type === 'button' || el.type === 'input') {
      const identifier = el.resourceId || el.text || el.id;
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
