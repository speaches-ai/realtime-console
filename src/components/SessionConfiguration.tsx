import { useState, useEffect } from "react";
import Button from "./Button";
import { SliderInput } from "./shared";
import useStore, { DEFAULT_SESSION_CONFIG } from "../store";
import { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { downloadJsonFile } from "../utils";

type Tool = {
  type: "function";
  name: string;
  description?: string;
  parameters: Record<string, any>;
};

function mcpToolsToOpenAI(tools: ListToolsResult): Tool[] {
  return tools.tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

export function SessionConfiguration() {
  const {
    sessionConfig,
    setSessionConfig,
    autoUpdateSession,
    setAutoUpdateSession,
    mcpManager,
    prompts,
    setPrompts,
    realtimeConnection,
    baseUrl,
  } = useStore();

  const [voices, setVoices] = useState<string[]>([]);
  const [transcriptionModels, setTranscriptionModels] = useState<string[]>([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(false);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [isLoadingTranscriptionModels, setIsLoadingTranscriptionModels] =
    useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    realtimeConnection.sendEvent({
      type: "session.update",
      // @ts-expect-error
      session: sessionConfig,
    });
  };

  const handleChange = (field: keyof typeof sessionConfig, value: any) => {
    setSessionConfig({
      ...sessionConfig,
      [field]: value,
    });
  };

  const handlePromptDropdownClick = async () => {
    if (prompts.length === 0 && !isLoadingPrompts) {
      setIsLoadingPrompts(true);
      try {
        const result = await mcpManager.listPrompts();
        console.log("Prompts:", result);
        setPrompts(result.prompts);
      } catch (error) {
        console.error("Failed to fetch prompts:", error);
      } finally {
        setIsLoadingPrompts(false);
      }
    }
  };

  const handleVoiceDropdownClick = async () => {
    if (voices.length === 0 && !isLoadingVoices) {
      setIsLoadingVoices(true);
      try {
        const res = await fetch(`${baseUrl}/models?task=text-to-speech`);
        const data = await res.json();
        const models = data.data;
        const voiceNames = models
          .flatMap((model) => model.voices)
          .map((voice) => voice.name);
        setVoices(voiceNames);
      } catch (error) {
        console.error("Failed to fetch voices:", error);
      } finally {
        setIsLoadingVoices(false);
      }
    }
  };

  const handleTranscriptionModelDropdownClick = async () => {
    if (transcriptionModels.length === 0 && !isLoadingTranscriptionModels) {
      setIsLoadingTranscriptionModels(true);
      try {
        const res = await fetch(
          `${baseUrl}/models?task=automatic-speech-recognition`,
        );
        const data = await res.json();
        setTranscriptionModels(
          data.data.map((model: { id: string }) => model.id),
        );
      } catch (error) {
        console.error("Failed to fetch transcription models:", error);
      } finally {
        setIsLoadingTranscriptionModels(false);
      }
    }
  };

  useEffect(() => {
    mcpManager.onServerInitialized(async () => {
      const tools = await mcpManager.listTools();
      console.log("Available tools:", tools);
      const openaiTools = mcpToolsToOpenAI(tools);
      handleChange("tools", openaiTools);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="auto_update"
          checked={autoUpdateSession}
          onChange={(e) => setAutoUpdateSession(e.target.checked)}
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
            onClick={handlePromptDropdownClick}
            onChange={async (e) => {
              if (e.target.value) {
                const content = await mcpManager.getPrompt(e.target.value);
                if (content) {
                  handleChange("instructions", content);
                }
              }
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
          >
            <option value="">Select a prompt...</option>
            {isLoadingPrompts ? (
              <option disabled>Loading prompts...</option>
            ) : (
              prompts.map((prompt) => (
                <option key={prompt.name} value={prompt.name}>
                  {prompt.name}
                </option>
              ))
            )}
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
          onClick={handleVoiceDropdownClick}
          onChange={(e) => handleChange("voice", e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        >
          {isLoadingVoices ? (
            <option disabled>Loading voices...</option>
          ) : voices.length === 0 ? (
            <option disabled>Click to load voices</option>
          ) : (
            voices.map((voice) => (
              <option key={voice} value={voice}>
                {voice}
              </option>
            ))
          )}
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
                onClick={handleTranscriptionModelDropdownClick}
                onChange={(e) =>
                  handleChange("input_audio_transcription", {
                    ...sessionConfig.input_audio_transcription,
                    model: e.target.value,
                  })
                }
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
              >
                {isLoadingTranscriptionModels ? (
                  <option disabled>Loading transcription models...</option>
                ) : transcriptionModels.length === 0 ? (
                  <option disabled>Click to load transcription models</option>
                ) : (
                  transcriptionModels.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
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
                  handleChange(
                    "turn_detection",
                    DEFAULT_SESSION_CONFIG.turn_detection,
                  )
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
                value={
                  sessionConfig.turn_detection.threshold ??
                  DEFAULT_SESSION_CONFIG.turn_detection.threshold
                }
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
                value={
                  sessionConfig.turn_detection.silence_duration_ms ??
                  DEFAULT_SESSION_CONFIG.turn_detection.silence_duration_ms
                }
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
                  checked={
                    sessionConfig.turn_detection.create_response ??
                    DEFAULT_SESSION_CONFIG.turn_detection.create_response
                  }
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
          value={
            sessionConfig.temperature ?? DEFAULT_SESSION_CONFIG.temperature
          }
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
              // TODO: figure out a nicer way to handle "inf" value and possible NaN
              e.target.value === "inf"
                ? "inf"
                : parseInt(e.target.value)
                  ? parseInt(e.target.value)
                  : DEFAULT_SESSION_CONFIG.max_response_output_tokens,
            )
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
        />
      </div>

      <div className="flex gap-2 mt-4">
        <Button type="submit">Update Session Configuration</Button>
        <Button
          type="button"
          onClick={() => downloadJsonFile(sessionConfig, "session-config.json")}
        >
          Export Settings
        </Button>
      </div>
    </form>
  );
}
