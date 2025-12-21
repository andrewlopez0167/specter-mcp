/**
 * XML Hierarchy Parser
 * Parses Android UI hierarchy XML into unified element format
 */

import { parseStringPromise } from 'xml2js';
import {
  UIElement,
  parseAndroidBounds,
  calculateCenter,
  generateElementId,
} from '../models/ui-context.js';
import { ANDROID_ELEMENT_MAP, ElementType } from '../models/constants.js';

/**
 * Options for parsing UI hierarchy
 */
export interface ParseOptions {
  /** Include invisible elements */
  includeInvisible?: boolean;
  /** Flatten hierarchy (no nested children) */
  flatten?: boolean;
  /** Maximum depth to parse */
  maxDepth?: number;
  /** Filter to specific element types */
  elementTypes?: ElementType[];
}

/**
 * Raw node from xml2js parser
 */
interface RawNode {
  $: {
    index?: string;
    text?: string;
    'resource-id'?: string;
    class?: string;
    package?: string;
    'content-desc'?: string;
    checkable?: string;
    checked?: string;
    clickable?: string;
    enabled?: string;
    focusable?: string;
    focused?: string;
    scrollable?: string;
    'long-clickable'?: string;
    password?: string;
    selected?: string;
    'visible-to-user'?: string;
    bounds?: string;
  };
  node?: RawNode[];
}

/**
 * Parse Android UI hierarchy XML into UIElement array
 */
export async function parseAndroidHierarchy(
  xml: string,
  options: ParseOptions = {}
): Promise<UIElement[]> {
  const { includeInvisible = false, flatten = true, maxDepth = 20 } = options;

  try {
    const result = await parseStringPromise(xml, {
      explicitArray: true,
      mergeAttrs: false,
    }) as { hierarchy?: { node?: RawNode[] } };

    const elements: UIElement[] = [];
    let elementIndex = 0;

    function processNode(node: RawNode, depth: number, siblingIndex: number): UIElement | null {
      if (depth > maxDepth) return null;

      const attrs = node.$ || {};

      // Parse visibility
      const visible = attrs['visible-to-user'] === 'true';
      if (!visible && !includeInvisible) {
        return null;
      }

      // Parse bounds
      const bounds = parseAndroidBounds(attrs.bounds || '[0,0][0,0]');

      // Skip zero-sized invisible elements
      if (!visible && bounds.width === 0 && bounds.height === 0) {
        return null;
      }

      // Map class to element type
      const className = attrs.class || 'android.view.View';
      const type = mapAndroidClass(className);

      // Apply element type filter
      if (options.elementTypes && options.elementTypes.length > 0) {
        if (!options.elementTypes.includes(type)) {
          // Still process children
          if (node.node && flatten) {
            for (let i = 0; i < node.node.length; i++) {
              const childElement = processNode(node.node[i], depth + 1, i);
              if (childElement) {
                elements.push(childElement);
              }
            }
          }
          return null;
        }
      }

      const resourceId = attrs['resource-id'] || undefined;
      const id = generateElementId(elementIndex++, depth, resourceId);

      const element: UIElement = {
        id,
        type,
        text: attrs.text || undefined,
        contentDescription: attrs['content-desc'] || undefined,
        resourceId,
        className,
        bounds,
        center: calculateCenter(bounds),
        clickable: attrs.clickable === 'true',
        enabled: attrs.enabled === 'true',
        focused: attrs.focused === 'true',
        visible,
        scrollable: attrs.scrollable === 'true',
        isPassword: attrs.password === 'true',
        depth,
        index: siblingIndex,
      };

      // Process children
      if (node.node && node.node.length > 0) {
        if (flatten) {
          // Add children to flat list
          for (let i = 0; i < node.node.length; i++) {
            const childElement = processNode(node.node[i], depth + 1, i);
            if (childElement) {
              elements.push(childElement);
            }
          }
        } else {
          // Nest children in parent
          element.children = [];
          for (let i = 0; i < node.node.length; i++) {
            const childElement = processNode(node.node[i], depth + 1, i);
            if (childElement) {
              element.children.push(childElement);
            }
          }
        }
      }

      return element;
    }

    // Find the hierarchy root
    const hierarchy = result.hierarchy;
    if (!hierarchy || !hierarchy.node) {
      return [];
    }

    // Process all root nodes
    const rootNodes = hierarchy.node as RawNode[];
    for (let i = 0; i < rootNodes.length; i++) {
      const element = processNode(rootNodes[i], 0, i);
      if (element) {
        elements.push(element);
      }
    }

    return elements;
  } catch (error) {
    console.error('[xml-parser] Failed to parse Android hierarchy:', error);
    return [];
  }
}

/**
 * Map Android class name to unified element type
 */
export function mapAndroidClass(className: string): ElementType {
  // Check direct mapping first
  if (className in ANDROID_ELEMENT_MAP) {
    return ANDROID_ELEMENT_MAP[className];
  }

  // Check for partial matches (subclasses)
  const lowerClass = className.toLowerCase();

  if (lowerClass.includes('button')) return 'button';
  if (lowerClass.includes('edittext') || lowerClass.includes('textinput')) return 'input';
  if (lowerClass.includes('textview') || lowerClass.includes('text')) return 'text';
  if (lowerClass.includes('imageview') || lowerClass.includes('image')) return 'image';
  if (lowerClass.includes('recyclerview') || lowerClass.includes('listview')) return 'list';
  if (lowerClass.includes('scrollview')) return 'scroll';
  if (lowerClass.includes('switch') || lowerClass.includes('toggle')) return 'switch';
  if (lowerClass.includes('checkbox')) return 'checkbox';
  if (
    lowerClass.includes('layout') ||
    lowerClass.includes('viewgroup') ||
    lowerClass.includes('container')
  ) {
    return 'container';
  }

  return 'other';
}

/**
 * Extract interactive elements from hierarchy
 */
export function extractInteractiveElements(elements: UIElement[]): UIElement[] {
  return elements.filter((el) => {
    if (!el.visible || !el.enabled) return false;

    // Interactive element types
    if (
      el.type === 'button' ||
      el.type === 'input' ||
      el.type === 'switch' ||
      el.type === 'checkbox'
    ) {
      return true;
    }

    // Clickable elements
    if (el.clickable) return true;

    // Has meaningful content for interaction
    if (el.text && el.clickable) return true;

    return false;
  });
}

/**
 * Find element in hierarchy by ID or text
 */
export function findElementInHierarchy(
  elements: UIElement[],
  query: string
): UIElement | undefined {
  // Exact ID match
  const byId = elements.find((e) => e.id === query || e.resourceId === query);
  if (byId) return byId;

  // Exact text match
  const byText = elements.find((e) => e.text === query);
  if (byText) return byText;

  // Content description match
  const byContentDesc = elements.find((e) => e.contentDescription === query);
  if (byContentDesc) return byContentDesc;

  // Partial match (case insensitive)
  const lowerQuery = query.toLowerCase();
  return elements.find(
    (e) =>
      e.text?.toLowerCase().includes(lowerQuery) ||
      e.contentDescription?.toLowerCase().includes(lowerQuery) ||
      e.resourceId?.toLowerCase().includes(lowerQuery) ||
      e.id.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Get element count by type
 */
export function countElementsByType(
  elements: UIElement[]
): Record<ElementType, number> {
  const counts: Record<string, number> = {};

  for (const element of elements) {
    counts[element.type] = (counts[element.type] || 0) + 1;
  }

  return counts as Record<ElementType, number>;
}
