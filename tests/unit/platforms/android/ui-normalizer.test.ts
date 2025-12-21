import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../../../../src/platforms/android/adb.js', () => ({
  listDevices: vi.fn(),
  getDevice: vi.fn(),
  takeScreenshot: vi.fn(),
  dumpUiHierarchy: vi.fn(),
}));

vi.mock('../../../../src/utils/xml-parser.js', () => ({
  parseAndroidHierarchy: vi.fn(),
  extractInteractiveElements: vi.fn(),
}));

vi.mock('../../../../src/utils/image.js', () => ({
  compressScreenshot: vi.fn(),
  createEmptyScreenshot: vi.fn(),
}));

import { listDevices, getDevice, takeScreenshot, dumpUiHierarchy } from '../../../../src/platforms/android/adb.js';
import { parseAndroidHierarchy, extractInteractiveElements } from '../../../../src/utils/xml-parser.js';
import { compressScreenshot, createEmptyScreenshot } from '../../../../src/utils/image.js';
import {
  captureAndroidUIContext,
  mapAndroidElementType,
  createElementSummary,
} from '../../../../src/platforms/android/ui-normalizer.js';
import type { UIElement } from '../../../../src/models/ui-context.js';

const mockedListDevices = vi.mocked(listDevices);
const mockedGetDevice = vi.mocked(getDevice);
const mockedTakeScreenshot = vi.mocked(takeScreenshot);
const mockedDumpUiHierarchy = vi.mocked(dumpUiHierarchy);
const mockedParseAndroidHierarchy = vi.mocked(parseAndroidHierarchy);
const mockedExtractInteractiveElements = vi.mocked(extractInteractiveElements);
const mockedCompressScreenshot = vi.mocked(compressScreenshot);
const mockedCreateEmptyScreenshot = vi.mocked(createEmptyScreenshot);

describe('Android UI Normalizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockedCreateEmptyScreenshot.mockReturnValue({
      data: '',
      width: 0,
      height: 0,
      format: 'jpeg',
    });
  });

  describe('captureAndroidUIContext', () => {
    it('should capture UI context from default device', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png-data'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64-compressed',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');
      mockedParseAndroidHierarchy.mockResolvedValue([]);
      mockedExtractInteractiveElements.mockReturnValue([]);

      const context = await captureAndroidUIContext();

      expect(context.platform).toBe('android');
      expect(context.deviceId).toBe('emulator-5554');
      expect(context.timestamp).toBeDefined();
    });

    it('should use specified device ID', async () => {
      mockedGetDevice.mockResolvedValue({
        id: 'emulator-5556',
        name: 'Pixel_6',
        status: 'booted',
      });
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');
      mockedParseAndroidHierarchy.mockResolvedValue([]);
      mockedExtractInteractiveElements.mockReturnValue([]);

      const context = await captureAndroidUIContext({ device: 'emulator-5556' });

      expect(mockedGetDevice).toHaveBeenCalledWith('emulator-5556');
      expect(context.deviceId).toBe('emulator-5556');
    });

    it('should throw when specified device is not found', async () => {
      mockedGetDevice.mockResolvedValue(null);
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);

      await expect(captureAndroidUIContext({ device: 'nonexistent' }))
        .rejects.toThrow();
    });

    it('should throw when no booted device is available', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'shutdown' },
      ]);

      await expect(captureAndroidUIContext())
        .rejects.toThrow('No running Android device found');
    });

    it('should skip screenshot when requested', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');
      mockedParseAndroidHierarchy.mockResolvedValue([]);
      mockedExtractInteractiveElements.mockReturnValue([]);

      await captureAndroidUIContext({ skipScreenshot: true });

      expect(mockedTakeScreenshot).not.toHaveBeenCalled();
      expect(mockedCreateEmptyScreenshot).toHaveBeenCalled();
    });

    it('should continue without screenshot on capture failure', async () => {
      // Console output is silenced globally via tests/setup.ts
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockRejectedValue(new Error('Screenshot failed'));
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');
      mockedParseAndroidHierarchy.mockResolvedValue([]);
      mockedExtractInteractiveElements.mockReturnValue([]);

      const context = await captureAndroidUIContext();

      // Should not throw, should use empty screenshot
      expect(context.screenshot).toBeDefined();
    });

    it('should apply screenshot quality option', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');
      mockedParseAndroidHierarchy.mockResolvedValue([]);
      mockedExtractInteractiveElements.mockReturnValue([]);

      await captureAndroidUIContext({ screenshotQuality: 80 });

      expect(mockedCompressScreenshot).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ quality: 80 })
      );
    });

    it('should return all elements when includeAllElements is true', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');

      const allElements = [
        { id: '1', type: 'text', text: 'Label' },
        { id: '2', type: 'button', text: 'Click' },
        { id: '3', type: 'container' },
      ] as UIElement[];

      mockedParseAndroidHierarchy.mockResolvedValue(allElements);

      const context = await captureAndroidUIContext({ includeAllElements: true });

      expect(context.elements).toEqual(allElements);
      expect(mockedExtractInteractiveElements).not.toHaveBeenCalled();
    });

    it('should filter to interactive elements by default', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');

      const allElements = [{ id: '1' }, { id: '2' }] as UIElement[];
      const interactiveElements = [{ id: '2' }] as UIElement[];

      mockedParseAndroidHierarchy.mockResolvedValue(allElements);
      mockedExtractInteractiveElements.mockReturnValue(interactiveElements);

      const context = await captureAndroidUIContext();

      expect(mockedExtractInteractiveElements).toHaveBeenCalledWith(allElements);
      expect(context.elements).toEqual(interactiveElements);
    });

    it('should include total element count', async () => {
      mockedListDevices.mockResolvedValue([
        { id: 'emulator-5554', name: 'Pixel_7', status: 'booted' },
      ]);
      mockedTakeScreenshot.mockResolvedValue(Buffer.from('png'));
      mockedCompressScreenshot.mockResolvedValue({
        data: 'base64',
        width: 1080,
        height: 2340,
        format: 'jpeg',
      });
      mockedDumpUiHierarchy.mockResolvedValue('<hierarchy></hierarchy>');

      const allElements = Array.from({ length: 50 }, (_, i) => ({ id: String(i) })) as UIElement[];
      const interactiveElements = allElements.slice(0, 10);

      mockedParseAndroidHierarchy.mockResolvedValue(allElements);
      mockedExtractInteractiveElements.mockReturnValue(interactiveElements);

      const context = await captureAndroidUIContext();

      expect(context.totalElementCount).toBe(50);
      expect(context.elements.length).toBe(10);
    });
  });

  describe('mapAndroidElementType', () => {
    it('should map Button classes to button type', () => {
      expect(mapAndroidElementType('android.widget.Button')).toBe('button');
      expect(mapAndroidElementType('com.google.android.material.button.MaterialButton')).toBe('button');
      expect(mapAndroidElementType('androidx.appcompat.widget.AppCompatButton')).toBe('button');
    });

    it('should map FAB to button type', () => {
      expect(mapAndroidElementType('com.google.android.material.floatingactionbutton.FloatingActionButton')).toBe('button');
    });

    it('should map EditText classes to input type', () => {
      expect(mapAndroidElementType('android.widget.EditText')).toBe('input');
      expect(mapAndroidElementType('com.google.android.material.textfield.TextInputEditText')).toBe('input');
      expect(mapAndroidElementType('androidx.appcompat.widget.AppCompatAutoCompleteTextView')).toBe('input');
    });

    it('should map TextView to text type', () => {
      expect(mapAndroidElementType('android.widget.TextView')).toBe('text');
    });

    it('should map ImageView classes to image type', () => {
      expect(mapAndroidElementType('android.widget.ImageView')).toBe('image');
      expect(mapAndroidElementType('androidx.appcompat.widget.AppCompatImageView')).toBe('image');
    });

    it('should map RecyclerView/ListView to list type', () => {
      expect(mapAndroidElementType('androidx.recyclerview.widget.RecyclerView')).toBe('list');
      expect(mapAndroidElementType('android.widget.ListView')).toBe('list');
      expect(mapAndroidElementType('android.widget.GridView')).toBe('list');
    });

    it('should map ScrollView to scroll type', () => {
      expect(mapAndroidElementType('android.widget.ScrollView')).toBe('scroll');
      expect(mapAndroidElementType('androidx.core.widget.NestedScrollView')).toBe('scroll');
    });

    it('should map Switch to switch type', () => {
      expect(mapAndroidElementType('android.widget.Switch')).toBe('switch');
      expect(mapAndroidElementType('androidx.appcompat.widget.SwitchCompat')).toBe('switch');
    });

    it('should map ToggleButton to button type (button check takes precedence)', () => {
      // ToggleButton contains 'button' so it matches button check first
      expect(mapAndroidElementType('android.widget.ToggleButton')).toBe('button');
    });

    it('should map CheckBox to checkbox type', () => {
      expect(mapAndroidElementType('android.widget.CheckBox')).toBe('checkbox');
      expect(mapAndroidElementType('androidx.appcompat.widget.AppCompatCheckBox')).toBe('checkbox');
    });

    it('should map Layout classes to container type', () => {
      expect(mapAndroidElementType('android.widget.FrameLayout')).toBe('container');
      expect(mapAndroidElementType('android.widget.LinearLayout')).toBe('container');
      expect(mapAndroidElementType('android.widget.RelativeLayout')).toBe('container');
      expect(mapAndroidElementType('androidx.constraintlayout.widget.ConstraintLayout')).toBe('container');
      expect(mapAndroidElementType('android.view.ViewGroup')).toBe('container');
    });

    it('should return other for unknown classes', () => {
      expect(mapAndroidElementType('com.custom.UnknownWidget')).toBe('other');
      expect(mapAndroidElementType('android.view.View')).toBe('other');
    });
  });

  describe('createElementSummary', () => {
    it('should create summary with element type counts', () => {
      const elements: UIElement[] = [
        { id: '1', type: 'button', text: 'Submit', clickable: true, bounds: { x: 0, y: 0, width: 100, height: 50 } },
        { id: '2', type: 'button', text: 'Cancel', clickable: true, bounds: { x: 0, y: 0, width: 100, height: 50 } },
        { id: '3', type: 'input', text: '', clickable: false, bounds: { x: 0, y: 0, width: 200, height: 50 } },
        { id: '4', type: 'text', text: 'Label', clickable: false, bounds: { x: 0, y: 0, width: 100, height: 30 } },
      ];

      const summary = createElementSummary(elements);

      expect(summary).toContain('button: 2');
      expect(summary).toContain('input: 1');
      expect(summary).toContain('text: 1');
    });

    it('should list interactive elements with identifiers', () => {
      const elements: UIElement[] = [
        { id: '1', type: 'button', text: 'Submit', resourceId: 'btn_submit', clickable: true, bounds: { x: 0, y: 0, width: 100, height: 50 } },
        { id: '2', type: 'button', contentDescription: 'Menu button', clickable: true, bounds: { x: 0, y: 0, width: 50, height: 50 } },
        { id: '3', type: 'input', resourceId: 'input_email', clickable: false, bounds: { x: 0, y: 0, width: 200, height: 50 } },
      ];

      const summary = createElementSummary(elements);

      expect(summary).toContain('Interactive:');
      expect(summary).toContain('btn_submit');
      expect(summary).toContain('Menu button');
      expect(summary).toContain('input_email');
    });

    it('should truncate interactive elements list if too many', () => {
      const elements: UIElement[] = Array.from({ length: 20 }, (_, i) => ({
        id: String(i),
        type: 'button' as const,
        text: `Button ${i}`,
        clickable: true,
        bounds: { x: 0, y: 0, width: 100, height: 50 },
      }));

      const summary = createElementSummary(elements);

      expect(summary).toContain('...');
      // Should only include first 10
      expect(summary.match(/button:/g)?.length || 0).toBeLessThanOrEqual(11);
    });

    it('should handle empty elements array', () => {
      const summary = createElementSummary([]);

      expect(summary).toContain('Elements:');
      expect(summary).toContain('Interactive:');
    });

    it('should prioritize resourceId over text for identifier', () => {
      const elements: UIElement[] = [
        {
          id: '1',
          type: 'button',
          text: 'Click Me',
          resourceId: 'btn_action',
          clickable: true,
          bounds: { x: 0, y: 0, width: 100, height: 50 },
        },
      ];

      const summary = createElementSummary(elements);

      expect(summary).toContain('btn_action');
    });

    it('should use contentDescription when no resourceId or text', () => {
      const elements: UIElement[] = [
        {
          id: '1',
          type: 'button',
          contentDescription: 'Back navigation',
          clickable: true,
          bounds: { x: 0, y: 0, width: 50, height: 50 },
        },
      ];

      const summary = createElementSummary(elements);

      expect(summary).toContain('Back navigation');
    });

    it('should include inputs in interactive list', () => {
      const elements: UIElement[] = [
        {
          id: '1',
          type: 'input',
          resourceId: 'email_field',
          clickable: false,
          bounds: { x: 0, y: 0, width: 200, height: 50 },
        },
      ];

      const summary = createElementSummary(elements);

      expect(summary).toContain('input: email_field');
    });
  });
});
