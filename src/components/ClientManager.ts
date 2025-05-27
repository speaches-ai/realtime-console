import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export class ClientManager {
  private clients: Client[] = [];

  async addClient(client: Client, transport: SSEClientTransport) {
    await client.connect(transport);
    this.clients.push(client);
  }

  async listTools(): Promise<Set<string>> {
    const toolNames = new Set<string>();
    for (const client of this.clients) {
      const tools = await client.listTools();
      tools.tools.forEach((tool) => toolNames.add(tool.name));
    }
    return toolNames;
  }

  async callTool(params: { name: string; arguments: any }): Promise<any> {
    for (const client of this.clients) {
      const tools = await client.listTools();
      if (tools.tools.some((tool) => tool.name === params.name)) {
        return client.callTool(params);
      }
    }
    throw new Error(`No client found with tool: ${params.name}`);
  }
}
