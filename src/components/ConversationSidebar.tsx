import { useState, useRef } from 'react';
import { Menu, MoreVertical } from 'react-feather';
import useStore from '../store';

export function ConversationSidebar() {
  const { 
    conversationSessions, 
    currentSessionId, 
    setCurrentSessionId, 
    deleteConversationSession,
    updateConversationSession,
    addConversationSession
  } = useStore();
  
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Sort sessions by timestamp (newest first)
  const sortedSessions = [...conversationSessions].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  
  const handleDeleteSession = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    deleteConversationSession(sessionId);
    setMenuOpenId(null);
  };
  
  const handleRenameSession = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    // Find the session to get its current title
    const session = conversationSessions.find(s => s.id === sessionId);
    if (session) {
      setNewTitle(session.title);
      setEditingSessionId(sessionId);
      setMenuOpenId(null);
      
      // Focus the input after it's rendered
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 10);
    }
  };
  
  const handleSaveTitle = (event?: React.FormEvent) => {
    if (event) {
      event.preventDefault();
    }
    
    if (editingSessionId && newTitle.trim()) {
      updateConversationSession(editingSessionId, {
        title: newTitle.trim()
      });
      setEditingSessionId(null);
    }
  };
  
  const toggleMenu = (sessionId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setMenuOpenId(menuOpenId === sessionId ? null : sessionId);
  };
  
  const handleAddSession = () => {
    addConversationSession({});
  };
  
  return (
    <aside className="w-64 h-full overflow-y-auto border-r bg-gray-50 flex flex-col flex-shrink-0">
      <div className="p-3 border-b flex justify-between items-center">
        <h2 className="text-sm font-bold">Conversations</h2>
        <button
          onClick={handleAddSession}
          className="p-1 rounded-full hover:bg-gray-200"
          title="New conversation"
        >
          <Menu size={18} />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="p-4 text-gray-500 text-sm">No conversations yet</div>
        ) : (
          sortedSessions.map((session) => (
            <div
              key={session.id}
              onClick={() => setCurrentSessionId(session.id)}
              className={`
                p-3 border-b cursor-pointer relative
                hover:bg-gray-100 group
                ${currentSessionId === session.id ? 'bg-gray-200' : ''}
              `}
            >
              <div className="flex justify-between items-center">
                {editingSessionId === session.id ? (
                  <form onSubmit={handleSaveTitle} className="flex-1 mr-2">
                    <input
                      ref={inputRef}
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onBlur={handleSaveTitle}
                      className="w-full text-sm p-1 border rounded"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setEditingSessionId(null);
                        }
                      }}
                    />
                  </form>
                ) : (
                  <div className="truncate text-sm">
                    {session.title}
                  </div>
                )}
                
                {!editingSessionId && (
                  <button
                    onClick={(e) => toggleMenu(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-gray-200"
                  >
                    <MoreVertical size={16} />
                  </button>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {new Date(session.timestamp).toLocaleString()}
              </div>
              
              {/* Dropdown menu */}
              {menuOpenId === session.id && (
                <div className="absolute right-2 top-10 bg-white shadow-md rounded-md z-10">
                  <button
                    onClick={(e) => handleRenameSession(session.id, e)}
                    className="w-full text-left p-2 text-sm hover:bg-gray-100"
                  >
                    Rename
                  </button>
                  <button
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="w-full text-left p-2 text-sm hover:bg-gray-100 text-red-500 border-t"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}