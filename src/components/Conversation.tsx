import { useState, useEffect, useRef } from "react";
import { ConversationItem as OpenAIConversationItem } from "openai/resources/beta/realtime/realtime";

export interface ConversationItemContentAudio {
  type: "audio";
  transcript: string;
  // audio: string;
}

export interface ConversationItemContentInputAudio {
  type: "input_audio";
  transcript: string | null;
}

export interface ConversationItemContentItemReference {
  type: "item_reference";
  id: string;
}

export interface ConversationItemContentText {
  type: "text";
  text: string;
}

export interface ConversationItemContentInputText {
  type: "input_text";
  text: string;
}

export type ConversationItemContent =
  | ConversationItemContentInputText
  | ConversationItemContentInputAudio
  | ConversationItemContentItemReference
  | ConversationItemContentText
  | ConversationItemContentAudio;

interface BaseConversationItem {
  id: string;
  object: "realtime.item";
  status: "incomplete" | "completed";
}

export interface ConversationItemMessage extends BaseConversationItem {
  type: "message";
  role: "assistant" | "user" | "system";
  content: ConversationItemContent[];
}

export interface ConversationItemFunctionCall extends BaseConversationItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

export interface ConversationItemFunctionCallOutput
  extends BaseConversationItem {
  type: "function_call_output";
  call_id: string;
  output: string;
}

export type ConversationItem =
  | ConversationItemMessage
  | ConversationItemFunctionCall
  | ConversationItemFunctionCallOutput;

export function conversationItemFromOpenAI(
  item: OpenAIConversationItem,
): ConversationItem {
  if (
    typeof item.id === "undefined" ||
    typeof item.status === "undefined" ||
    typeof item.type === "undefined"
  ) {
    throw new Error(`Invalid item: ${JSON.stringify(item)}`);
  }
  if (item.type === "message") {
    return {
      id: item.id!,
      object: "realtime.item",
      status: item.status!,
      type: item.type,
      role: item.role!,
      content:
        item.content!.map((content) => {
          if (content.type === "text") {
            return {
              type: "text",
              text: content.text!,
            };
          } else if (content.type === "audio") {
            return {
              type: "audio",
              transcript: content.transcript!,
            };
          } else if (content.type === "input_text") {
            return {
              type: "input_text",
              text: content.text!,
            };
          } else if (content.type === "input_audio") {
            return {
              type: "input_audio",
              transcript: content.transcript!,
            };
          } else if (content.type === "item_reference") {
            return {
              type: "item_reference",
              id: content.id!,
            };
          }
        }) ?? [],
    };
  } else if (item.type === "function_call") {
    return {
      id: item.id!,
      object: "realtime.item",
      status: item.status!,
      type: item.type,
      call_id: item.call_id!,
      name: item.name!,
      arguments: item.arguments!,
    };
  } else if (item.type === "function_call_output") {
    return {
      id: item.id!,
      object: "realtime.item",
      status: item.status!,
      type: item.type,
      call_id: item.call_id!,
      output: item.output!,
    };
  }
  throw new Error(`Invalid item type: ${item.type}`); // HACK
}

export class Conversation {
  items: Map<string, ConversationItem>;

  constructor() {
    this.items = new Map();
  }

  upsertItem(item: ConversationItem) {
    this.items.set(item.id, item);
  }

  addItemContent(id: string, content: ConversationItemContent) {
    const item = this.items.get(id);
    if (item) {
      if (item.type === "message") {
        item.content.push(content);
      } else {
        console.error("Cannot add content to a non-message item");
      }
    }
  }

  addDelta(id: string, delta: string) {
    const item = this.items.get(id);
    if (typeof item === "undefined") {
      console.error("Cannot add delta to non-existent item");
      return;
    }

    if (item.type !== "message") {
      console.error("Cannot add delta to non-message item");
      return;
    }

    if (item.content.length === 0) {
      console.error("Cannot add delta to message with no content");
      return;
    }

    const content = item.content[0];

    if (content.type === "text") {
      content.text += delta;
    } else if (content.type === "audio") {
      content.transcript += delta;
    } else if (content.type === "input_text") {
      content.text += delta;
    } else if (content.type === "input_audio") {
      console.error("Cannot add delta to audio content");
    } else if (content.type === "item_reference") {
      console.error("Cannot add delta to item reference content");
    }
  }
}

function MessageItem(props: { item: ConversationItemMessage }) {
  return (
    <div className="mb-4">
      <div className="font-bold text-sm text-gray-600 mb-1">
        {props.item.role.toUpperCase()}
      </div>
      <div>
        {props.item.content.map((content, index) => {
          if (content.type === "text" || content.type === "input_text") {
            return <p key={index}>{content.text}</p>;
          } else if (content.type === "audio") {
            return <p key={index}>{content.transcript}</p>;
          }
        })}
      </div>
    </div>
  );
}

function FunctionCallItem(props: {
  item: ConversationItemFunctionCall;
  output?: ConversationItemFunctionCallOutput;
  onOutput?: (callId: string, output: string) => void;
}) {
  const [outputText, setOutputText] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className="mb-4 p-4 border rounded-md bg-gray-50">
      <div className="flex justify-between items-center mb-2">
        <div className="font-bold">{props.item.name}</div>
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="text-gray-500 hover:text-gray-700"
        >
          {isCollapsed ? "▼ Expand" : "▲ Collapse"}
        </button>
      </div>
      {!isCollapsed && (
        <>
          <div className="mb-4">
            <div className="text-sm text-gray-600 mb-1">Arguments:</div>
            <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
              <code>{props.item.arguments}</code>
            </pre>
          </div>
          <div>
            <div className="text-sm text-gray-600 mb-1">Output:</div>
            {props.output ? (
              <pre className="bg-gray-100 p-2 rounded overflow-x-auto">
                <code>{props.output.output}</code>
              </pre>
            ) : (
              <div>
                <textarea
                  value={outputText}
                  onChange={(e) => setOutputText(e.target.value)}
                  className="w-full p-2 border rounded-md"
                  rows={3}
                />
                <button
                  onClick={() =>
                    props.onOutput?.(props.item.call_id, outputText)
                  }
                  className="mt-2 px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Submit Output
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ConversationView(props: {
  conversation: Conversation;
  onFunctionOutput?: (callId: string, output: string) => void;
}) {
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const [itemsCount, setItemsCount] = useState(0);

  // Check if user is at the bottom of the conversation
  const isAtBottom = () => {
    if (!conversationEndRef.current) return true;

    const container = conversationEndRef.current.parentElement;
    if (!container) return true;

    const scrollPosition = container.scrollTop + container.clientHeight;
    const scrollHeight = container.scrollHeight;

    // Consider "at bottom" if within 100px of the bottom
    return scrollHeight - scrollPosition < 100;
  };

  // Scroll to bottom if user was already at bottom
  useEffect(() => {
    const currentItemsCount = props.conversation.items.size;

    if (currentItemsCount > itemsCount) {
      if (isAtBottom()) {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
      setItemsCount(currentItemsCount);
    }
  }, [props.conversation.items.size, itemsCount]);

  // Also scroll when content changes (for deltas)
  useEffect(() => {
    if (isAtBottom()) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  });

  return (
    <div>
      {Array.from(props.conversation.items.values()).map((item) => {
        if (item.type === "message") {
          return <MessageItem key={item.id} item={item} />;
        } else if (item.type === "function_call") {
          const output = Array.from(props.conversation.items.values()).find(
            (i) =>
              i.type === "function_call_output" && i.call_id === item.call_id,
          ) as ConversationItemFunctionCallOutput | undefined;

          return (
            <FunctionCallItem
              key={item.id}
              item={item}
              output={output}
              onOutput={props.onFunctionOutput}
            />
          );
        }
      })}
      <div ref={conversationEndRef} />
    </div>
  );
}
