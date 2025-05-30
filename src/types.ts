import {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from "openai/resources/beta/realtime/realtime";

// New message fragment types
export interface FullMessageEvent {
  id: string;
  type: "full_message";
  data: string; // Base64 encoded JSON string
}

export interface PartialMessageEvent {
  id: string;
  type: "partial_message";
  data: string; // Base64 encoded fragment
  fragment_index: number;
  total_fragments: number;
}

export type MessageFragment = FullMessageEvent | PartialMessageEvent;

export type RealtimeEvent = (RealtimeClientEvent | RealtimeServerEvent) & {
  timestamp?: string;
};

export interface ConversationSession {
  id: string;
  title: string;
  timestamp: string;
  events: RealtimeEvent[];
  conversationItems: Record<string, unknown>;
}
