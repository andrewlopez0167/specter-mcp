/**
 * iOS Symbolication via atos
 * Wrapper for the atos command-line tool to symbolicate crash addresses
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { executeShell } from '../../utils/shell.js';
import { CrashReport, StackFrame } from '../../models/crash-report.js';
import { findAppBinary } from './crash-parser.js';

/**
 * Symbolication result for a single address
 */
export interface SymbolicationResult {
  address: string;
  symbol: string;
  file?: string;
  line?: number;
  success: boolean;
}

/**
 * Options for symbolication
 */
export interface SymbolicationOptions {
  /** Path to dSYM file or directory containing dSYMs */
  dsymPath: string;
  /** Architecture (default: arm64) */
  arch?: string;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * Symbolicate a crash report using atos
 */
export async function symbolicateCrashReport(
  report: CrashReport,
  options: SymbolicationOptions
): Promise<CrashReport> {
  const { dsymPath, arch = 'arm64', timeoutMs = 30000 } = options;

  // Find the app binary info
  const appBinary = findAppBinary(report);
  if (!appBinary) {
    console.error('[symbolicate] Could not find app binary in crash report');
    return report;
  }

  // Find the dSYM file
  const dsymFile = findDSYMFile(dsymPath, appBinary.name);
  if (!dsymFile) {
    console.error(`[symbolicate] dSYM not found for ${appBinary.name} in ${dsymPath}`);
    return report;
  }

  // Collect addresses to symbolicate from app code frames
  const addressesToSymbolicate: Array<{ address: string; frame: StackFrame }> = [];

  for (const thread of report.threads) {
    for (const frame of thread.frames) {
      if (frame.isAppCode && needsSymbolication(frame)) {
        addressesToSymbolicate.push({ address: frame.address, frame });
      }
    }
  }

  if (addressesToSymbolicate.length === 0) {
    console.error('[symbolicate] No frames need symbolication');
    return { ...report, isSymbolicated: true };
  }

  // Run atos to symbolicate addresses
  const addresses = addressesToSymbolicate.map((a) => a.address);
  const results = await runAtos(dsymFile, appBinary.loadAddress, addresses, arch, timeoutMs);

  // Apply symbolication results to frames
  for (let i = 0; i < addressesToSymbolicate.length; i++) {
    const { frame } = addressesToSymbolicate[i];
    const result = results[i];

    if (result && result.success) {
      frame.symbol = result.symbol;
      if (result.file) frame.file = result.file;
      if (result.line) frame.line = result.line;
    }
  }

  return {
    ...report,
    isSymbolicated: results.some((r) => r.success),
  };
}

/**
 * Run atos command to symbolicate addresses
 */
export async function runAtos(
  dsymPath: string,
  loadAddress: string,
  addresses: string[],
  arch: string = 'arm64',
  timeoutMs: number = 30000
): Promise<SymbolicationResult[]> {
  if (addresses.length === 0) {
    return [];
  }

  // Find DWARF file inside dSYM
  const dwarfPath = findDWARFFile(dsymPath);
  if (!dwarfPath) {
    console.error(`[symbolicate] DWARF file not found in ${dsymPath}`);
    return addresses.map((addr) => ({
      address: addr,
      symbol: addr,
      success: false,
    }));
  }

  // Build atos command
  const args = [
    '-arch',
    arch,
    '-o',
    dwarfPath,
    '-l',
    loadAddress,
    ...addresses,
  ];

  try {
    const result = await executeShell('atos', args, { timeoutMs, silent: true });

    if (result.exitCode !== 0) {
      console.error(`[symbolicate] atos failed: ${result.stderr}`);
      return addresses.map((addr) => ({
        address: addr,
        symbol: addr,
        success: false,
      }));
    }

    // Parse atos output (one line per address)
    const lines = result.stdout.trim().split('\n');
    return addresses.map((addr, idx) => parseAtosLine(addr, lines[idx]));
  } catch (error) {
    console.error(`[symbolicate] atos error: ${error}`);
    return addresses.map((addr) => ({
      address: addr,
      symbol: addr,
      success: false,
    }));
  }
}

/**
 * Parse a single line of atos output
 */
function parseAtosLine(address: string, line: string | undefined): SymbolicationResult {
  if (!line) {
    return { address, symbol: address, success: false };
  }

  // atos output format: "symbolName (in BinaryName) (FileName:LineNumber)"
  // or just: "symbolName (in BinaryName) + offset"
  // or failed: just the address

  const trimmed = line.trim();

  // Check if symbolication failed (just returns the address)
  if (trimmed === address || trimmed.startsWith('0x')) {
    return { address, symbol: address, success: false };
  }

  // Try to parse with file/line info
  const fullMatch = trimmed.match(/^(.+?)\s+\(in\s+.+?\)\s+\((.+?):(\d+)\)$/);
  if (fullMatch) {
    return {
      address,
      symbol: fullMatch[1],
      file: fullMatch[2],
      line: parseInt(fullMatch[3], 10),
      success: true,
    };
  }

  // Try to parse without file info
  const simpleMatch = trimmed.match(/^(.+?)\s+\(in\s+.+?\)/);
  if (simpleMatch) {
    return {
      address,
      symbol: simpleMatch[1],
      success: true,
    };
  }

  // Return the line as the symbol
  return {
    address,
    symbol: trimmed,
    success: true,
  };
}

/**
 * Find dSYM file for a given binary name
 */
export function findDSYMFile(dsymPath: string, binaryName: string): string | undefined {
  if (!existsSync(dsymPath)) {
    return undefined;
  }

  // If the path is already a .dSYM directory
  if (dsymPath.endsWith('.dSYM') && existsSync(dsymPath)) {
    return dsymPath;
  }

  // Look for dSYM in the directory
  try {
    const entries = readdirSync(dsymPath, { withFileTypes: true });

    // Try exact match first
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === `${binaryName}.app.dSYM`) {
        return join(dsymPath, entry.name);
      }
    }

    // Try partial match
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.dSYM')) {
        if (entry.name.includes(binaryName)) {
          return join(dsymPath, entry.name);
        }
      }
    }

    // Try any .dSYM in the directory
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.endsWith('.dSYM')) {
        return join(dsymPath, entry.name);
      }
    }
  } catch {
    // Directory read failed
  }

  return undefined;
}

/**
 * Find DWARF file inside dSYM bundle
 */
export function findDWARFFile(dsymPath: string): string | undefined {
  const dwarfDir = join(dsymPath, 'Contents', 'Resources', 'DWARF');

  if (!existsSync(dwarfDir)) {
    return undefined;
  }

  try {
    const entries = readdirSync(dwarfDir);
    if (entries.length > 0) {
      return join(dwarfDir, entries[0]);
    }
  } catch {
    // Directory read failed
  }

  return undefined;
}

/**
 * Check if a frame needs symbolication
 */
function needsSymbolication(frame: StackFrame): boolean {
  // Already symbolicated if symbol looks like a function name
  if (!frame.symbol) return true;
  if (frame.symbol === '???') return true;
  if (frame.symbol.startsWith('0x')) return true;

  // Has source info = already symbolicated
  if (frame.file && frame.line) return false;

  return false;
}

/**
 * Verify dSYM matches crash report UUID
 */
export async function verifyDSYMMatch(
  dsymPath: string,
  expectedUUID: string
): Promise<boolean> {
  const dwarfPath = findDWARFFile(dsymPath);
  if (!dwarfPath) {
    return false;
  }

  try {
    // Use dwarfdump to get UUID
    const result = await executeShell('dwarfdump', ['--uuid', dwarfPath], {
      timeoutMs: 10000,
      silent: true,
    });

    if (result.exitCode !== 0) {
      return false;
    }

    // dwarfdump output: "UUID: A1B2C3D4-E5F6-7890-ABCD-EF1234567890 (arm64) /path/to/dwarf"
    const uuidMatch = result.stdout.match(/UUID:\s+([A-F0-9-]+)/i);
    if (uuidMatch) {
      const dsymUUID = uuidMatch[1].toUpperCase();
      const cleanExpected = expectedUUID.toUpperCase().replace(/-/g, '');
      const cleanDsym = dsymUUID.replace(/-/g, '');
      return cleanExpected === cleanDsym;
    }
  } catch {
    // dwarfdump failed
  }

  return false;
}

/**
 * Find dSYM in common locations
 */
export function findDSYMInCommonLocations(bundleId: string, _uuid?: string): string | undefined {
  const homeDir = process.env.HOME || '/Users';

  const commonLocations = [
    // Xcode DerivedData
    join(homeDir, 'Library', 'Developer', 'Xcode', 'DerivedData'),
    // Xcode Archives
    join(homeDir, 'Library', 'Developer', 'Xcode', 'Archives'),
    // Common download location
    join(homeDir, 'Downloads'),
    // Desktop
    join(homeDir, 'Desktop'),
  ];

  // Extract app name from bundle ID
  const appName = bundleId.split('.').pop() || bundleId;

  for (const location of commonLocations) {
    if (!existsSync(location)) continue;

    const dsym = findDSYMFile(location, appName);
    if (dsym) {
      return dsym;
    }
  }

  return undefined;
}
