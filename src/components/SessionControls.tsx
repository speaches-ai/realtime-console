import { useEffect, useState } from "react";
import { CloudLightning, CloudOff, MessageSquare } from "react-feather";
import Button from "./Button";

function SessionStopped({
  startSession,
}: {
  startSession: (deviceId?: string) => Promise<void>;
}) {
  const [isActivating, setIsActivating] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>(() => {
    return localStorage.getItem("selected-microphone") || "";
  });

  useEffect(() => {
    async function getAudioDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setAudioDevices(audioInputs);
        
        // Check if previously selected device is still available
        const savedDevice = localStorage.getItem("selected-microphone");
        if (savedDevice && audioInputs.some(device => device.deviceId === savedDevice)) {
          setSelectedDevice(savedDevice);
        } else if (audioInputs.length > 0) {
          setSelectedDevice(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error getting audio devices:", err);
      }
    }
    
    getAudioDevices();
  }, []);

  async function handleStartSession() {
    if (isActivating) return;

    setIsActivating(true);
    await startSession(selectedDevice);
  }

  return (
    <div className="flex items-center justify-center w-full h-full gap-4">
      <Button
        onClick={handleStartSession}
        className={isActivating ? "bg-gray-600" : "bg-red-600"}
        icon={<CloudLightning height={16} />}
      >
        {isActivating ? "starting session..." : "start session"}
      </Button>
      <select 
        value={selectedDevice}
        onChange={(e) => {
          setSelectedDevice(e.target.value);
          localStorage.setItem("selected-microphone", e.target.value);
        }}
        className="border border-gray-200 rounded-md p-2 max-w-[300px] text-ellipsis"
      >
        {audioDevices.map(device => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label || `Microphone ${device.deviceId.slice(0, 8)}...`}
          </option>
        ))}
      </select>
    </div>
  );
}

function SessionActive({
  stopSession,
  sendTextMessage,
}: {
  stopSession: () => void;
  sendTextMessage: (message: string) => void;
}) {
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

export default function SessionControls({
  startSession,
  stopSession,
  sendTextMessage,
  isSessionActive,
}: {
  startSession: (deviceId?: string) => Promise<void>;
  stopSession: () => void;
  sendTextMessage: (content: string) => void;
  isSessionActive: boolean;
}) {
  return (
    <div className="flex gap-4 border-t-2 border-gray-200 h-full rounded-md">
      {isSessionActive ? (
        <SessionActive
          stopSession={stopSession}
          sendTextMessage={sendTextMessage}
        />
      ) : (
        <SessionStopped startSession={startSession} />
      )}
    </div>
  );
}
