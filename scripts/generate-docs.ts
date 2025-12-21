#!/usr/bin/env npx tsx
/**
 * API Documentation Generator
 * Generates markdown documentation from tool schemas
 */

import * as fs from 'fs';
import * as path from 'path';

// Import all tool registration functions
import { registerBuildAppTool } from '../src/tools/build/build-app.js';
import { registerInstallAppTool } from '../src/tools/build/install-app.js';
import { registerLaunchAppTool } from '../src/tools/build/launch-app.js';
import { registerGetUIContextTool } from '../src/tools/ui/get-ui-context.js';
import { registerInteractWithUITool } from '../src/tools/ui/interact-with-ui.js';
import { registerRunUnitTestsTool } from '../src/tools/testing/run-unit-tests.js';
import { registerRunMaestroFlowTool } from '../src/tools/testing/run-maestro-flow.js';
import { registerRunLinterTool } from '../src/tools/testing/run-linter.js';
import { registerListDevicesTool } from '../src/tools/environment/list-devices.js';
import { registerManageEnvTool } from '../src/tools/environment/manage-env.js';
import { registerCleanProjectTool } from '../src/tools/environment/clean-project.js';
import { registerAnalyzeCrashTool } from '../src/tools/crash/analyze-crash.js';
import { registerDeepLinkNavigateTool } from '../src/tools/navigation/deep-link-navigate.js';
import { registerInspectAppStateTool } from '../src/tools/observability/inspect-app-state.js';
import { registerInspectLogsTool } from '../src/tools/observability/inspect-logs.js';
import { getToolRegistry } from '../src/tools/register.js';

interface PropertySchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

interface ToolSchema {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, PropertySchema>;
    required?: string[];
  };
}

/**
 * Categorize tools by their domain
 */
const TOOL_CATEGORIES: Record<string, string[]> = {
  'Build & Deployment': ['build_app', 'install_app', 'launch_app'],
  'UI Inspection & Interaction': ['get_ui_context', 'interact_with_ui'],
  'Testing & QA': ['run_unit_tests', 'run_maestro_flow', 'run_linter'],
  'Environment Management': ['list_devices', 'manage_env', 'clean_project'],
  'Crash Analysis': ['analyze_crash'],
  'Navigation': ['deep_link_navigate'],
  'Observability': ['inspect_app_state', 'inspect_logs'],
};

/**
 * Generate markdown for a single tool
 */
function generateToolDoc(tool: ToolSchema): string {
  const lines: string[] = [];

  lines.push(`### \`${tool.name}\``);
  lines.push('');
  lines.push(tool.description);
  lines.push('');

  // Parameters table
  const properties = tool.inputSchema.properties;
  const required = tool.inputSchema.required || [];

  if (Object.keys(properties).length > 0) {
    lines.push('#### Parameters');
    lines.push('');
    lines.push('| Parameter | Type | Required | Description |');
    lines.push('|-----------|------|----------|-------------|');

    for (const [name, prop] of Object.entries(properties)) {
      const isRequired = required.includes(name) ? '✅' : '❌';
      let typeStr = prop.type;
      if (prop.enum) {
        typeStr = `enum: ${prop.enum.map((v) => `\`${v}\``).join(', ')}`;
      }
      const desc = prop.description || '-';
      lines.push(`| \`${name}\` | ${typeStr} | ${isRequired} | ${desc} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate the full API documentation
 */
function generateDocs(): string {
  // Register all tools
  const registry = getToolRegistry();
  registry.clear();

  registerBuildAppTool();
  registerInstallAppTool();
  registerLaunchAppTool();
  registerGetUIContextTool();
  registerInteractWithUITool();
  registerRunUnitTestsTool();
  registerRunMaestroFlowTool();
  registerRunLinterTool();
  registerListDevicesTool();
  registerManageEnvTool();
  registerCleanProjectTool();
  registerAnalyzeCrashTool();
  registerDeepLinkNavigateTool();
  registerInspectAppStateTool();
  registerInspectLogsTool();

  const tools = registry.listTools() as ToolSchema[];
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const lines: string[] = [];

  // Header
  lines.push('# Specter MCP API Reference');
  lines.push('');
  lines.push('Specter MCP provides 15 tools for AI agents to interact with Kotlin Multiplatform Mobile (KMM) projects.');
  lines.push('');
  lines.push('## Table of Contents');
  lines.push('');

  // TOC
  for (const category of Object.keys(TOOL_CATEGORIES)) {
    const anchor = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    lines.push(`- [${category}](#${anchor})`);
  }
  lines.push('');

  // Quick Reference
  lines.push('## Quick Reference');
  lines.push('');
  lines.push('| Tool | Category | Description |');
  lines.push('|------|----------|-------------|');

  for (const [category, toolNames] of Object.entries(TOOL_CATEGORIES)) {
    for (const name of toolNames) {
      const tool = toolMap.get(name);
      if (tool) {
        const shortDesc = tool.description.split('.')[0];
        lines.push(`| \`${name}\` | ${category} | ${shortDesc} |`);
      }
    }
  }
  lines.push('');

  // Detailed documentation by category
  for (const [category, toolNames] of Object.entries(TOOL_CATEGORIES)) {
    lines.push(`## ${category}`);
    lines.push('');

    for (const name of toolNames) {
      const tool = toolMap.get(name);
      if (tool) {
        lines.push(generateToolDoc(tool));
      }
    }
  }

  // Usage Examples
  lines.push('## Usage Examples');
  lines.push('');
  lines.push('### Building an Android App');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    tool: 'build_app',
    arguments: {
      platform: 'android',
      variant: 'debug',
      clean: false,
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('### Capturing UI Context');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    tool: 'get_ui_context',
    arguments: {
      platform: 'ios',
      skipScreenshot: false,
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('### Running E2E Tests with Maestro');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    tool: 'run_maestro_flow',
    arguments: {
      platform: 'android',
      flowPath: './maestro/login-flow.yaml',
      appId: 'com.example.app',
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('### Analyzing a Crash Log');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify({
    tool: 'analyze_crash',
    arguments: {
      crashLogPath: '/path/to/crash.ips',
      dsymPath: '/path/to/app.dSYM',
      skipSymbolication: false,
    },
  }, null, 2));
  lines.push('```');
  lines.push('');

  // Error Handling
  lines.push('## Error Handling');
  lines.push('');
  lines.push('All tools return structured results with error information when failures occur:');
  lines.push('');
  lines.push('- **Invalid Arguments**: Thrown when required parameters are missing or invalid');
  lines.push('- **Platform Unavailable**: Thrown when required tools (gradle, xcodebuild) are not found');
  lines.push('- **Device Not Found**: Returned with list of available devices');
  lines.push('- **Timeout**: Thrown when operation exceeds configured timeout');
  lines.push('');

  // Footer
  lines.push('---');
  lines.push('');
  lines.push(`*Generated on ${new Date().toISOString().split('T')[0]}*`);
  lines.push('');

  return lines.join('\n');
}

// Main
const docs = generateDocs();
const docsDir = path.join(process.cwd(), 'docs');
const outputPath = path.join(docsDir, 'API.md');

// Create docs directory if it doesn't exist
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

fs.writeFileSync(outputPath, docs);
console.log(`✅ API documentation generated at ${outputPath}`);
console.log(`   Total tools documented: 15`);
