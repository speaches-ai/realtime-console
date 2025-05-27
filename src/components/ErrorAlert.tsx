import { useEffect } from 'react';
import { X } from 'react-feather';

interface ErrorAlertProps {
  message: string;
  onClose: () => void;
  duration?: number; // Auto-dismiss duration in ms (0 means don't auto-dismiss)
}

export function ErrorAlert({ message, onClose, duration = 5000 }: ErrorAlertProps) {
  // Auto-dismiss timer
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);
  
  // Format message as JSON if it looks like JSON
  const formatMessage = (msg: string) => {
    if (msg.startsWith('{') || msg.startsWith('[')) {
      try {
        const parsed = JSON.parse(msg);
        return (
          <pre className="overflow-auto max-h-60 bg-red-100 p-2 rounded text-xs">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        );
      } catch {
        // Not valid JSON, return as is
        return msg;
      }
    }
    return msg;
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md w-full bg-red-50 border border-red-300 rounded-md shadow-lg overflow-hidden">
      <div className="p-4 flex items-start">
        <div className="flex-1 overflow-hidden">
          <div className="font-bold text-red-700 mb-1">Error</div>
          <div className="text-sm text-red-600 break-words">
            {formatMessage(message)}
          </div>
        </div>
        <button 
          onClick={onClose}
          className="ml-4 p-1 text-red-500 hover:text-red-700 rounded-full hover:bg-red-100 flex-shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

interface ErrorAlertsProps {
  errors: string[];
  onDismiss: (index: number) => void;
}

export function ErrorAlerts({ errors, onDismiss }: ErrorAlertsProps) {
  if (errors.length === 0) return null;
  
  return (
    <>
      {errors.map((error, index) => (
        <ErrorAlert 
          key={index} 
          message={error} 
          onClose={() => onDismiss(index)} 
        />
      ))}
    </>
  );
}