import { create, StoreApi } from "zustand";
import { ConversationSession, RealtimeEvent } from "./types";
import { ListPromptsResult } from "@modelcontextprotocol/sdk/types.js";
import { McpManager } from "./McpServerManager";
import { Conversation } from "./components/Conversation";
import { combine } from "zustand/middleware";
import {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from "openai/resources/beta/realtime/realtime.mjs";
import { ExtractState } from "zustand";

// Create a singleton McpManager instance
const mcpManager = new McpManager();

const DATA_CHANNEL_LABEL = "oai-events";
const SESSION_STORAGE_KEY = "session-config";
const BASE_URL_STORAGE_KEY = "connection-baseUrl";
const MODEL_STORAGE_KEY = "connection-model";
const SELECTED_MICROPHONE_STORAGE_KEY = "selected-microphone";
const CONVERSATION_SESSIONS_KEY = "conversation-sessions";

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "http://localhost:8000/v1";
const DEFAULT_TURN_DETECTION: TurnDetectionConfig = {
  type: "server_vad",
  threshold: 0.9,
  silence_duration_ms: 500,
  create_response: true,
};

// Default session configuration
export const DEFAULT_SESSION_CONFIG = {
  modalities: ["text", "audio"],
  model: DEFAULT_MODEL,
  instructions:
    "You are an AI voice assistant. Your responses will be converted to speech, so refrain from using any special formatting, you should respond in plain text. Keep your responses concise and to the point. You should always call a function if you can.",
  voice: "af_heart",
  input_audio_transcription: {
    model: "Systran/faster-distil-whisper-small.en",
    language: "en",
  },
  turn_detection: DEFAULT_TURN_DETECTION,
  tools: [],
  temperature: 0.8,
  max_response_output_tokens: "inf",
} as const;

type EventListener = (event: RealtimeServerEvent) => void;
type AsyncEventListener = (event: RealtimeServerEvent) => Promise<void>;

export type InputAudioTranscription = {
  model: string;
  language?: string;
};

export type TurnDetectionConfig = {
  type: "server_vad";
  threshold: number;
  silence_duration_ms: number;
  create_response: boolean;
};

export type Tool = {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type Modality = "text" | "audio";

export type Session = {
  modalities: Modality[];
  model: string;
  instructions: string;
  voice: string;
  input_audio_transcription: InputAudioTranscription;
  turn_detection: TurnDetectionConfig | null;
  tools: Tool[];
  temperature: number;
  max_response_output_tokens: "inf" | number;
};

class RealtimeConnection {
  private dataChannel: RTCDataChannel | null;
  private eventListeners: Map<
    string,
    (event: RealtimeServerEvent) => void | Promise<void>
  >;
  private anyEventListeners: Set<
    (event: RealtimeServerEvent) => void | Promise<void>
  >;
  // For handling fragmented messages
  private messageFragments: Map<
    string,
    {
      fragments: string[];
      totalFragments: number;
      receivedFragments: number;
    }
  >;

  constructor() {
    this.dataChannel = null;
    this.eventListeners = new Map();
    this.anyEventListeners = new Set();
    this.messageFragments = new Map();
    this.setDataChannel = this.setDataChannel.bind(this);
    this.sendEvent = this.sendEvent.bind(this);
    this.addEventListener = this.addEventListener.bind(this);
    this.addAnyEventListener = this.addAnyEventListener.bind(this);
  }

  setDataChannel(dataChannel: RTCDataChannel) {
    this.dataChannel = dataChannel;

    // Set up event handlers for data channel state changes
    dataChannel.onopen = (event) => {
      console.log("Data channel opened", event);
    };
    dataChannel.onclosing = (event) => {
      console.log("Data channel closing", event);
    };
    dataChannel.onclose = (event) => {
      console.log("Data channel closed", event);
    };
    dataChannel.onerror = (event) => {
      console.error("Data channel error:", event);
    };
    dataChannel.onbufferedamountlow = (event) => {
      console.log("Data channel buffered amount low", event);
    };

    // Set up message handler
    dataChannel.addEventListener("message", (message) => {
      try {
        const data = JSON.parse(message.data);

        // Handle the new message framing protocol
        if (data.type === "full_message") {
          console.log(`Received full message with ID: ${data.id}`);
          // Full message - decode and process
          const decodedMessage = atob(data.data);
          const event = JSON.parse(decodedMessage) as RealtimeServerEvent;
          console.log(`Decoded full message event type: ${event.type}`);
          this.processEvent(event);
        } else if (data.type === "partial_message") {
          // Handle partial message fragments
          const messageId = data.id;
          const fragmentIndex = data.fragment_index;
          const totalFragments = data.total_fragments;

          console.log(
            `Received fragment ${fragmentIndex + 1}/${totalFragments} for message ID: ${messageId}`,
          );

          // Initialize fragment tracking if this is the first fragment we've seen
          if (!this.messageFragments.has(messageId)) {
            console.log(
              `Creating new fragment tracker for message ID: ${messageId}`,
            );
            this.messageFragments.set(messageId, {
              fragments: new Array(totalFragments).fill(""),
              totalFragments,
              receivedFragments: 0,
            });
          }

          const fragmentInfo = this.messageFragments.get(messageId)!;
          // Store this fragment
          fragmentInfo.fragments[fragmentIndex] = data.data;
          fragmentInfo.receivedFragments++;

          console.log(
            `Stored fragment ${fragmentIndex + 1}/${totalFragments}. Have ${fragmentInfo.receivedFragments}/${totalFragments} fragments.`,
          );

          // Check if we have all fragments
          if (fragmentInfo.receivedFragments === totalFragments) {
            console.log(
              `All ${totalFragments} fragments received for message ID: ${messageId}. Reassembling...`,
            );
            // Combine all fragments and decode
            const combinedData = fragmentInfo.fragments.join("");
            const decodedMessage = atob(combinedData);

            try {
              const event = JSON.parse(decodedMessage) as RealtimeServerEvent;
              console.log(
                `Successfully reassembled message. Event type: ${event.type}`,
              );
              this.processEvent(event);
            } catch (error) {
              console.error(
                `Failed to parse reassembled message for ID ${messageId}:`,
                error,
              );
            }

            // Clean up the fragments
            this.messageFragments.delete(messageId);
            console.log(
              `Cleaned up fragment tracker for message ID: ${messageId}`,
            );
          }
        } else {
          // Legacy format - handle directly
          console.log(`Received legacy format message with type: ${data.type}`);
          const event = data as RealtimeServerEvent;
          this.processEvent(event);
        }
      } catch (error) {
        console.error("Failed to parse message data:", error);
      }
    });
  }

  // Helper method to process events once they're assembled
  private processEvent(event: RealtimeServerEvent) {
    if (this.eventListeners.has(event.type)) {
      this.eventListeners.get(event.type)!(event);
    }
    for (const listener of this.anyEventListeners) {
      listener(event);
    }
  }

  sendEvent(event: RealtimeClientEvent) {
    if (!this.dataChannel) {
      console.error("Failed to send event - no data channel available", event);
      return;
    }
    try {
      event.event_id = event.event_id || crypto.randomUUID();
      const message = JSON.stringify(event);
      this.dataChannel.send(message);

      // Add client-sent event to the event log
      store.getState().addEvent(event as RealtimeEvent);
    } catch (error) {
      console.error("Failed to send event:", error);
    }
  }

  // multiple can't exist
  addEventListener(
    type: string,
    listener: AsyncEventListener | EventListener,
  ): () => void {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, listener);
    } else {
      console.error("Event listener already exists for type", type);
    }
    return () => this.eventListeners.delete(type);
  }

  // multiple can exist
  addAnyEventListener(
    listener: AsyncEventListener | EventListener,
  ): () => void {
    this.anyEventListeners.add(listener);
    return () => this.anyEventListeners.delete(listener);
  }
}

type WithSelectors<S> = S extends { getState: () => infer T }
  ? S & { use: { [K in keyof T]: () => T[K] } }
  : never;

export const createSelectors = <S extends StoreApi<object>>(_store: S) => {
  const store = _store as WithSelectors<typeof _store>;
  store.use = {};
  for (const k of Object.keys(store.getState())) {
    (store.use as any)[k] = () =>
      // @ts-expect-error
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useStore(_store, (s) => s[k as keyof typeof s]);
  }

  return store;
};

// Load conversation sessions from localStorage
const loadConversationSessions = (): ConversationSession[] => {
  try {
    const saved = localStorage.getItem(CONVERSATION_SESSIONS_KEY);
    if (saved && saved.trim()) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.error(
      "Failed to parse conversation sessions from localStorage:",
      error,
    );
    // If there's an error, remove the invalid data
    localStorage.removeItem(CONVERSATION_SESSIONS_KEY);
  }
  return [];
};

// Save conversation sessions to localStorage
const saveConversationSessions = (sessions: ConversationSession[]) => {
  try {
    localStorage.setItem(CONVERSATION_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    console.error(
      "Failed to save conversation sessions to localStorage:",
      error,
    );
  }
};

// Create the store
const store = create(
  combine({}, (set, get) => ({
    // Initialize with default values or from localStorage
    baseUrl: localStorage.getItem(BASE_URL_STORAGE_KEY) || DEFAULT_BASE_URL,
    setBaseUrl: (url: string) => {
      localStorage.setItem(BASE_URL_STORAGE_KEY, url);
      set({ baseUrl: url });
    },

    model: localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL,
    setModel: (model: string) => {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
      set({ model });
    },

    isSessionActive: false,
    setIsSessionActive: (active: boolean) => set({ isSessionActive: active }),

    dataChannel: null as RTCDataChannel | null,
    setDataChannel: (channel: RTCDataChannel | null) =>
      set({ dataChannel: channel }),

    activeView: "conversation",
    setActiveView: (view: "conversation" | "events") =>
      set({ activeView: view }),

    showSettings: false,
    setShowSettings: (showSettings: boolean) => set({ showSettings }),

    // Conversation sessions management
    conversationSessions: loadConversationSessions(),
    currentSessionId: "",

    addConversationSession: (sessionData: Partial<ConversationSession>) => {
      const state = get() as ExtractState<typeof useStore>;
      const newSession: ConversationSession = {
        id: sessionData.id || crypto.randomUUID(),
        title: sessionData.title || `Session ${new Date().toLocaleString()}`,
        timestamp: sessionData.timestamp || new Date().toISOString(),
        events: sessionData.events || [],
        conversationItems: sessionData.conversationItems || {},
      };

      const updatedSessions = [...state.conversationSessions, newSession];
      set({
        conversationSessions: updatedSessions,
        currentSessionId: newSession.id,
      });
      saveConversationSessions(updatedSessions);
      return newSession.id;
    },

    updateConversationSession: (
      sessionId: string,
      updates: Partial<ConversationSession>,
    ) => {
      const state = get() as ExtractState<typeof useStore>;
      const updatedSessions = state.conversationSessions.map((session) =>
        session.id === sessionId ? { ...session, ...updates } : session,
      );
      set({ conversationSessions: updatedSessions });
      saveConversationSessions(updatedSessions);
    },

    deleteConversationSession: (sessionId: string) => {
      const state = get() as ExtractState<typeof useStore>;
      const updatedSessions = state.conversationSessions.filter(
        (session) => session.id !== sessionId,
      );
      set({
        conversationSessions: updatedSessions,
        currentSessionId:
          state.currentSessionId === sessionId
            ? updatedSessions[0]?.id || ""
            : state.currentSessionId,
      });
      saveConversationSessions(updatedSessions);
    },

    setCurrentSessionId: (sessionId: string) => {
      set({ currentSessionId: sessionId });
    },

    autoUpdateSession: true,
    setAutoUpdateSession: (autoUpdateSession: boolean) =>
      set({ autoUpdateSession }),

    sessionConfig: (() => {
      try {
        const saved = localStorage.getItem(SESSION_STORAGE_KEY);
        if (saved && saved.trim()) {
          return JSON.parse(saved);
        }
      } catch (error) {
        console.error(
          "Failed to parse session config from localStorage:",
          error,
        );
        // If there's an error, remove the invalid data
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      return DEFAULT_SESSION_CONFIG;
    })() as Session,

    setSessionConfig: (config: Session) => {
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(config));
        set({ sessionConfig: config });
      } catch (error) {
        console.error("Failed to save session config to localStorage:", error);
      }
    },

    events: [] as RealtimeEvent[],
    addEvent: (event: RealtimeEvent) => {
      // Add timestamp when the event is captured
      const eventWithTimestamp = {
        ...event,
        timestamp: new Date().toISOString(),
      };

      const state = get() as ExtractState<typeof useStore>;
      // @ts-expect-error
      set((state) => ({ events: [eventWithTimestamp, ...state.events] }));

      // Also save the event to the current conversation session if one exists
      if (state.currentSessionId) {
        const session = state.conversationSessions.find(
          (s) => s.id === state.currentSessionId,
        );
        if (session) {
          state.updateConversationSession(state.currentSessionId, {
            events: [eventWithTimestamp, ...session.events],
          });
        }
      }
    },
    clearEvents: () => set({ events: [] }),

    prompts: [] as ListPromptsResult["prompts"],
    setPrompts: (prompts: ListPromptsResult["prompts"]) => set({ prompts }),

    conversation: new Conversation(),

    // MCP Manager
    mcpManager,

    // Audio settings
    selectedMicrophone:
      localStorage.getItem(SELECTED_MICROPHONE_STORAGE_KEY) || "",
    setSelectedMicrophone: (deviceId: string) => {
      // TODO: could this be undefined
      localStorage.setItem(SELECTED_MICROPHONE_STORAGE_KEY, deviceId);
      set({ selectedMicrophone: deviceId });
    },
    audioDevices: [] as MediaDeviceInfo[],
    setAudioDevices: (audioDevices: MediaDeviceInfo[]) => set({ audioDevices }),

    // Realtime connection
    realtimeConnection: new RealtimeConnection(),

    // Peer connection
    peerConnection: null as RTCPeerConnection | null,
    setPeerConnection: (connection: RTCPeerConnection | null) =>
      set({ peerConnection: connection }),

    // Session control functions
    startSession: async (deviceId: string) => {
      const state = get() as ExtractState<typeof useStore>;

      try {
        // Get an ephemeral key from the Express server
        let EPHEMERAL_KEY = "cant-be-empty";
        if (state.baseUrl.includes("api.openai.com")) {
          const tokenResponse = await fetch("/token");
          const data = await tokenResponse.json();
          EPHEMERAL_KEY = data.client_secret.value;
        }
        const pc = new RTCPeerConnection();

        // Set up to play remote audio from the model
        const audioElement = document.createElement("audio");
        audioElement.autoplay = true;
        pc.ontrack = (e) => (audioElement.srcObject = e.streams[0]);

        // Add local audio track for microphone input in the browser
        const ms = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: deviceId || state.selectedMicrophone,
          },
        });
        pc.addTrack(ms.getTracks()[0]);

        // Set up data channel for sending and receiving events
        const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
        state.setDataChannel(dc);
        state.realtimeConnection.setDataChannel(dc);

        // Start the session using the Session Description Protocol (SDP)
        const offer = await pc.createOffer();
        console.log("SDP offer:", offer.sdp);
        await pc.setLocalDescription(offer);

        const sdpResponse = await fetch(
          `${state.baseUrl}/realtime?model=${state.model}`,
          {
            method: "POST",
            body: offer.sdp,
            headers: {
              Authorization: `Bearer ${EPHEMERAL_KEY}`,
              "Content-Type": "application/sdp",
            },
          },
        );

        pc.onnegotiationneeded = (event) => {
          console.log("Negotiation needed", event);
        };

        pc.onsignalingstatechange = (event) => {
          console.log("Signaling state change:", event);
        };

        pc.oniceconnectionstatechange = (event) => {
          console.log(
            "ICE connection state change:",
            event,
            pc.iceConnectionState,
          );
        };
        pc.onicegatheringstatechange = (event) => {
          console.log(
            "ICE gathering state change:",
            event,
            pc.iceGatheringState,
          );
        };
        pc.onconnectionstatechange = (event) => {
          console.log("Connection state change:", event, pc.connectionState);
        };

        pc.onicecandidate = (event) => {
          console.log("ICE candidate:", event.candidate);
        };

        pc.onicecandidateerror = (event) => {
          console.error("ICE candidate error:", event.errorText);
        };

        const answer: RTCSessionDescriptionInit = {
          type: "answer",
          sdp: await sdpResponse.text(),
        };
        console.log("SDP answer:", answer.sdp);
        await pc.setRemoteDescription(answer);

        state.setPeerConnection(pc);

        // Set up data channel event handlers
        dc.addEventListener("open", () => {
          state.setIsSessionActive(true);
          // state.clearEvents();

          // Create a new conversation session if none exists
          const sessionId =
            state.currentSessionId || state.addConversationSession({});
          state.setCurrentSessionId(sessionId);

          // Auto-update session if enabled
          if (state.autoUpdateSession) {
            state.realtimeConnection.sendEvent({
              type: "session.update",
              // @ts-expect-error
              session: state.sessionConfig,
            });
          }
        });
      } catch (error) {
        console.error("Failed to start session:", error);
        state.setIsSessionActive(false);
      }
    },

    stopSession: () => {
      const state = get() as ExtractState<typeof useStore>;

      try {
        if (state.dataChannel) {
          state.dataChannel.close();
        }

        if (state.peerConnection) {
          state.peerConnection.getSenders().forEach((sender) => {
            if (sender.track) {
              sender.track.stop();
            }
          });

          state.peerConnection.close();
        }
      } catch (error) {
        console.error("Error stopping session:", error);
      } finally {
        state.setIsSessionActive(false);
        state.setDataChannel(null);
        state.setPeerConnection(null);
      }
    },

    sendTextMessage: (text: string) => {
      const state = get() as ExtractState<typeof useStore>;

      const event: RealtimeClientEvent = {
        type: "conversation.item.create",
        item: {
          type: "message",
          role: "user",
          content: [
            {
              type: "input_text",
              text: text,
            },
          ],
        },
      };

      state.realtimeConnection.sendEvent(event);
      state.realtimeConnection.sendEvent({ type: "response.create" });
    },
  })),
);

const useStore = createSelectors(store);

export default useStore; // FIXME: do not use default export
