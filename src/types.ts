import {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from "openai/resources/beta/realtime/realtime";

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
