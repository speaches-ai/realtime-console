import { useEffect } from "react";
import Button from "./Button";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import { SessionConfiguration } from "./SessionConfiguration";
import { Settings } from "./Settings";
import { PromptList } from "./PromptList";
import { conversationItemFromOpenAI, ConversationView } from "./Conversation";
import {
  ConversationItemCreatedEvent,
  ResponseAudioTranscriptDeltaEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
} from "openai/resources/beta/realtime/realtime";
import { sleep } from "../utils";
import useAppStore from "../store";

export default function App() {
  // Get state and actions from Zustand store
  const {
    activeView,
    setActiveView,
    showSettings,
    setShowSettings,
    events,
    conversation,
    mcpManager,
    realtimeConnection,
    prompts,
    setPrompts,
    autoUpdateSession,
    sessionConfig,
  } = useAppStore();

  // Set up event handlers for the realtime connection
  useEffect(() => {
    const eventHandlers = {
      "conversation.item.created": async (
        event: ConversationItemCreatedEvent,
      ) => {
        const item = conversationItemFromOpenAI(event.item);
        conversation.upsertItem(item);

        if (
          item.type === "function_call" &&
          event.item.status === "completed"
        ) {
          const res = await mcpManager.callTool({
            name: item.name,
            arguments: JSON.parse(item.arguments),
          });
          console.log("tool call response", res);
          if (!res.isError) {
            const content = res.content[0];
            if (content.type === "text") {
              realtimeConnection.sendEvent({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output: content.text,
                },
              });
              realtimeConnection.sendEvent({ type: "response.create" });
            }
          }
        }
      },
      "response.text.delta": (event: ResponseTextDeltaEvent) => {
        conversation.addDelta(event.item_id, event.delta);
      },
      "response.audio_transcript.delta": (
        event: ResponseAudioTranscriptDeltaEvent,
      ) => {
        conversation.addDelta(event.item_id, event.delta);
      },
      "response.output_item.done": async (
        event: ResponseOutputItemDoneEvent,
      ) => {
        const item = conversationItemFromOpenAI(event.item);
        conversation.upsertItem(item);
        if (item.type === "function_call") {
          console.log("calling tool", item.name, item.arguments);
          const res = await mcpManager.callTool({
            name: item.name,
            arguments: JSON.parse(item.arguments),
          });

          console.log("tool call response", res);
          if (!res.isError) {
            const content = res.content[0];
            if (content.type === "text") {
              realtimeConnection.sendEvent({
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: item.call_id,
                  output: content.text,
                },
              });
              realtimeConnection.sendEvent({ type: "response.create" });
            }
          }
        }
      },
    };

    for (const [type, handler] of Object.entries(eventHandlers)) {
      realtimeConnection.addEventListener(type, handler);
    }
  }, [conversation, mcpManager, realtimeConnection]);

  // Initialize MCP servers and fetch prompts on component mount
  useEffect(() => {
    const STORAGE_KEY = "mcp-servers";
    const savedServers = localStorage.getItem(STORAGE_KEY);
    const servers = savedServers ? JSON.parse(savedServers) : [];

    // Connect to enabled MCP servers
    servers.forEach(
      async (server: { name: string; url: string; enabled: boolean }) => {
        if (server.enabled) {
          try {
            await mcpManager.addServer(server.name, server.url);
          } catch (error) {
            console.error(
              `Failed to reconnect to MCP server ${server.url}:`,
              error,
            );
          }
        }
      },
    );

    // Fetch prompts after a delay
    async function fetchPrompts() {
      try {
        await sleep(1000);
        const result = await mcpManager.listPrompts();
        console.log("Prompts:", result);
        setPrompts(result.prompts);
      } catch (error) {
        console.error("Failed to fetch prompts:", error);
      }
    }
    fetchPrompts();
  }, [mcpManager, setPrompts]);

  useEffect(() => {
    if (!realtimeConnection.eventListeners?.has("session.created")) {
      realtimeConnection.addEventListener("session.created", () => {
        if (autoUpdateSession) {
          realtimeConnection.sendEvent({
            type: "session.update",
            session: sessionConfig,
          });
        }
      });
    }
  }, [autoUpdateSession, realtimeConnection, sessionConfig]);

  // Add keyboard shortcut listener for settings
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd + ,
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [setShowSettings]);

  return (
    <div className="flex flex-col h-screen">
      <nav className="h-16 flex items-center">
        <div className="flex items-center justify-between gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <h1>Speaches Realtime Console</h1>
          <Button onClick={() => setShowSettings(true)}>Settings</Button>
        </div>
      </nav>
      <main className="flex flex-1 overflow-y-scroll">
        <section className="flex flex-col flex-1">
          <section className="flex-1 px-4 overflow-y-auto">
            <div className="flex justify-end mb-4">
              <Button
                onClick={() =>
                  setActiveView(
                    activeView === "conversation" ? "events" : "conversation",
                  )
                }
              >
                {activeView === "conversation"
                  ? "Show Events"
                  : "Show Conversation"}
              </Button>
            </div>
            {activeView === "conversation" ? (
              <ConversationView
                conversation={conversation}
                onFunctionOutput={(callId, output) => {
                  // Send function call output event
                  realtimeConnection.sendEvent({
                    type: "conversation.item.create",
                    item: {
                      type: "function_call_output",
                      call_id: callId,
                      output: output,
                    },
                  });

                  // Trigger a new response
                  realtimeConnection.sendEvent({ type: "response.create" });
                }}
              />
            ) : (
              <EventLog events={events} />
            )}
          </section>
          <section className="h-32 p-4">
            <SessionControls />
          </section>
        </section>
        <section className="w-96 p-4 pt-0 overflow-y-auto border-l">
          <SessionConfiguration />
          <div className="mt-6">
            <PromptList prompts={prompts} />
          </div>
        </section>
      </main>
      {showSettings && <Settings />}
    </div>
  );
}
