import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

type ToolsCache = {
  clientIndex: number;
  toolNames: Set<string>;
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

  async listTools(): Promise<Set<string>> {
    if (this.toolsCache) {
      return this.toolsCache.toolNames;
    }

    const toolNames = new Set<string>();
    for (const client of this.clients) {
      const tools = await client.listTools();
      tools.tools.forEach((tool) => toolNames.add(tool.name));
    }
    
    this.toolsCache = {
      clientIndex: this.clients.length,
      toolNames: toolNames
    };
    
    return toolNames;
  }

  async callTool(params: { name: string; arguments: any }): Promise<any> {
    // Use cached tool list if available
    const toolNames = await this.listTools();
    
    if (!toolNames.has(params.name)) {
      throw new Error(`No client found with tool: ${params.name}`);
    }

    // Find the client with this tool
    for (const client of this.clients) {
      const tools = await client.listTools();
      if (tools.tools.some((tool) => tool.name === params.name)) {
        return client.callTool(params);
      }
    }
    
    // If we get here, the cache was out of date
    this.toolsCache = null;
    throw new Error(`Tool ${params.name} not found (cache miss)`);
  }
}
