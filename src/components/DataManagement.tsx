import { useState } from "react";
import useStore from "../store";
import { Conversation } from "./Conversation";

export function DataManagement() {
  const { conversationSessions } = useStore();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const conversationCount = conversationSessions.length;

  const handleDeleteAllConversations = async () => {
    if (showConfirmDialog) {
      setIsDeleting(true);

      try {
        // Get direct access to store methods
        const store = useStore.getState();

        // Clear events from the current view
        store.clearEvents();

        // Reset conversation - using the proper way to update state
        useStore.setState({ conversation: new Conversation() });

        // Clear current session ID
        store.setCurrentSessionId("");

        // Create a copy of the array to avoid modification during iteration
        const sessionsCopy = [...conversationSessions];

        // Delete all saved sessions
        sessionsCopy.forEach((session) => {
          store.deleteConversationSession(session.id);
        });
      } finally {
        setIsDeleting(false);
        setShowConfirmDialog(false);
      }
    } else {
      setShowConfirmDialog(true);
    }
  };

  const cancelDelete = () => {
    setShowConfirmDialog(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold mb-4">Data Management</h2>

      <div className="p-4 bg-gray-50 rounded-md border">
        <h3 className="text-lg font-medium mb-2">Conversation History</h3>
        <p className="text-gray-600 mb-4">
          You currently have {conversationCount} saved{" "}
          {conversationCount === 1 ? "conversation" : "conversations"}.
        </p>

        {showConfirmDialog ? (
          <div className="bg-red-50 p-4 rounded-md border border-red-200 mb-4">
            <p className="text-red-700 font-medium mb-2">Are you sure?</p>
            <p className="text-red-600 mb-4">
              This will permanently delete all {conversationCount}{" "}
              {conversationCount === 1 ? "conversation" : "conversations"}
              and cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={handleDeleteAllConversations}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Yes, delete all"}
              </button>
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleDeleteAllConversations}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600"
            disabled={conversationCount === 0}
          >
            Delete All Conversations
          </button>
        )}

        {conversationCount === 0 && !showConfirmDialog && (
          <p className="mt-2 text-sm text-gray-500">
            You don't have any saved conversations.
          </p>
        )}
      </div>
    </div>
  );
}
