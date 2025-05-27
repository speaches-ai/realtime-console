import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  ListToolsResult,
  CallToolResult,
  CallToolRequest,
  ListToolsRequest,
} from "@modelcontextprotocol/sdk/types.js";
// import {
//   ListToolsResponse,
//   CallToolParams,
//   CallToolResponse,
// } from "@modelcontextprotocol/sdk/client/types.js";

type ToolsCache = {
  clientCount: number;
  mergedTools: ListToolsResult;
};

export class ClientManager {
  private clients: Client[] = [];
  private toolsCache: ToolsCache | null = null;

  async addClient(client: Client, transport: SSEClientTransport) {
    await client.connect(transport);
    this.clients.push(client);
    // Invalidate cache when adding new client
    this.toolsCache = null;
  }

  async listTools(
    params?: ListToolsRequest["params"],
  ): Promise<ListToolsResult> {
    if (this.toolsCache) {
      return this.toolsCache.mergedTools;
    }

    if (this.clients.length === 0) {
      return { tools: [] };
    }

    // Fetch and merge tools from all clients
    const allTools = await Promise.all(
      this.clients.map((client) => client.listTools(params)),
    );

    // Merge tools, removing duplicates by name
    const toolMap = new Map();
    allTools.forEach((response) => {
      response.tools.forEach((tool) => {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, tool);
        }
      });
    });

    const mergedTools = {
      tools: Array.from(toolMap.values()),
    };

    this.toolsCache = {
      clientCount: this.clients.length,
      mergedTools,
    };

    return mergedTools;
  }

  async callTool(params: CallToolRequest["params"]): Promise<CallToolResult> {
    const tools = await this.listTools();

    if (!tools.tools.some((tool) => tool.name === params.name)) {
      throw new Error(`No client found with tool: ${params.name}`);
    }

    // Find the client with this tool
    for (const client of this.clients) {
      const clientTools = await client.listTools();
      if (clientTools.tools.some((tool) => tool.name === params.name)) {
        console.log(`Calling tool ${params.name} on client ${client}`);
        return await client.callTool(params);
      }
    }

    // If we get here, the cache was out of date
    this.toolsCache = null;
    throw new Error(`Tool ${params.name} not found (cache miss)`);
  }
}
