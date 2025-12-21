/**
 * UI Context Types
 * Unified UI representation for both Android and iOS platforms
 */

import { Platform, ElementType } from './constants.js';

/**
 * Bounding box for UI elements
 */
export interface Bounds {
  /** Left edge X coordinate */
  x: number;
  /** Top edge Y coordinate */
  y: number;
  /** Element width */
  width: number;
  /** Element height */
  height: number;
}

/**
 * Center point of an element (for tap operations)
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Unified UI element representation
 */
export interface UIElement {
  /** Unique identifier for this element */
  id: string;
  /** Element type (button, text, input, etc.) */
  type: ElementType;
  /** Display text content */
  text?: string;
  /** Content description / accessibility label */
  contentDescription?: string;
  /** Resource ID (Android) or accessibility identifier (iOS) */
  resourceId?: string;
  /** Original platform-specific class name */
  className: string;
  /** Bounding box */
  bounds: Bounds;
  /** Center point for interactions */
  center: Point;
  /** Whether the element is clickable/tappable */
  clickable: boolean;
  /** Whether the element is enabled */
  enabled: boolean;
  /** Whether the element is focused */
  focused: boolean;
  /** Whether the element is visible to user */
  visible: boolean;
  /** Whether the element is scrollable */
  scrollable: boolean;
  /** Whether the element is a password field */
  isPassword: boolean;
  /** Child elements */
  children?: UIElement[];
  /** Depth in the hierarchy (0 = root) */
  depth: number;
  /** Index among siblings */
  index: number;
}

/**
 * Screenshot data with metadata
 */
export interface ScreenshotData {
  /** Base64-encoded image data */
  data: string;
  /** Image format */
  format: 'png' | 'jpeg';
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Whether the image was compressed */
  compressed: boolean;
  /** Compression quality (if compressed) */
  quality?: number;
}

/**
 * Complete UI context for a screen
 */
export interface UIContext {
  /** Target platform */
  platform: Platform;
  /** Device identifier */
  deviceId: string;
  /** Screenshot of the current screen */
  screenshot: ScreenshotData;
  /** Flattened list of interactive elements */
  elements: UIElement[];
  /** Total element count (including non-interactive) */
  totalElementCount: number;
  /** Screen dimensions */
  screenSize: {
    width: number;
    height: number;
  };
  /** Capture timestamp */
  timestamp: number;
  /** Package name (Android) or bundle ID (iOS) of foreground app */
  foregroundApp?: string;
}

/**
 * Options for UI context capture
 */
export interface UIContextOptions {
  /** Target device ID or name */
  deviceId?: string;
  /** Include non-interactive elements */
  includeAllElements?: boolean;
  /** Maximum depth to traverse in hierarchy */
  maxDepth?: number;
  /** Screenshot quality (1-100, lower = more compression) */
  screenshotQuality?: number;
  /** Skip screenshot capture */
  skipScreenshot?: boolean;
  /** Filter to specific element types */
  elementTypes?: ElementType[];
}

/**
 * Result of a UI interaction
 */
export interface InteractionResult {
  /** Whether the interaction succeeded */
  success: boolean;
  /** Type of interaction performed */
  interactionType: string;
  /** Target element (if applicable) */
  targetElement?: {
    id: string;
    type: ElementType;
    bounds: Bounds;
  };
  /** Coordinates where interaction occurred */
  coordinates: Point;
  /** Duration of interaction in ms */
  durationMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Calculate center point from bounds
 */
export function calculateCenter(bounds: Bounds): Point {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
}

/**
 * Parse Android bounds string "[x1,y1][x2,y2]" to Bounds object
 */
export function parseAndroidBounds(boundsStr: string): Bounds {
  const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
  if (!match) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const [, x1, y1, x2, y2] = match.map(Number);
  return {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
  };
}

/**
 * Check if an element should be considered interactive
 */
export function isInteractive(element: UIElement): boolean {
  return (
    element.visible &&
    element.enabled &&
    (element.clickable ||
      element.type === 'button' ||
      element.type === 'input' ||
      element.type === 'switch' ||
      element.type === 'checkbox')
  );
}

/**
 * Generate a unique element ID based on hierarchy position
 */
export function generateElementId(
  index: number,
  depth: number,
  resourceId?: string
): string {
  if (resourceId) {
    // Use resource ID if available (more stable)
    return resourceId.replace(/.*:id\//, '');
  }
  return `elem_${depth}_${index}`;
}

/**
 * Filter elements to only interactive ones
 */
export function filterInteractiveElements(elements: UIElement[]): UIElement[] {
  return elements.filter(isInteractive);
}

/**
 * Find element by ID or text
 */
export function findElement(
  elements: UIElement[],
  query: string
): UIElement | undefined {
  // Try exact ID match first
  const byId = elements.find(
    (e) => e.id === query || e.resourceId === query
  );
  if (byId) return byId;

  // Try text match
  const byText = elements.find(
    (e) => e.text === query || e.contentDescription === query
  );
  if (byText) return byText;

  // Try partial text match (case-insensitive)
  const queryLower = query.toLowerCase();
  return elements.find(
    (e) =>
      e.text?.toLowerCase().includes(queryLower) ||
      e.contentDescription?.toLowerCase().includes(queryLower) ||
      e.resourceId?.toLowerCase().includes(queryLower)
  );
}
