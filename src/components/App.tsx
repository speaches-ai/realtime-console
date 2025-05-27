import { useEffect, useState } from "react";
import Button from "./Button";
import { ChevronLeft, ChevronRight } from "react-feather";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import { SessionConfiguration } from "./SessionConfiguration";
import { Settings } from "./Settings";
import { PromptList } from "./PromptList";
import { ConversationSidebar } from "./ConversationSidebar";
import { ErrorAlerts } from "./ErrorAlert";
import { conversationItemFromOpenAI, ConversationView, Conversation } from "./Conversation";
import {
  ConversationItemCreatedEvent,
  ConversationItemInputAudioTranscriptionCompletedEvent,
  ResponseAudioTranscriptDeltaEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
} from "openai/resources/beta/realtime/realtime";
import useStore from "../store";

export default function App() {
  // Get state and actions from Zustand store
  const {
    activeView,
    setActiveView,
    showSettings,
    setShowSettings,
    events,
    addEvent,
    clearEvents,
    conversation,
    mcpManager,
    realtimeConnection,
    prompts,
    autoUpdateSession,
    sessionConfig,
    currentSessionId,
    conversationSessions,
  } = useStore();
  
  // State for sidebar visibility
  const [showSidebar, setShowSidebar] = useState(true);
  
  // State for error alerts
  const [errorMessages, setErrorMessages] = useState<string[]>([]);

  // Handle dismissing errors
  const dismissError = (index: number) => {
    setErrorMessages(prevErrors => prevErrors.filter((_, i) => i !== index));
  };

  // Listen for all events from the server
  useEffect(() => {
    return realtimeConnection.addAnyEventListener((message) => {
      addEvent(message);
      
      // Check if this is an error event
      if (message.type && 
          (message.type === 'error' || 
           message.type.includes('error') || 
           message.type.includes('failed'))) {
        
        // Extract error message based on event structure
        let errorMessage = 'An error occurred';
        
        if ('error' in message && typeof message.error === 'string') {
          errorMessage = message.error;
        } else if ('message' in message && typeof message.message === 'string') {
          errorMessage = message.message;
        } else if ('reason' in message && typeof message.reason === 'string') {
          errorMessage = message.reason;
        } else {
          // If we can't find a specific field, use the whole event
          errorMessage = JSON.stringify(message);
        }
        
        // Add to error messages
        setErrorMessages(prev => [...prev, errorMessage]);
      }
    });
  }, [realtimeConnection, addEvent]);

  // Set up conversation update listener to save changes to current session
  useEffect(() => {
    const saveConversation = () => {
      if (currentSessionId) {
        const serializedConversation = conversation.serialize();
        useStore.getState().updateConversationSession(currentSessionId, {
          conversationItems: serializedConversation
        });
      }
    };
    
    conversation.setUpdateListener(saveConversation);
    
    return () => {
      // Clear the update listener when the component unmounts
      conversation.setUpdateListener(undefined);
    };
  }, [conversation, currentSessionId]);

  useEffect(() => {
    return realtimeConnection.addEventListener(
      "conversation.item.created",
      // @ts-expect-error
      async (event: ConversationItemCreatedEvent) => {
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
    );
  }, [realtimeConnection, conversation, mcpManager]);

  useEffect(() => {
    return realtimeConnection.addEventListener(
      "conversation.item.input_audio_transcription.completed",
      (event: ConversationItemInputAudioTranscriptionCompletedEvent) => {
        conversation.addDelta(event.item_id, event.transcript);
      },
    );
  }, [realtimeConnection, conversation]);

  useEffect(() => {
    return realtimeConnection.addEventListener(
      "response.text.delta",
      // @ts-expect-error
      (event: ResponseTextDeltaEvent) => {
        conversation.addDelta(event.item_id, event.delta);
      },
    );
  }, [realtimeConnection, conversation]);

  useEffect(() => {
    return realtimeConnection.addEventListener(
      "response.audio_transcript.delta",
      // @ts-expect-error
      (event: ResponseAudioTranscriptDeltaEvent) => {
        conversation.addDelta(event.item_id, event.delta);
      },
    );
  }, [realtimeConnection, conversation]);

  useEffect(() => {
    return realtimeConnection.addEventListener(
      "response.output_item.done",
      // @ts-expect-error
      async (event: ResponseOutputItemDoneEvent) => {
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
    );
  }, [realtimeConnection, conversation, mcpManager]);

  // Initialize MCP servers on component mount
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
  }, [mcpManager]);

  useEffect(() => {
    return realtimeConnection.addEventListener("session.created", () => {
      if (autoUpdateSession) {
        realtimeConnection.sendEvent({
          type: "session.update",
          // @ts-expect-error
          session: sessionConfig,
        });
      }
    });
  }, [autoUpdateSession, realtimeConnection, sessionConfig]);

  // Add keyboard shortcut listeners
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Ctrl/Cmd + ,
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setShowSettings(!showSettings);
      }
      
      // Check for Ctrl/Cmd + Shift + S
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setShowSidebar(!showSidebar);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [setShowSettings, showSettings, showSidebar, setShowSidebar]);
  
  // Load conversation data when currentSessionId changes
  useEffect(() => {
    if (currentSessionId) {
      const session = conversationSessions.find(s => s.id === currentSessionId);
      if (session) {
        // Load events from the selected session
        clearEvents();
        
        // Add all events from the session to the current events list
        if (session.events.length > 0) {
          session.events.forEach(event => {
            // Use a direct way to set events rather than addEvent to avoid circular updates
            // This will put events in the UI without saving them again to the session
            // @ts-expect-error
            useStore.setState((state) => ({ 
              events: [event, ...state.events] 
            }));
          });
        }
        
        // Load conversation items if they exist
        if (session.conversationItems && Object.keys(session.conversationItems).length > 0) {
          // Create a new conversation instance with the saved items
          const newConversation = new Conversation(session.conversationItems);
          
          // Update the store with the new conversation
          useStore.setState({ 
            conversation: newConversation 
          });
        } else {
          // Reset to a new conversation if there are no saved items
          useStore.setState({ 
            conversation: new Conversation() 
          });
        }
      }
    }
  }, [currentSessionId, conversationSessions, clearEvents]);

  return (
    <div className="flex flex-col h-screen">
      <nav className="h-16 flex items-center">
        <div className="flex items-center justify-between gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <h1>Speaches Realtime Console</h1>
          <Button onClick={() => setShowSettings(true)}>Settings</Button>
        </div>
      </nav>
      <main className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar with Conversation History */}
        <div className={`${showSidebar ? 'w-64' : 'w-0'} transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0`}>
          <ConversationSidebar />
        </div>
        
        {/* Sidebar Toggle Button */}
        <div 
          className="absolute z-10 group"
          style={{ 
            left: showSidebar ? '15.5rem' : '0', 
            top: '1rem',
            transition: 'left 0.3s ease-in-out'
          }}
        >
          <button 
            onClick={() => setShowSidebar(!showSidebar)} 
            className="p-1.5 rounded-r-md bg-gray-200 hover:bg-gray-300 shadow-sm"
            aria-label={showSidebar ? "Hide conversation sidebar" : "Show conversation sidebar"}
          >
            {showSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
          </button>
          <div className="absolute left-full ml-2 top-0 bg-gray-800 text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
            Toggle sidebar (⌘/Ctrl+Shift+S)
          </div>
        </div>
        
        {/* Main Content Area */}
        <section className="flex flex-col flex-1 overflow-y-auto">
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
        
        {/* Right Sidebar */}
        <section className="w-96 p-4 pt-0 overflow-y-auto border-l">
          <SessionConfiguration />
          <div className="mt-6">
            <PromptList prompts={prompts} />
          </div>
        </section>
      </main>
      {showSettings && <Settings />}
      
      {/* Error Alerts */}
      <ErrorAlerts errors={errorMessages} onDismiss={dismissError} />
    </div>
  );
}
