/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import Button from "./Button";
import { SliderInput } from "./shared";
import { RealtimeClientEvent } from "openai/resources/beta/realtime/realtime.mjs";
import { McpManager } from "../McpServerManager";
import { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { sleep } from "../utils";

type Modality = "text" | "audio";

type InputAudioTranscription = {
  model: string;
  language?: string;
};

type TurnDetectionConfig = {
  type: "server_vad";
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
  create_response?: boolean;
};

type Tool = {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, any>;
};

type Session = {
  modalities: Modality[];
  model: string;
  instructions: string;
  voice: string;
  input_audio_transcription: InputAudioTranscription;
  turn_detection: TurnDetectionConfig | null;
  tools: Tool[];
  // tool_choice: "auto" | "none" | "required" | string;
  temperature: number;
  max_response_output_tokens: number | "inf";
};

type Voice = {
  voice_id: string;
};

const baseUrl = "http://localhost:8000/v1";

type SessionConfigurationProps = {
  sendEvent: (event: RealtimeClientEvent) => void;
  mcpManager: McpManager;
  autoUpdateSession: boolean;
  setAutoUpdateSession: (value: boolean) => void;
  sessionConfig: Session;
  setSessionConfig: (config: Session) => void;
  prompts: ListPromptsResult["prompts"];
};

function mcpToolsToOpenAI(tools: ListToolsResult): Tool[] {
  return tools.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}
export function SessionConfiguration(props: SessionConfigurationProps) {
  const { sessionConfig, setSessionConfig } = props;
  const [voices, setVoices] = useState<string[]>([]);
  const [transcriptionModels, setTranscriptionModels] = useState<string[]>([]);
  // const [triedToConnect, setTriedToConnect] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    props.sendEvent({ type: "session.update", session: sessionConfig });
  };

  const handleChange = (field: keyof Session, value: any) => {
    setSessionConfig((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  useEffect(() => {
    async function fetchVoices() {
      const res = await fetch(baseUrl + "/audio/speech/voices");
      const data: Voice[] = await res.json();
      setVoices(data.map((voice) => voice.voice_id));
    }
    async function fetchTranscriptionModels() {
      const res = await fetch(baseUrl + "/models");
      const data = await res.json();
      setTranscriptionModels(data.data.map((model) => model.id));
    }
    async function fetchTools() {
      await sleep(400);
      const tools = await props.mcpManager.listTools();
      console.log("Available tools:", tools);
      const openaiTools = mcpToolsToOpenAI(tools);
      handleChange("tools", openaiTools);
    }
    fetchVoices();
    fetchTranscriptionModels();

    fetchTools();
  }, []);
  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="auto_update"
          checked={props.autoUpdateSession}
          onChange={(e) => props.setAutoUpdateSession(e.target.checked)}
          className="rounded border-gray-300"
        />
        <label htmlFor="auto_update" className="text-sm text-gray-600">
          Auto-update session on connect
        </label>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Modalities
        </label>
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={true}
              disabled={true}
              className="rounded border-gray-300"
            />
            <label className="text-sm text-gray-600">Text (Required)</label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sessionConfig.modalities?.includes("audio")}
              onChange={(e) => {
                const newModalities = ["text"];
                if (e.target.checked) {
                  newModalities.push("audio");
                }
                handleChange("modalities", newModalities);
              }}
              className="rounded border-gray-300"
            />
            <label className="text-sm text-gray-600">Audio</label>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Model</label>
        <input
          type="text"
          value={sessionConfig.model}
          onChange={(e) => handleChange("model", e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          System instructions
        </label>
        <div className="flex flex-col gap-2">
          <select
            onChange={async (e) => {
              if (e.target.value) {
                const content = await props.mcpManager.getPrompt(
                  e.target.value,
                );
                console.log("Prompt content:", content);
                if (content) {
                  handleChange("instructions", content);
                }
              }
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          >
            <option value="">Select a prompt...</option>
            {props.prompts.map((prompt) => (
              <option key={prompt.name} value={prompt.name}>
                {prompt.name}
              </option>
            ))}
          </select>
          <textarea
            value={sessionConfig.instructions}
            onChange={(e) => handleChange("instructions", e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
            rows={5}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Voice</label>
        <select
          value={sessionConfig.voice}
          onChange={(e) => handleChange("voice", e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        >
          {voices.map((voice) => (
            <option key={voice} value={voice}>
              {voice}
            </option>
          ))}
        </select>
      </div>

      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-gray-700">
          Audio Transcription
        </label>
        <div className="mt-2 space-y-4">
          <div className="space-y-3 pl-6">
            <div>
              <label className="block text-sm text-gray-600">Model</label>

              <select
                value={sessionConfig.input_audio_transcription.model}
                onChange={(e) =>
                  handleChange("input_audio_transcription", {
                    ...sessionConfig.input_audio_transcription,
                    model: e.target.value,
                  })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              >
                {transcriptionModels.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-600">
                Language (optional)
              </label>
              <input
                type="text"
                value={sessionConfig.input_audio_transcription.language || ""}
                onChange={(e) =>
                  handleChange("input_audio_transcription", {
                    ...sessionConfig.input_audio_transcription,
                    language: e.target.value || undefined,
                  })
                }
                placeholder="e.g. en, fr, de"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              />
            </div>
          </div>
        </div>
      </div>
      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-gray-700">
          Server Turn Detection
        </label>
        <div className="mt-2 space-y-4">
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="vad"
                name="turn_detection_type"
                checked={sessionConfig.turn_detection !== null}
                onChange={() =>
                  handleChange("turn_detection", {
                    type: "server_vad",
                    threshold: 0.5,
                    prefix_padding_ms: 1000,
                    silence_duration_ms: 700,
                    create_response: true,
                  })
                }
                className="border-gray-300"
              />
              <label htmlFor="vad" className="text-sm text-gray-600">
                Voice activity
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="disabled"
                name="turn_detection_type"
                checked={sessionConfig.turn_detection === null}
                onChange={() => handleChange("turn_detection", null)}
                className="border-gray-300"
              />
              <label htmlFor="disabled" className="text-sm text-gray-600">
                Disabled
              </label>
            </div>
          </div>

          {sessionConfig.turn_detection && (
            <div className="space-y-3 pl-6">
              <SliderInput
                label="Threshold"
                value={sessionConfig.turn_detection.threshold ?? 0.5}
                onChange={(value) =>
                  handleChange("turn_detection", {
                    ...sessionConfig.turn_detection,
                    threshold: value,
                  })
                }
                min={0}
                max={1}
                step={0.1}
              />

              <SliderInput
                label="Silence Duration (ms)"
                value={sessionConfig.turn_detection.silence_duration_ms ?? 700}
                onChange={(value) =>
                  handleChange("turn_detection", {
                    ...sessionConfig.turn_detection,
                    silence_duration_ms: value,
                  })
                }
                min={0}
                max={2000}
                step={100}
              />

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="create_response"
                  checked={sessionConfig.turn_detection.create_response ?? true}
                  onChange={(e) =>
                    handleChange("turn_detection", {
                      ...sessionConfig.turn_detection,
                      create_response: e.target.checked,
                    })
                  }
                  className="rounded border-gray-300"
                />
                <label
                  htmlFor="create_response"
                  className="text-sm text-gray-600"
                >
                  Create Response
                </label>
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        <SliderInput
          label="Temperature"
          value={sessionConfig.temperature ?? 0.8}
          onChange={(value) => handleChange("temperature", value)}
          min={0.6}
          max={1.2}
          step={0.1}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Max Response Tokens
        </label>
        <input
          type="text"
          value={sessionConfig.max_response_output_tokens}
          onChange={(e) =>
            handleChange(
              "max_response_output_tokens",
              e.target.value === "inf" ? "inf" : parseInt(e.target.value),
            )
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div className="flex gap-2 mt-4">
        <Button type="submit">Update Session Configuration</Button>
        <Button
          type="button"
          onClick={() => {
            const dataStr = JSON.stringify(sessionConfig, null, 2);
            const dataBlob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "session-config.json";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }}
        >
          Export Settings
        </Button>
      </div>
    </form>
  );
}
