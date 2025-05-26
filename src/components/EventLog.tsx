import { ArrowUp, ArrowDown } from "react-feather";
import { JSX, useState } from "react";
import { RealtimeEvent } from "../types";
import { downloadJsonFile } from "../utils";

const EVENT_LOG_FILE_NAME = "event-log.json";

function Event({ event }: { event: RealtimeEvent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const isClient = event.event_id && !event.event_id.startsWith("event_");

  return (
    <div className="flex flex-col gap-2 p-2 rounded-md bg-gray-50 w-full">
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isClient ? (
          <ArrowDown className="text-blue-400 flex-shrink-0" />
        ) : (
          <ArrowUp className="text-green-400 flex-shrink-0" />
        )}
        <div className="text-sm text-gray-500 truncate">
          {isClient ? "client:" : "server:"}
          &nbsp;{event.type} |{" "}
          {event.timestamp
            ? new Date(event.timestamp).toLocaleTimeString()
            : "unknown time"}
        </div>
      </div>
      {isExpanded && (
        <div className="text-gray-500 bg-gray-200 p-2 rounded-md w-full">
          <div className="overflow-x-auto">
            <pre className="text-xs whitespace-pre-wrap break-all">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export type EventLogProps = {
  events: RealtimeEvent[];
};

export default function EventLog(props: EventLogProps) {
  const eventsToDisplay: JSX.Element[] = [];
  const deltaEvents = new Map<RealtimeEvent["type"], RealtimeEvent>();

  props.events.forEach((event) => {
    if (event.type.endsWith("delta")) {
      // @ts-expect-error
      if (deltaEvents[event.type]) {
        // for now just log a single event per render pass
        return;
      } else {
        // @ts-expect-error
        deltaEvents[event.type] = event;
      }
    }

    eventsToDisplay.push(<Event key={event.event_id} event={event} />);
  });

  return (
    <div className="flex flex-col gap-2 w-full relative">
      <div className="absolute top-0 right-0 z-10">
        <button
          onClick={() => downloadJsonFile(props.events, EVENT_LOG_FILE_NAME)}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
        >
          Export JSON
        </button>
      </div>
      {props.events.length === 0 ? (
        <div className="text-gray-500">Awaiting events...</div>
      ) : (
        eventsToDisplay
      )}
    </div>
  );
}
