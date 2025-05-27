import { useEffect, useRef, useState } from "react";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import { SessionConfiguration } from "./SessionConfiguration";
import { ConnectionSettings } from "./ConnectionSettings";
import {
  Conversation,
  conversationItemFromOpenAI,
  ConversationView,
} from "./Conversation";
import { RealtimeEvent } from "../types";
import {
  ConversationItemCreatedEvent,
  RealtimeClientEvent,
  RealtimeServerEvent,
  ResponseAudioTranscriptDeltaEvent,
  ResponseOutputItemDoneEvent,
  ResponseTextDeltaEvent,
} from "openai/resources/beta/realtime/realtime";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { ClientManager } from "./ClientManager";

const transport = new SSEClientTransport(new URL("http://0.0.0.0:3001/sse"));
const clientManager = new ClientManager();
const mcpClient = new Client(
  {
    name: "realtime-console",
    version: "0.1.0",
  },
  {
    capabilities: {
      prompts: true,
      tools: true,
      resources: {
        subscribe: true,
      },
      logging: true,
    },
  },
);
await clientManager.addClient(mcpClient, transport);

type EventListener = (event: RealtimeServerEvent) => void;
type AsyncEventListener = (event: RealtimeServerEvent) => Promise<void>;

class RealtimeConnection {
  dataChannel: RTCDataChannel | null;
  events: RealtimeEvent[];
  eventListeners: Map<string, (event: RealtimeServerEvent) => void>;

  constructor() {
    this.dataChannel = null;
    this.events = new Array<RealtimeEvent>();
    this.eventListeners = new Map();
    this.dataChannelMessageHandler = this.dataChannelMessageHandler.bind(this);
    this.setDataChannel = this.setDataChannel.bind(this);
    this.sendEvent = this.sendEvent.bind(this);
    this.addEventListener = this.addEventListener.bind(this);
    this.dataChannelMessageHandler = this.dataChannelMessageHandler.bind(this);
  }

  setDataChannel(dataChannel: RTCDataChannel) {
    this.dataChannel = dataChannel;
    this.dataChannel.addEventListener(
      "message",
      this.dataChannelMessageHandler,
    );
  }

  dataChannelMessageHandler(message: MessageEvent) {
    const event = JSON.parse(message.data) as RealtimeServerEvent;
    console.log(this);
    this.events.push(event);
    if (this.eventListeners.has(event.type)) {
      this.eventListeners.get(event.type)!(event);
    }
  }

  sendEvent(event: RealtimeClientEvent) {
    if (!this.dataChannel) {
      console.error("Failed to send event - no data channel available", event);
      return;
    }
    this.dataChannel.send(JSON.stringify(event));
  }

  addEventListener(type: string, listener: AsyncEventListener | EventListener) {
    if (!this.eventListeners.has(type)) {
      this.eventListeners.set(type, listener);
    } else {
      console.error("Event listener already exists for type", type);
    }
  }
}

const DATA_CHANNEL_LABEL = "oai-events";

const conversation = new Conversation();
const realtimeConnection = new RealtimeConnection();

const eventHandlers = {
  "session.created": () => {
    // Send initial user message
    realtimeConnection.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "What's the BMI of a guy who's 1.68m and has a weight of 58kg",
          },
        ],
      },
    });

    // Send assistant message with tool call
    realtimeConnection.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call",
        call_id: crypto.randomUUID(),
        name: "calculate_bmi",
        arguments: JSON.stringify({
          height_m: 1.68,
          weight_kg: 58,
        }),
      },
    });
  },
  "conversation.item.created": async (event: ConversationItemCreatedEvent) => {
    const item = conversationItemFromOpenAI(event.item);
    conversation.upsertItem(item);

    if (item.type === "function_call" && event.item.status === "completed") {
      const res = await clientManager.callTool({
        name: item.name,
        arguments: JSON.parse(item.arguments),
      });
      console.log("tool call response", res);
      if (!res.isError) {
        realtimeConnection.sendEvent({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: item.call_id,
            output: res.content[0].text,
          },
        });
        realtimeConnection.sendEvent({ type: "response.create" });
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
  "response.output_item.done": async (event: ResponseOutputItemDoneEvent) => {
    const item = conversationItemFromOpenAI(event.item);
    conversation.upsertItem(item);
    if (item.type === "function_call") {
      await mcpClient.callTool({
        name: item.name,
        arguments: JSON.parse(item.arguments),
      });
    }
  },
};

for (const [type, handler] of Object.entries(eventHandlers)) {
  realtimeConnection.addEventListener(type, handler);
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000/v1");
  const [model, setModel] = useState("gpt-4o-mini");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const peerConnection = useRef<RTCPeerConnection>(null);
  const audioElement = useRef<HTMLAudioElement | null>(null);
  // const [triedToConnect, setTriedToConnect] = useState(false);

  async function startSession() {
    // Get an ephemeral key from the Express server
    let EPHEMERAL_KEY = "cant-be-empty";
    if (baseUrl.includes("api.openai.com")) {
      const tokenResponse = await fetch("/token");
      const data = await tokenResponse.json();
      EPHEMERAL_KEY = data.client_secret.value;
    }
    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current!.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel(DATA_CHANNEL_LABEL);
    setDataChannel(dc);
    realtimeConnection.setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpResponse = await fetch(`${baseUrl}/realtime?model=${model}`, {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${EPHEMERAL_KEY}`,
        "Content-Type": "application/sdp",
      },
    });

    const answer: RTCSessionDescriptionInit = {
      type: "answer",
      sdp: await sdpResponse.text(),
    };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current!.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(event: RealtimeEvent) {
    if (dataChannel) {
      event.event_id = event.event_id || crypto.randomUUID();
      dataChannel.send(JSON.stringify(event));
      setEvents((prev) => [event, ...prev]);
    } else {
      console.error("Failed to send event - no data channel available", event);
    }
  }

  // Send a text message to the model
  function sendTextMessage(text: string) {
    const event: RealtimeEvent = {
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

    sendClientEvent(event);
    sendClientEvent({ type: "response.create" });
  }

  // useEffect(() => {
  //   async function connect() {
  //     // if (!triedToConnect) {
  //     //   await mcpClient.connect(transport);
  //     //   setTriedToConnect(true);
  //     // }
  //   }
  //   if (!triedToConnect) {
  //     connect();
  //   }
  // }, [triedToConnect]);
  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data) as RealtimeServerEvent;
        setEvents((prev) => [event, ...prev]);
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
      });
    }
  }, [dataChannel]);

  return (
    <div className="flex flex-col h-screen">
      <nav className="h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <h1>Speaches Realtime Console</h1>
        </div>
      </nav>
      <main className="flex flex-1 overflow-y-scroll">
        <section className="flex flex-col flex-1">
          <section className="flex-1 px-4 overflow-y-auto">
            <ConversationView
              conversation={conversation}
              onFunctionOutput={(callId, output) => {
                // Send function call output event
                sendClientEvent({
                  type: "conversation.item.create",
                  item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: output,
                  },
                });

                // Trigger a new response
                sendClientEvent({ type: "response.create" });
              }}
            />
            <EventLog events={events} />
          </section>
          <section className="h-32 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendTextMessage={sendTextMessage}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="w-96 p-4 pt-0 overflow-y-auto border-l">
          <ConnectionSettings
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            model={model}
            setModel={setModel}
          />
          <SessionConfiguration
            sendEvent={sendClientEvent}
            clientManager={mcpClient}
            transport={transport}
          />
        </section>
      </main>
    </div>
  );
}
