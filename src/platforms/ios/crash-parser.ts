/**
 * iOS Crash Log Parser
 * Parses .ips (JSON) and .crash (text) formats into CrashReport
 */

import { readFileSync, existsSync } from 'fs';
import {
  CrashReport,
  StackFrame,
  ThreadInfo,
  CrashException,
  BinaryImage,
} from '../../models/crash-report.js';

/**
 * IPS JSON format structure (iOS 15+)
 */
interface IPSReport {
  app_name?: string;
  app_version?: string;
  bundle_id?: string;
  timestamp?: string;
  incident_id?: string;
  os_version?: string;
  hardware_model?: string;
  exception?: {
    type?: string;
    codes?: string;
    signal?: string;
    subtype?: string;
  };
  faulting_thread?: number;
  threads?: IPSThread[];
  binary_images?: IPSBinaryImage[];
}

interface IPSThread {
  id: number;
  name?: string;
  crashed?: boolean;
  frames?: IPSFrame[];
}

interface IPSFrame {
  image_name?: string;
  image_addr?: string;
  symbol?: string;
  symbol_addr?: string;
  instruction_addr?: string;
}

interface IPSBinaryImage {
  name?: string;
  arch?: string;
  uuid?: string;
  base_addr?: string;
  end_addr?: string;
  path?: string;
}

/**
 * Parse a crash log file (auto-detects format)
 */
export function parseCrashLog(filePath: string): CrashReport {
  if (!existsSync(filePath)) {
    throw new Error(`Crash log file not found: ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf-8');

  // Detect format based on content
  if (content.trim().startsWith('{')) {
    return parseIPSFormat(content, filePath);
  } else {
    return parseClassicFormat(content, filePath);
  }
}

/**
 * Parse IPS JSON format (iOS 15+)
 */
export function parseIPSFormat(content: string, _filePath?: string): CrashReport {
  const ips: IPSReport = JSON.parse(content);

  // Parse threads
  const threads: ThreadInfo[] = (ips.threads || []).map((t, idx) =>
    parseIPSThread(t, idx, ips.app_name || '')
  );

  // Find crashed thread
  const faultingIdx = ips.faulting_thread ?? 0;
  const crashedThread =
    threads.find((t) => t.crashed) || threads[faultingIdx] || threads[0];
  if (crashedThread) {
    crashedThread.crashed = true;
  }

  // Parse binary images
  const binaryImages: BinaryImage[] = (ips.binary_images || []).map((img) => ({
    name: img.name || 'unknown',
    arch: img.arch || 'arm64',
    uuid: formatUUID(img.uuid || ''),
    loadAddress: img.base_addr || '0x0',
    endAddress: img.end_addr,
    path: img.path || '',
  }));

  // Parse exception
  const exception: CrashException = {
    type: ips.exception?.type || 'UNKNOWN',
    codes: ips.exception?.codes,
    signal: ips.exception?.signal,
    faultAddress: extractFaultAddress(ips.exception?.subtype),
  };

  return {
    reportId: ips.incident_id,
    timestamp: parseTimestamp(ips.timestamp),
    platform: 'ios',
    deviceModel: ips.hardware_model,
    osVersion: ips.os_version,
    processName: ips.app_name || 'Unknown',
    bundleId: ips.bundle_id,
    appVersion: ips.app_version,
    exception,
    threads,
    crashedThread: crashedThread || {
      index: 0,
      crashed: true,
      frames: [],
    },
    binaryImages,
    isSymbolicated: hasSymbols(threads),
    patterns: [],
  };
}

/**
 * Parse classic .crash text format
 */
export function parseClassicFormat(content: string, _filePath?: string): CrashReport {
  const lines = content.split('\n');

  // Parse header
  const header = parseClassicHeader(lines);

  // Parse exception
  const exception = parseClassicException(lines);

  // Parse threads
  const threads = parseClassicThreads(lines, header.processName);

  // Find crashed thread
  const crashedThread =
    threads.find((t) => t.crashed) || threads[0] || { index: 0, crashed: true, frames: [] };

  // Parse binary images
  const binaryImages = parseClassicBinaryImages(lines);

  return {
    reportId: header.incidentId,
    timestamp: header.timestamp,
    platform: 'ios',
    deviceModel: header.hardwareModel,
    osVersion: header.osVersion,
    processName: header.processName,
    bundleId: header.bundleId,
    appVersion: header.appVersion,
    exception,
    threads,
    crashedThread,
    binaryImages,
    isSymbolicated: hasSymbols(threads),
    patterns: [],
    rawLog: content,
  };
}

/**
 * Parse IPS thread
 */
function parseIPSThread(thread: IPSThread, fallbackIdx: number, appName: string): ThreadInfo {
  const frames: StackFrame[] = (thread.frames || []).map((f, idx) =>
    parseIPSFrame(f, idx, appName)
  );

  return {
    index: thread.id ?? fallbackIdx,
    name: thread.name,
    crashed: thread.crashed ?? false,
    frames,
  };
}

/**
 * Parse IPS frame
 */
function parseIPSFrame(frame: IPSFrame, index: number, appName: string): StackFrame {
  const binary = frame.image_name || 'unknown';

  return {
    index,
    binary,
    address: frame.instruction_addr || frame.symbol_addr || '0x0',
    symbol: frame.symbol || frame.instruction_addr || '???',
    isAppCode: binary === appName || binary.toLowerCase().includes(appName.toLowerCase()),
  };
}

/**
 * Parse classic crash header
 */
function parseClassicHeader(lines: string[]): {
  incidentId?: string;
  processName: string;
  bundleId?: string;
  appVersion?: string;
  hardwareModel?: string;
  osVersion?: string;
  timestamp: Date;
} {
  let incidentId: string | undefined;
  let processName = 'Unknown';
  let bundleId: string | undefined;
  let appVersion: string | undefined;
  let hardwareModel: string | undefined;
  let osVersion: string | undefined;
  let timestamp = new Date();

  for (const line of lines.slice(0, 30)) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Incident Identifier:')) {
      incidentId = trimmed.split(':')[1]?.trim();
    } else if (trimmed.startsWith('Hardware Model:')) {
      hardwareModel = trimmed.split(':')[1]?.trim();
    } else if (trimmed.startsWith('Process:')) {
      const match = trimmed.match(/Process:\s+(\S+)/);
      if (match) processName = match[1];
    } else if (trimmed.startsWith('Identifier:')) {
      bundleId = trimmed.split(':')[1]?.trim();
    } else if (trimmed.startsWith('Version:')) {
      appVersion = trimmed.split(':')[1]?.trim();
    } else if (trimmed.startsWith('OS Version:')) {
      osVersion = trimmed.split(':').slice(1).join(':').trim();
    } else if (trimmed.startsWith('Date/Time:')) {
      const dateStr = trimmed.split(':').slice(1).join(':').trim();
      const parsed = new Date(dateStr);
      if (!isNaN(parsed.getTime())) {
        timestamp = parsed;
      }
    }
  }

  return { incidentId, processName, bundleId, appVersion, hardwareModel, osVersion, timestamp };
}

/**
 * Parse classic crash exception
 */
function parseClassicException(lines: string[]): CrashException {
  let type = 'UNKNOWN';
  let codes: string | undefined;
  let signal: string | undefined;
  let faultAddress: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Exception Type:')) {
      const match = trimmed.match(/Exception Type:\s+(\S+)\s*\((\S+)\)?/);
      if (match) {
        type = match[1];
        signal = match[2];
      } else {
        type = trimmed.split(':')[1]?.trim().split(/\s/)[0] || 'UNKNOWN';
      }
    } else if (trimmed.startsWith('Exception Subtype:')) {
      codes = trimmed.split(':').slice(1).join(':').trim();
      // Extract fault address
      const addrMatch = codes.match(/at\s+(0x[0-9a-fA-F]+)/);
      if (addrMatch) {
        faultAddress = addrMatch[1];
      }
    } else if (trimmed.startsWith('Exception Codes:')) {
      if (!codes) {
        codes = trimmed.split(':').slice(1).join(':').trim();
      }
    }
  }

  return { type, codes, signal, faultAddress };
}

/**
 * Parse classic crash threads
 */
function parseClassicThreads(lines: string[], processName: string): ThreadInfo[] {
  const threads: ThreadInfo[] = [];
  let currentThread: ThreadInfo | null = null;
  let inThreadSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Thread header: "Thread 0 name:  main" or "Thread 0 Crashed:"
    const threadMatch = trimmed.match(/^Thread\s+(\d+)(?:\s+name:\s*(.+?))?(?:\s+Crashed)?:?\s*$/);
    const crashedMatch = trimmed.includes('Crashed');

    if (threadMatch) {
      // Save previous thread
      if (currentThread) {
        threads.push(currentThread);
      }

      currentThread = {
        index: parseInt(threadMatch[1], 10),
        name: threadMatch[2]?.trim(),
        crashed: crashedMatch,
        frames: [],
      };
      inThreadSection = true;
      continue;
    }

    // Frame line: "0   TestApp  0x0000000100001250 symbol + 28"
    if (inThreadSection && currentThread) {
      const frameMatch = trimmed.match(
        /^(\d+)\s+(\S+)\s+(0x[0-9a-fA-F]+)\s+(.+?)(?:\s+\+\s+(\d+))?$/
      );
      if (frameMatch) {
        const binary = frameMatch[2];
        currentThread.frames.push({
          index: parseInt(frameMatch[1], 10),
          binary,
          address: frameMatch[3],
          symbol: frameMatch[4],
          offset: frameMatch[5] ? parseInt(frameMatch[5], 10) : undefined,
          isAppCode: binary === processName,
        });
      } else if (trimmed === '' || trimmed.startsWith('Thread ') || trimmed.startsWith('Binary')) {
        // End of thread section
        inThreadSection = false;
      }
    }
  }

  // Save last thread
  if (currentThread) {
    threads.push(currentThread);
  }

  return threads;
}

/**
 * Parse classic binary images section
 */
function parseClassicBinaryImages(lines: string[]): BinaryImage[] {
  const images: BinaryImage[] = [];
  let inBinarySection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('Binary Images:')) {
      inBinarySection = true;
      continue;
    }

    if (!inBinarySection) continue;

    // Binary image line: "0x100000000 - 0x100100000 TestApp arm64  <uuid> /path/to/binary"
    const imageMatch = trimmed.match(
      /^(0x[0-9a-fA-F]+)\s+-\s+(0x[0-9a-fA-F]+)\s+(\S+)\s+(\S+)\s+<([^>]+)>\s+(.+)$/
    );
    if (imageMatch) {
      images.push({
        name: imageMatch[3],
        arch: imageMatch[4],
        uuid: formatUUID(imageMatch[5]),
        loadAddress: imageMatch[1],
        endAddress: imageMatch[2],
        path: imageMatch[6],
      });
    }
  }

  return images;
}

/**
 * Format UUID to standard format
 */
function formatUUID(uuid: string): string {
  // Remove any existing dashes and convert to uppercase
  const clean = uuid.replace(/-/g, '').toUpperCase();
  if (clean.length !== 32) return uuid;

  // Format as 8-4-4-4-12
  return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20)}`;
}

/**
 * Parse timestamp string
 */
function parseTimestamp(timestamp?: string): Date {
  if (!timestamp) return new Date();
  const parsed = new Date(timestamp);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Extract fault address from exception subtype
 */
function extractFaultAddress(subtype?: string): string | undefined {
  if (!subtype) return undefined;
  const match = subtype.match(/at\s+(0x[0-9a-fA-F]+)/i);
  return match ? match[1] : undefined;
}

/**
 * Check if threads have symbolicated symbols
 */
function hasSymbols(threads: ThreadInfo[]): boolean {
  for (const thread of threads) {
    for (const frame of thread.frames) {
      // If symbol looks like a real function name (not just an address)
      if (frame.symbol && !frame.symbol.startsWith('0x') && frame.symbol !== '???') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find app binary image from crash report
 */
export function findAppBinary(report: CrashReport): BinaryImage | undefined {
  // Try to find by bundle ID or process name
  return report.binaryImages.find(
    (img) =>
      img.name === report.processName ||
      img.path.includes(report.bundleId || '') ||
      img.path.includes('.app/')
  );
}

/**
 * Get frames that need symbolication
 */
export function getUnsymbolicatedFrames(report: CrashReport): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const thread of report.threads) {
    for (const frame of thread.frames) {
      if (frame.isAppCode && (frame.symbol.startsWith('0x') || frame.symbol === '???')) {
        frames.push(frame);
      }
    }
  }

  return frames;
}
