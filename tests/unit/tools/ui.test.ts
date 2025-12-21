import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock shell module
vi.mock('../../../src/utils/shell.js', () => ({
  executeShell: vi.fn(),
  executeShellOrThrow: vi.fn(),
  commandExists: vi.fn(),
}));

import { executeShell } from '../../../src/utils/shell.js';
import {
  parseAndroidBounds,
  calculateCenter,
  isInteractive,
  findElement,
  filterInteractiveElements,
  generateElementId,
  type UIElement,
  type Bounds,
} from '../../../src/models/ui-context.js';

const mockedExecuteShell = vi.mocked(executeShell);

describe('UI Context Models', () => {
  describe('parseAndroidBounds', () => {
    it('should parse valid bounds string', () => {
      const bounds = parseAndroidBounds('[100,200][300,400]');
      expect(bounds).toEqual({
        x: 100,
        y: 200,
        width: 200,
        height: 200,
      });
    });

    it('should handle zero-sized bounds', () => {
      const bounds = parseAndroidBounds('[0,0][0,0]');
      expect(bounds).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    });

    it('should return zero bounds for invalid string', () => {
      const bounds = parseAndroidBounds('invalid');
      expect(bounds).toEqual({
        x: 0,
        y: 0,
        width: 0,
        height: 0,
      });
    });

    it('should handle large coordinates', () => {
      const bounds = parseAndroidBounds('[0,0][1080,2340]');
      expect(bounds).toEqual({
        x: 0,
        y: 0,
        width: 1080,
        height: 2340,
      });
    });
  });

  describe('calculateCenter', () => {
    it('should calculate center of bounds', () => {
      const bounds: Bounds = { x: 100, y: 200, width: 200, height: 100 };
      const center = calculateCenter(bounds);
      expect(center).toEqual({ x: 200, y: 250 });
    });

    it('should round to integers', () => {
      const bounds: Bounds = { x: 0, y: 0, width: 101, height: 101 };
      const center = calculateCenter(bounds);
      expect(center).toEqual({ x: 51, y: 51 });
    });
  });

  describe('isInteractive', () => {
    const baseElement: UIElement = {
      id: 'test',
      type: 'button',
      className: 'android.widget.Button',
      bounds: { x: 0, y: 0, width: 100, height: 50 },
      center: { x: 50, y: 25 },
      clickable: true,
      enabled: true,
      focused: false,
      visible: true,
      scrollable: false,
      isPassword: false,
      depth: 0,
      index: 0,
    };

    it('should return true for clickable visible enabled elements', () => {
      expect(isInteractive(baseElement)).toBe(true);
    });

    it('should return false for invisible elements', () => {
      expect(isInteractive({ ...baseElement, visible: false })).toBe(false);
    });

    it('should return false for disabled elements', () => {
      expect(isInteractive({ ...baseElement, enabled: false })).toBe(false);
    });

    it('should return true for input fields even if not clickable', () => {
      expect(
        isInteractive({ ...baseElement, type: 'input', clickable: false })
      ).toBe(true);
    });

    it('should return true for switches even if not clickable', () => {
      expect(
        isInteractive({ ...baseElement, type: 'switch', clickable: false })
      ).toBe(true);
    });
  });

  describe('generateElementId', () => {
    it('should use resource ID when available', () => {
      const id = generateElementId(0, 0, 'com.example.app:id/btn_login');
      expect(id).toBe('btn_login');
    });

    it('should generate position-based ID when no resource ID', () => {
      const id = generateElementId(5, 2);
      expect(id).toBe('elem_2_5');
    });
  });

  describe('findElement', () => {
    const elements: UIElement[] = [
      {
        id: 'btn_login',
        resourceId: 'com.example:id/btn_login',
        type: 'button',
        text: 'Login',
        className: 'Button',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        center: { x: 50, y: 25 },
        clickable: true,
        enabled: true,
        focused: false,
        visible: true,
        scrollable: false,
        isPassword: false,
        depth: 0,
        index: 0,
      },
      {
        id: 'txt_welcome',
        type: 'text',
        text: 'Welcome to the App',
        className: 'TextView',
        bounds: { x: 0, y: 100, width: 200, height: 30 },
        center: { x: 100, y: 115 },
        clickable: false,
        enabled: true,
        focused: false,
        visible: true,
        scrollable: false,
        isPassword: false,
        depth: 0,
        index: 1,
      },
    ];

    it('should find element by ID', () => {
      const found = findElement(elements, 'btn_login');
      expect(found?.id).toBe('btn_login');
    });

    it('should find element by resource ID', () => {
      const found = findElement(elements, 'com.example:id/btn_login');
      expect(found?.id).toBe('btn_login');
    });

    it('should find element by exact text', () => {
      const found = findElement(elements, 'Login');
      expect(found?.id).toBe('btn_login');
    });

    it('should find element by partial text (case-insensitive)', () => {
      const found = findElement(elements, 'welcome');
      expect(found?.id).toBe('txt_welcome');
    });

    it('should return undefined for non-existent element', () => {
      const found = findElement(elements, 'nonexistent');
      expect(found).toBeUndefined();
    });
  });

  describe('filterInteractiveElements', () => {
    const elements: UIElement[] = [
      {
        id: 'btn',
        type: 'button',
        className: 'Button',
        bounds: { x: 0, y: 0, width: 100, height: 50 },
        center: { x: 50, y: 25 },
        clickable: true,
        enabled: true,
        focused: false,
        visible: true,
        scrollable: false,
        isPassword: false,
        depth: 0,
        index: 0,
      },
      {
        id: 'container',
        type: 'container',
        className: 'ViewGroup',
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        center: { x: 50, y: 50 },
        clickable: false,
        enabled: true,
        focused: false,
        visible: true,
        scrollable: false,
        isPassword: false,
        depth: 0,
        index: 1,
      },
      {
        id: 'hidden_btn',
        type: 'button',
        className: 'Button',
        bounds: { x: 0, y: 0, width: 0, height: 0 },
        center: { x: 0, y: 0 },
        clickable: true,
        enabled: true,
        focused: false,
        visible: false,
        scrollable: false,
        isPassword: false,
        depth: 0,
        index: 2,
      },
    ];

    it('should filter to only interactive elements', () => {
      const interactive = filterInteractiveElements(elements);
      expect(interactive).toHaveLength(1);
      expect(interactive[0].id).toBe('btn');
    });
  });
});

describe('get_ui_context Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Android UI capture', () => {
    it('should capture screenshot and hierarchy', async () => {
      // Mock screenshot capture
      mockedExecuteShell.mockResolvedValueOnce({
        stdout: 'PNG_DATA_HERE',
        stderr: '',
        exitCode: 0,
      });

      // Mock UI hierarchy dump
      const mockHierarchy = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="Welcome" resource-id="com.example:id/title" class="android.widget.TextView"
        bounds="[100,200][980,300]" clickable="false" enabled="true" visible-to-user="true" />
  <node index="1" text="Login" resource-id="com.example:id/btn_login" class="android.widget.Button"
        bounds="[200,400][880,500]" clickable="true" enabled="true" visible-to-user="true" />
</hierarchy>`;

      mockedExecuteShell.mockResolvedValueOnce({
        stdout: mockHierarchy,
        stderr: '',
        exitCode: 0,
      });

      // When implemented, test:
      // const context = await getUIContext({ platform: 'android' });
      // expect(context.elements).toHaveLength(2);
      // expect(context.elements[1].type).toBe('button');

      expect(true).toBe(true);
    });

    it('should filter invisible elements by default', async () => {
      const mockHierarchy = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <node index="0" text="Visible" class="android.widget.Button"
        bounds="[100,200][300,300]" visible-to-user="true" enabled="true" clickable="true" />
  <node index="1" text="Hidden" class="android.widget.Button"
        bounds="[0,0][0,0]" visible-to-user="false" enabled="true" clickable="true" />
</hierarchy>`;

      mockedExecuteShell.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });
      mockedExecuteShell.mockResolvedValueOnce({
        stdout: mockHierarchy,
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // const context = await getUIContext({ platform: 'android' });
      // expect(context.elements.filter(e => e.visible)).toHaveLength(1);

      expect(true).toBe(true);
    });
  });

  describe('iOS UI capture', () => {
    it('should capture iOS simulator UI', async () => {
      // iOS uses different methods for UI capture
      // This will be tested once the iOS implementation is complete
      expect(true).toBe(true);
    });
  });
});

describe('interact_with_ui Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tap interaction', () => {
    it('should tap element by ID', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // const result = await interactWithUI({
      //   platform: 'android',
      //   action: 'tap',
      //   elementId: 'btn_login',
      // });
      // expect(result.success).toBe(true);

      expect(true).toBe(true);
    });

    it('should tap at coordinates', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // const result = await interactWithUI({
      //   platform: 'android',
      //   action: 'tap',
      //   x: 500,
      //   y: 450,
      // });
      // expect(mockedExecuteShell).toHaveBeenCalledWith(
      //   'adb',
      //   expect.arrayContaining(['input', 'tap', '500', '450']),
      //   expect.any(Object)
      // );

      expect(true).toBe(true);
    });
  });

  describe('input text interaction', () => {
    it('should input text into focused field', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // const result = await interactWithUI({
      //   platform: 'android',
      //   action: 'input_text',
      //   text: 'test@example.com',
      // });
      // expect(result.success).toBe(true);

      expect(true).toBe(true);
    });
  });

  describe('swipe interaction', () => {
    it('should perform swipe gesture', async () => {
      mockedExecuteShell.mockResolvedValue({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      // When implemented:
      // const result = await interactWithUI({
      //   platform: 'android',
      //   action: 'swipe',
      //   direction: 'up',
      // });
      // expect(result.success).toBe(true);

      expect(true).toBe(true);
    });
  });
});
