#!/usr/bin/env node
/**
 * Specter MCP Server Entry Point
 * KMM Diagnostic & Execution Engine for AI agents
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getToolRegistry, registerAllTools } from './tools/register.js';
import { getGlobalQueue } from './queue/executor.js';
import { SpecterToolError } from './models/errors.js';
import { getConfig, log, validateConfig, isDebug } from './config.js';

// Load configuration
const config = getConfig();
const SERVER_NAME = config.serverName;
const SERVER_VERSION = config.serverVersion;

// Track active operations for graceful shutdown
let isShuttingDown = false;
let activeOperations = 0;

/**
 * Create and configure the MCP server
 */
function createServer(): Server {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register all tools
  registerAllTools();
  const registry = getToolRegistry();

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: registry.listTools(),
    };
  });

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // Reject new requests during shutdown
    if (isShuttingDown) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: 'SERVER_SHUTTING_DOWN',
                message: 'Server is shutting down, no new requests accepted',
              },
            }),
          },
        ],
        isError: true,
      };
    }

    const tool = registry.getTool(name);
    if (!tool) {
      log('warn', `Unknown tool requested: ${name}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: {
                code: 'UNKNOWN_TOOL',
                message: `Unknown tool: ${name}`,
                availableTools: registry.listTools().map((t) => t.name),
              },
            }),
          },
        ],
        isError: true,
      };
    }

    activeOperations++;
    const startTime = Date.now();

    try {
      log('debug', `Executing tool: ${name}`);

      // Execute through the global queue for sequential processing
      const result = await getGlobalQueue().enqueue(
        () => tool.handler(args ?? {}),
        name
      );

      const duration = Date.now() - startTime;
      log('debug', `Tool ${name} completed in ${duration}ms`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      log('error', `Tool ${name} failed after ${duration}ms:`, error);

      const errorResponse =
        error instanceof SpecterToolError
          ? error.toJSON()
          : {
              code: 'UNKNOWN_ERROR',
              message: error instanceof Error ? error.message : String(error),
            };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: errorResponse }),
          },
        ],
        isError: true,
      };
    } finally {
      activeOperations--;
    }
  });

  return server;
}

/**
 * Wait for active operations to complete
 */
async function waitForActiveOperations(timeoutMs: number = 30000): Promise<void> {
  const startTime = Date.now();
  const checkInterval = 100;

  while (activeOperations > 0 && Date.now() - startTime < timeoutMs) {
    log('info', `Waiting for ${activeOperations} active operation(s) to complete...`);
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  if (activeOperations > 0) {
    log('warn', `Shutdown timeout: ${activeOperations} operation(s) still running`);
  }
}

/**
 * Graceful shutdown handler
 */
async function gracefulShutdown(server: Server, signal: string): Promise<void> {
  if (isShuttingDown) {
    log('warn', 'Shutdown already in progress, forcing exit');
    process.exit(1);
  }

  isShuttingDown = true;
  log('info', `Received ${signal}, initiating graceful shutdown...`);

  try {
    // Wait for active operations to complete
    await waitForActiveOperations(config.defaultTimeout);

    // Close the server
    await server.close();
    log('info', 'Server closed successfully');

    process.exit(0);
  } catch (error) {
    log('error', 'Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  // Validate configuration and log warnings
  const warnings = validateConfig();
  for (const warning of warnings) {
    log('warn', warning);
  }

  if (isDebug()) {
    log('debug', 'Debug mode enabled');
  }

  const server = createServer();
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  process.on('SIGINT', () => gracefulShutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown(server, 'SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception:', error);
    gracefulShutdown(server, 'uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled rejection:', reason);
  });

  // Start the server
  await server.connect(transport);

  const registry = getToolRegistry();
  log('info', `Server started (v${SERVER_VERSION}) with ${registry.count} tools`);
}

// Run if this is the main module
main().catch((error) => {
  console.error('[specter-mcp] Fatal error:', error);
  process.exit(1);
});

export { createServer, SERVER_NAME, SERVER_VERSION };
