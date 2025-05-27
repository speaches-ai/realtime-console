import {
  Client,
  ClientOptions,
} from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  ListToolsResult,
  CallToolResult,
  CallToolRequest,
  ListToolsRequest,
  ListPromptsResult,
  ListResourcesResult,
  ListResourceTemplatesResult,
  Implementation,
  ServerCapabilities,
} from "@modelcontextprotocol/sdk/types.js";

// type SseMcpServer = {
//   url: string;
// };
//
// type McpServersConfiguration = {
//   mcpServers: {
//     [key: string]: SseMcpServer;
//   };
// };

const implementation: Implementation = {
  name: "realtime-console",
  version: "0.1.0",
};
const clientOptions: ClientOptions = {
  capabilities: {
    prompts: true,
    tools: true,
    resources: {
      subscribe: true,
    },
    logging: true,
  },
};

class Server {
  name: string;
  client: Client;
  serverCapabilities: ServerCapabilities;
  private cachedTools: ListToolsResult | null = null;
  private cachedPrompts: ListPromptsResult | null = null;
  private cachedResources: ListResourcesResult | null = null;
  private cachedResourceTemplates: ListResourceTemplatesResult | null = null;

  constructor(
    name: string,
    client: Client,
    serverCapabilities: ServerCapabilities,
  ) {
    this.name = name;
    this.client = client;
    this.serverCapabilities = serverCapabilities;
  }

  async listTools(
    params?: ListToolsRequest["params"],
  ): Promise<ListToolsResult> {
    if (this.cachedTools) {
      return this.cachedTools;
    }

    this.cachedTools = await this.client.listTools(params);
    return this.cachedTools;
  }

  async listPrompts(): Promise<ListPromptsResult> {
    if (typeof this.serverCapabilities.prompts === "undefined") {
      console.warn(`Prompts not supported by server ${this.name}`);
      return { prompts: [] };
    }
    if (this.cachedPrompts) {
      return this.cachedPrompts;
    }

    this.cachedPrompts = await this.client.listPrompts();
    return this.cachedPrompts;
  }

  async listResources(): Promise<ListResourcesResult> {
    if (typeof this.serverCapabilities.resources === "undefined") {
      console.warn(`Resources not supported by server ${this.name}`);
      return { resources: [] };
    }
    if (this.cachedResources) {
      return this.cachedResources;
    }

    this.cachedResources = await this.client.listResources();
    return this.cachedResources;
  }

  async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    if (typeof this.serverCapabilities.resources === "undefined") {
      console.warn(`Resource templates not supported by server ${this.name}`);
      return { resourceTemplates: [] };
    }
    if (this.cachedResourceTemplates) {
      return this.cachedResourceTemplates;
    }

    this.cachedResourceTemplates = await this.client.listResourceTemplates();
    return this.cachedResourceTemplates;
  }
}

export class McpManager {
  private servers: Map<string, Server> = new Map();

  async addServer(name: string, url: string) {
    const transport = new SSEClientTransport(new URL(url));
    const client = new Client(implementation, clientOptions);
    await client.connect(transport);
    const serverCapabilities = client.getServerCapabilities();
    console.log(
      `Connected to server ${name} with capabilities:`,
      serverCapabilities,
    );
    const server = new Server(name, client, serverCapabilities);
    this.servers.set(name, server);
  }

  async removeServer(name: string) {
    const server = this.servers.get(name);
    if (server) {
      await server.client.close();
      this.servers.delete(name);
    } else {
      console.error(`Client ${name} not found`);
    }
  }

  async listTools(
    params?: ListToolsRequest["params"],
  ): Promise<ListToolsResult> {
    // Fetch and merge tools from all clients
    const results = await Promise.allSettled(
      Array.from(this.servers.values()).map((server) =>
        server.listTools(params),
      ),
    );

    // Merge tools, removing duplicates by name
    const toolMap = new Map();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        result.value.tools.forEach((tool) => {
          if (!toolMap.has(tool.name)) {
            toolMap.set(tool.name, tool);
          } else {
            console.error(`Duplicate tool found: ${tool.name}`);
          }
        });
      } else {
        console.error("Failed to fetch tools:", result.reason);
      }
    });

    const mergedTools = {
      tools: Array.from(toolMap.values()),
    };

    return mergedTools;
  }

  async callTool(params: CallToolRequest["params"]): Promise<CallToolResult> {
    const tools = await this.listTools();

    if (!tools.tools.some((tool) => tool.name === params.name)) {
      throw new Error(`No client found with tool: ${params.name}`);
    }

    // Find the client with this tool
    for (const server of this.servers.values()) {
      const serverTools = await server.listTools();
      if (serverTools.tools.some((tool) => tool.name === params.name)) {
        console.log(`Calling tool ${params.name} on server ${server.name}`);
        return await server.client.callTool(params);
      }
    }

    // If we get here, the cache was out of date
    throw new Error(`Tool ${params.name} not found (cache miss)`);
  }

  async getPrompt(name: string): Promise<string | null> {
    for (const server of this.servers.values()) {
      try {
        const result = await server.client.getPrompt({ name, arguments: {} }); // HACK
        if (result.content) {
          return result.content;
        }
      } catch (error) {
        console.error("Failed to fetch prompt:", error);
      }
    }
    return null;
  }

  async listPrompts(): Promise<ListPromptsResult> {
    // Fetch prompts from all clients
    const results = await Promise.allSettled(
      [...this.servers.values()].map((server) => server.listPrompts()),
    );

    // Merge prompts, removing duplicates by name
    const promptMap = new Map();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        console.log(result.value);
        result.value.prompts.forEach((prompt) => {
          if (!promptMap.has(prompt.name)) {
            promptMap.set(prompt.name, prompt);
          }
        });
      } else {
        console.error("Failed to fetch prompts:", result.reason);
      }
    });

    return {
      prompts: Array.from(promptMap.values()),
    };
  }

  async listResources(): Promise<ListResourcesResult> {
    // Fetch resources from all servers
    const results = await Promise.allSettled(
      [...this.servers.values()].map((server) => server.listResources()),
    );

    // Merge resources, removing duplicates by id
    const resourceMap = new Map();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        result.value.resources.forEach((resource) => {
          if (!resourceMap.has(resource.id)) {
            resourceMap.set(resource.id, resource);
          }
        });
      } else {
        console.error("Failed to fetch resources:", result.reason);
      }
    });

    return {
      resources: Array.from(resourceMap.values()),
    };
  }

  async listResourceTemplates(): Promise<ListResourceTemplatesResult> {
    // Fetch resource templates from all servers
    const results = await Promise.allSettled(
      [...this.servers.values()].map((server) =>
        server.listResourceTemplates(),
      ),
    );

    // Merge resource templates, removing duplicates by id
    const templateMap = new Map<
      string,
      ListResourceTemplatesResult["resourceTemplates"][0]
    >();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        result.value.resourceTemplates.forEach((template) => {
          if (!templateMap.has(template.uriTemplate)) {
            templateMap.set(template.uriTemplate, template);
          }
        });
      } else {
        console.error("Failed to fetch resource templates:", result.reason);
      }
    });

    return {
      resourceTemplates: Array.from(templateMap.values()),
    };
  }
}
