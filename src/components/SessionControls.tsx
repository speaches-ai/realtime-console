import { useEffect, useState } from "react";
import { CloudLightning, CloudOff, MessageSquare } from "react-feather";
import Button from "./Button";
import useStore from "../store";

function SessionStopped() {
  const {
    startSession,
    audioDevices,
    setAudioDevices,
    selectedMicrophone,
    setSelectedMicrophone,
    events,
    conversation,
  } = useStore();
  const [isActivating, setIsActivating] = useState(false);

  // Check if this is a conversation that has already ended
  const hasExistingContent = events.length > 0 || conversation.items.size > 0;

  useEffect(() => {
    async function getAudioDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(
          (device) => device.kind === "audioinput",
        );
        setAudioDevices(audioInputs);

        // Check if previously selected device is still available
        if (
          selectedMicrophone &&
          audioInputs.some((device) => device.deviceId === selectedMicrophone)
        ) {
          setSelectedMicrophone(selectedMicrophone);
        } else if (audioInputs.length > 0) {
          setSelectedMicrophone(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error getting audio devices:", err);
      }
    }

    getAudioDevices();
  }, [selectedMicrophone, setAudioDevices, setSelectedMicrophone]);

  async function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    await startSession(selectedMicrophone);
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-4">
      {hasExistingContent ? (
        <div className="text-center">
          <div className="mb-2 text-gray-600">
            This conversation has already ended.
          </div>
          <div className="text-sm text-gray-500">
            Create a new conversation (⌘/Ctrl+Shift+O) to start a new session.
          </div>
        </div>
      ) : (
        <>
          <Button
            onClick={handleStartSession}
            className={isActivating ? "bg-gray-600" : "bg-red-600"}
            icon={<CloudLightning height={16} />}
          >
            {isActivating ? "starting session..." : "start session"}
          </Button>
          <select
            value={selectedMicrophone}
            onChange={(e) => {
              setSelectedMicrophone(e.target.value);
            }}
            className="border border-gray-200 rounded-md p-2 max-w-[300px] text-ellipsis"
          >
            {audioDevices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );
}

function SessionActive() {
  const { stopSession, sendTextMessage } = useStore();
  const [message, setMessage] = useState("");

  function handleSendClientEvent() {
    sendTextMessage(message);
    setMessage("");
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-4">
      <input
        onKeyDown={(e) => {
          if (e.key === "Enter" && message.trim()) {
            handleSendClientEvent();
          }
        }}
        type="text"
        placeholder="send a text message..."
        className="border border-gray-200 rounded-full p-4 flex-1"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <Button
        onClick={() => {
          if (message.trim()) {
            handleSendClientEvent();
          }
        }}
        icon={<MessageSquare height={16} />}
        className="bg-blue-400"
      >
        send text
      </Button>
      <Button onClick={stopSession} icon={<CloudOff height={16} />}>
        disconnect
      </Button>
    </div>
  );
}

export default function SessionControls() {
  const { isSessionActive } = useStore();

  return (
    <div className="flex gap-4 border-t-2 border-gray-200 h-full rounded-md">
      {isSessionActive ? <SessionActive /> : <SessionStopped />}
    </div>
  );
}
