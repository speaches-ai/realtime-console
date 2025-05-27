import { useEffect, useState } from "react";
import { SingleRowInput } from "./shared";
import Button from "./Button";
import useStore from "../store";

interface McpServer {
  name: string;
  url: string;
  enabled: boolean;
}

const STORAGE_KEY = "mcp-servers";

export function McpServerList() {
  const { mcpManager } = useStore();
  const [servers, setServers] = useState<McpServer[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [newServerUrl, setNewServerUrl] = useState("");
  const [newServerName, setNewServerName] = useState("");

  // Save servers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
  }, [servers]);

  const addServer = async () => {
    if (!newServerUrl || !newServerName) return;

    // Check if name is already taken (including disabled servers)
    if (servers.some((server) => server.name === newServerName)) {
      console.error("Server name must be unique");
      return;
    }

    try {
      await mcpManager.addServer(newServerName, newServerUrl);
      setServers([
        ...servers,
        { name: newServerName, url: newServerUrl, enabled: true },
      ]);
      setNewServerUrl("");
      setNewServerName("");
    } catch (error) {
      console.error("Failed to add MCP server:", error);
    }
  };

  const removeServer = async (serverName: string) => {
    try {
      await mcpManager.removeServer(serverName);
      setServers(servers.filter((server) => server.name !== serverName));
    } catch (error) {
      console.error("Failed to remove MCP server:", error);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-2">
        {servers.map((server) => (
          <div key={server.name} className="flex items-center gap-2">
            <span
              className={`flex-grow ${!server.enabled ? "text-gray-500" : ""}`}
            >
              {server.name} ({server.url})
            </span>
            <button
              onClick={async () => {
                if (server.enabled) {
                  await mcpManager.removeServer(server.name);
                } else {
                  await mcpManager.addServer(server.name, server.url);
                }
                setServers(
                  servers.map((s) =>
                    s.name === server.name ? { ...s, enabled: !s.enabled } : s,
                  ),
                );
              }}
              className={`px-2 py-1 ${
                server.enabled
                  ? "bg-yellow-500 hover:bg-yellow-600"
                  : "bg-green-500 hover:bg-green-600"
              } text-white rounded mr-2`}
            >
              {server.enabled ? "Disable" : "Enable"}
            </button>
            <button
              onClick={() => removeServer(server.name)}
              className="px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <SingleRowInput
            label="Name"
            value={newServerName}
            onChange={setNewServerName}
          />
          <SingleRowInput
            label="Server URL"
            value={newServerUrl}
            onChange={setNewServerUrl}
          />
          <button
            onClick={addServer}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
