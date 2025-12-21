/**
 * Image Utilities
 * Screenshot compression and processing using sharp
 */

import sharp from 'sharp';
import { ScreenshotData } from '../models/ui-context.js';
import { DEFAULTS } from '../models/constants.js';

/**
 * Options for screenshot compression
 */
export interface CompressionOptions {
  /** JPEG quality (1-100, default: 50) */
  quality?: number;
  /** Maximum dimension (width or height) */
  maxDimension?: number;
  /** Output format */
  format?: 'jpeg' | 'png';
}

/**
 * Compress a screenshot buffer
 */
export async function compressScreenshot(
  input: Buffer,
  options: CompressionOptions = {}
): Promise<ScreenshotData> {
  const {
    quality = DEFAULTS.SCREENSHOT_QUALITY,
    maxDimension,
    format = 'jpeg',
  } = options;

  let processor = sharp(input);

  // Get original metadata
  const metadata = await processor.metadata();
  const originalWidth = metadata.width || 0;
  const originalHeight = metadata.height || 0;

  // Resize if maxDimension is specified
  if (maxDimension && (originalWidth > maxDimension || originalHeight > maxDimension)) {
    const aspectRatio = originalWidth / originalHeight;

    let newWidth: number;
    let newHeight: number;

    if (originalWidth > originalHeight) {
      newWidth = maxDimension;
      newHeight = Math.round(maxDimension / aspectRatio);
    } else {
      newHeight = maxDimension;
      newWidth = Math.round(maxDimension * aspectRatio);
    }

    processor = processor.resize(newWidth, newHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Apply format-specific compression
  let outputBuffer: Buffer;
  if (format === 'jpeg') {
    outputBuffer = await processor
      .jpeg({
        quality,
        mozjpeg: true,
      })
      .toBuffer();
  } else {
    outputBuffer = await processor
      .png({
        compressionLevel: Math.round((100 - quality) / 10),
      })
      .toBuffer();
  }

  // Get output metadata
  const outputMetadata = await sharp(outputBuffer).metadata();

  return {
    data: outputBuffer.toString('base64'),
    format,
    width: outputMetadata.width || originalWidth,
    height: outputMetadata.height || originalHeight,
    sizeBytes: outputBuffer.length,
    compressed: true,
    quality,
  };
}

/**
 * Resize a screenshot to maximum dimension while maintaining aspect ratio
 */
export async function resizeScreenshot(
  input: Buffer,
  maxDimension: number
): Promise<Buffer> {
  const metadata = await sharp(input).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  if (width <= maxDimension && height <= maxDimension) {
    return input;
  }

  return sharp(input)
    .resize(maxDimension, maxDimension, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toBuffer();
}

/**
 * Get image metadata
 */
export async function getImageMetadata(
  input: Buffer
): Promise<{ width: number; height: number; format: string }> {
  const metadata = await sharp(input).metadata();
  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
  };
}

/**
 * Convert image to base64 without compression
 */
export function bufferToBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Detect image format from buffer
 */
export function detectImageFormat(buffer: Buffer): 'png' | 'jpeg' | 'unknown' {
  if (buffer.length < 4) return 'unknown';

  // PNG magic bytes: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  return 'unknown';
}

/**
 * Create a placeholder ScreenshotData when screenshot capture is skipped
 */
export function createEmptyScreenshot(): ScreenshotData {
  return {
    data: '',
    format: 'png',
    width: 0,
    height: 0,
    sizeBytes: 0,
    compressed: false,
  };
}

/**
 * Calculate compression ratio
 */
export function calculateCompressionRatio(
  originalSize: number,
  compressedSize: number
): number {
  if (originalSize === 0) return 0;
  return Math.round((1 - compressedSize / originalSize) * 100);
}
