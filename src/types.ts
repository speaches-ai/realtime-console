import {
  RealtimeClientEvent,
  RealtimeServerEvent,
} from "openai/resources/beta/realtime/realtime";

export type RealtimeEvent = RealtimeClientEvent | RealtimeServerEvent;
