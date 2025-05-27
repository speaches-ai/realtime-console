import { McpServerList } from "./McpServerList";
import { ConnectionSettings } from "./ConnectionSettings";
import { useState, useEffect } from "react";
import useAppStore from "../store";

type Tab = "connection" | "mcp-servers";

export function Settings() {
  const { setShowSettings, mcpManager } = useAppStore();
  const [activeTab, setActiveTab] = useState<Tab>("connection");

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowSettings(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [setShowSettings]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "connection", label: "Connection Settings" },
    { id: "mcp-servers", label: "MCP Servers" },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-[1000px] max-h-[80vh] flex">
        {/* Left sidebar */}
        <div className="w-64 border-r border-gray-200 dark:border-gray-700 p-4">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">Settings</h2>
            <button
              onClick={() => setShowSettings(false)}
              className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            >
              ✕
            </button>
          </div>
          <nav>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full text-left px-4 py-2 rounded-md mb-2 ${
                  activeTab === tab.id
                    ? "bg-blue-500 text-white"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === "connection" && <ConnectionSettings />}
          {activeTab === "mcp-servers" && <McpServerList mcpManager={mcpManager} />}
        </div>
      </div>
    </div>
  );
}
