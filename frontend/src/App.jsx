import React, { useState, useEffect } from 'react';
import { Send, Loader2, Plus, MessageSquare, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import './App.css';

export default function OllamaChat() {
  const [prompt, setPrompt] = useState('');
  const [chats, setChats] = useState([{ id: 1, title: 'New Chat', messages: [] }]);
  const [currentChatId, setCurrentChatId] = useState(1);
  const [loading, setLoading] = useState(false);
  const [currentBackend, setCurrentBackend] = useState('Connecting...');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [nextChatId, setNextChatId] = useState(2);
  const [ollamaStatus, setOllamaStatus] = useState({ ready: false, message: 'Checking status...' });

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  const currentChat = chats.find(chat => chat.id === currentChatId);
  const currentMessages = currentChat ? currentChat.messages : [];

  // Check Ollama status on mount and poll every 5 seconds
  useEffect(() => {
    let intervalId;
    
    const checkStatus = async () => {
      try {
        const response = await fetch(`${API_URL}/api/status`);
        const data = await response.json();
        setOllamaStatus(data);
        setCurrentBackend(data.instance_id || 'localhost');
        
        // Keep polling - don't stop
      } catch (error) {
        setOllamaStatus({
          ready: false,
          status: 'error',
          message: 'Cannot connect to backend. Please ensure Flask is running.'
        });
      }
    };
    
    // Check immediately on mount
    checkStatus();
    
    // Then poll every 5 seconds
    intervalId = setInterval(checkStatus, 5000);
    
    // Cleanup interval on unmount
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  // Allow sending if backend is connected, even if model isn't ready
  const canSend = ollamaStatus.status !== 'error';

  const createNewChat = () => {
    const newChat = {
      id: nextChatId,
      title: `Chat ${nextChatId}`,
      messages: []
    };
    setChats([...chats, newChat]);
    setCurrentChatId(nextChatId);
    setNextChatId(nextChatId + 1);
  };

  const deleteChat = (chatId) => {
    if (chats.length === 1) {
      // Don't delete the last chat, just clear its messages
      setChats([{ id: chatId, title: 'New Chat', messages: [] }]);
      return;
    }
    
    const newChats = chats.filter(chat => chat.id !== chatId);
    setChats(newChats);
    
    if (currentChatId === chatId) {
      setCurrentChatId(newChats[0].id);
    }
  };

  const updateChatTitle = (chatId, firstMessage) => {
    setChats(chats.map(chat => {
      if (chat.id === chatId && (chat.title.startsWith('Chat ') || chat.title === 'New Chat')) {
        const title = firstMessage.length > 30 
          ? firstMessage.substring(0, 30) + '...' 
          : firstMessage;
        return { ...chat, title };
      }
      return chat;
    }));
  };

  const findMyIP = async () => {
    try {
      const response = await fetch(`${API_URL}/api/whoami`);
      const data = await response.json();
      setCurrentBackend(data.instance_id || 'localhost');
      alert(`Your IP: ${data.your_ip}\nBackend Instance: ${data.instance_id || 'localhost'}`);
    } catch (error) {
      alert('Failed to get IP: ' + error.message);
    }
  };

  const sendMessage = async () => {
    if (!prompt.trim() || loading) return;

    const userMessage = { type: 'user', text: prompt };
    const currentPrompt = prompt;
    
    // Update chat with user message
    setChats(prevChats => prevChats.map(chat => {
      if (chat.id === currentChatId) {
        const updatedMessages = [...chat.messages, userMessage];
        if (chat.messages.length === 0) {
          setTimeout(() => updateChatTitle(currentChatId, currentPrompt), 0);
        }
        return { ...chat, messages: updatedMessages };
      }
      return chat;
    }));
    
    setPrompt('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: currentPrompt })
      });
      const data = await response.json();
      
      if (data.success) {
        setCurrentBackend(data.instance_id || 'localhost');
        const assistantMessage = {
          type: 'assistant',
          text: data.response,
          instance: data.instance_id
        };
        
        setChats(prevChats => prevChats.map(chat => {
          if (chat.id === currentChatId) {
            return { ...chat, messages: [...chat.messages, assistantMessage] };
          }
          return chat;
        }));
      } else {
        const errorMessage = { type: 'error', text: data.message };
        setChats(prevChats => prevChats.map(chat => {
          if (chat.id === currentChatId) {
            return { ...chat, messages: [...chat.messages, errorMessage] };
          }
          return chat;
        }));
      }
    } catch (error) {
      const errorMessage = { type: 'error', text: 'Failed to get response: ' + error.message };
      setChats(prevChats => prevChats.map(chat => {
        if (chat.id === currentChatId) {
          return { ...chat, messages: [...chat.messages, errorMessage] };
        }
        return chat;
      }));
    }
    setLoading(false);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <button onClick={createNewChat} className="btn-new-chat">
            <Plus size={20} />
            {!sidebarCollapsed && <span>New Chat</span>}
          </button>
        </div>
        
        {!sidebarCollapsed && (
          <div className="chat-list">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`chat-item ${chat.id === currentChatId ? 'active' : ''}`}
                onClick={() => setCurrentChatId(chat.id)}
              >
                <MessageSquare size={18} />
                <span className="chat-title">{chat.title}</span>
                <button
                  className="btn-delete-chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <button
          className="btn-collapse"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="header">
          <div>
            <h1 className="title">Ollama Chat</h1>
            <p className="subtitle">
              Backend: <span className="backend-id">{currentBackend}</span>
            </p>
          </div>
          <button onClick={findMyIP} className="btn-ip">
            Find My IP
          </button>
        </div>

        <div className="chat-container">
          <div className="messages-container">
            {!ollamaStatus.ready ? (
              <div className="empty-state">
                <Loader2 size={48} className="icon-spin" />
                <p>{ollamaStatus.message}</p>
                <p className="status-subtext">
                  {ollamaStatus.status === 'loading_model' && 'You can send a message now - it will process once ready'}
                  {ollamaStatus.status === 'starting' && 'Ollama service is starting...'}
                  {ollamaStatus.status === 'initializing' && 'Setting up the environment...'}
                  {ollamaStatus.status === 'error' && 'Check that Flask is running on port 5000'}
                </p>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="empty-state">
                <MessageSquare size={48} />
                <p>Start a conversation</p>
              </div>
            ) : (
              <div className="messages">
                {currentMessages.map((msg, idx) => (
                  <div key={idx} className="message-wrapper">
                    <div className={`message message-${msg.type}`}>
                      {msg.text}
                    </div>
                    {msg.instance && (
                      <div className="message-meta">Instance: {msg.instance}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="input-container">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading || !canSend}
              className="message-input"
              placeholder={!canSend ? 'Backend not available' : !ollamaStatus.ready ? 'Model loading... You can still send!' : "Type your message..."}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !prompt.trim() || !canSend}
              className="btn-send"
            >
              {loading ? <Loader2 className="icon-spin" size={20} /> : <Send size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
