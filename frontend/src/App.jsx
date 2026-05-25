import { useState, useEffect, useRef } from 'react';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [email, setEmail] = useState(''); // Would come from auth system normally
  
  // Sidebar state
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);

  // Travel dates state
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [duration, setDuration] = useState(0);
  
  const messagesEndRef = useRef(null);

  // Auto calculate duration
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end - start;
      const days = diffTime / (1000 * 60 * 60 * 24);
      setDuration(days > 0 ? days : 0);
    } else {
      setDuration(0);
    }
  }, [startDate, endDate]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchConversations = async () => {
    if (!token) return;
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/chat/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setConversations(data.data);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    }
  };

  // Fetch conversations on load
  useEffect(() => {
    fetchConversations();
  }, [token]);

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this chat?");
    if (!confirmDelete) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      await fetch(`${backendUrl}/api/chat/conversations/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      fetchConversations();
      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error("Error deleting conversation", err);
    }
  };

  const handlePin = async (id, currentState) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      await fetch(`${backendUrl}/api/chat/conversations/${id}/pin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_pinned: !currentState }),
      });
      fetchConversations();
    } catch (err) {
      console.error("Error pinning conversation", err);
    }
  };

  const [searchTerm, setSearchTerm] = useState("");

  const filteredConversations = conversations.filter((conv) =>
    conv.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupByDate = (conversationsList) => {
    const groups = {
      Today: [],
      "Last 7 Days": [],
      Older: [],
    };
    const now = new Date();

    conversationsList.forEach((conv) => {
      const created = new Date(conv.created_at || Date.now());
      const diff = (now - created) / (1000 * 60 * 60 * 24);

      if (diff < 1) groups.Today.push(conv);
      else if (diff < 7) groups["Last 7 Days"].push(conv);
      else groups.Older.push(conv);
    });

    return groups;
  };

  const unpinnedConversations = filteredConversations.filter(c => !c.is_pinned);
  const pinnedConversations = filteredConversations.filter(c => c.is_pinned);
  const grouped = groupByDate(unpinnedConversations);

  const renderConversation = (conv) => (
    <div 
      key={conv.id} 
      className={`history-item ${conversationId === conv.id ? 'active' : ''}`}
      onClick={() => loadMessages(conv.id)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        💬 {conv.title || "New Chat"}
      </span>

      <div className="history-item-actions" style={{ display: "flex", gap: "5px" }}>
        <button 
          onClick={(e) => { e.stopPropagation(); handlePin(conv.id, conv.is_pinned); }} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
          title={conv.is_pinned ? "Unpin" : "Pin"}
        >
          {conv.is_pinned ? "📌" : "📍"}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); handleDelete(conv.id); }} 
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}
          title="Delete"
        >
          🗑️
        </button>
      </div>
    </div>
  );

  // Load messages when conversation is clicked
  const loadMessages = async (id) => {
    setConversationId(id);
    setLoading(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(
        `${backendUrl}/api/chat/messages/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await res.json();
      if (data.success) {
        const formatted = data.data.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
      setError("Failed to load conversation");
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setMessages([]);
    setConversationId(null);
    setEmail('');
  };

  const handleQuickSend = (text, autoSubmit = false) => {
    setInput(text);
    if (autoSubmit) {
      sendMessage(null, text);
    }
  };

  const sendMessage = async (e, directText = null) => {
    if (e) e.preventDefault();
    
    const messageContent = directText !== null ? directText : input;
    if (!messageContent.trim()) return;

    // Add user message
    const userMessage = { role: 'user', content: messageContent };
    setMessages(prev => [...prev, userMessage]);
    
    setInput('');
    setLoading(true);
    setError(null);

    // MOCK RESPONSE LOGIC (Replace this with explicit backend call)
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`, // Remove if bypassing auth for dev
        },
        body: JSON.stringify({
          message: messageContent,
          conversationId,
          startDate: startDate || null,
          endDate: endDate || null,
          duration: duration || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send message');
      }

      setConversationId(data?.data?.conversationId || conversationId);
      
      // OPTIONAL: Refresh sidebar conversations so it shows up if it's new
      if (!conversationId && data?.data?.conversationId) {
        const res = await fetch(`${backendUrl}/api/chat/conversations`, {
           headers: { Authorization: `Bearer ${token}` }
        });
        const cData = await res.json();
        if (cData.success) {
          setConversations(cData.data);
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: data?.data?.reply || "I can help with that destination!" }]);
    } catch (err) {
      console.warn("Backend failed, using mock response", err);
      // Fallback mock response for UI demonstration
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'assistant', content: `That sounds like a great trip! I can help you plan a package for ${messageContent}. Could you tell me how many people are traveling and your preferred travel dates?` }]);
        setLoading(false);
      }, 1000);
      return;
    }

    setLoading(false);
  };

  return (
    <div className="app-container">
      {/* 1. Sidebar (Bonus Feature) */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="app-logo">✈️ Travel AI</h2>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>
        <div className="history-list" style={{ padding: "0 10px" }}>
          <input
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "8px",
              borderRadius: "8px",
              marginBottom: "10px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-secondary)",
              color: "var(--text-main)"
            }}
          />

          {pinnedConversations.length > 0 && (
            <div style={{ marginBottom: "15px" }}>
              <h4 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "5px", paddingLeft: "10px" }}>📌 Pinned</h4>
              {pinnedConversations.map(renderConversation)}
            </div>
          )}

          {Object.entries(grouped).map(([group, convs]) => (
            convs.length > 0 && (
              <div key={group} style={{ marginBottom: "15px" }}>
                <h4 style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "5px", paddingLeft: "10px" }}>{group}</h4>
                {convs.map(renderConversation)}
              </div>
            )
          ))}
        </div>
      </aside>

      {/* 2. Main Chat Area */}
      <main className="main-content">
        
        {/* Header */}
        <header className="chat-header">
          <div>
            <h1 className="header-title">✈️ AI Travel Assistant</h1>
            <p className="header-subtitle">Plan your perfect trip</p>
          </div>
          <div>
            <button className="logout-btn-header" onClick={handleLogout}>Log Out</button>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            ⚠️ {error} <button onClick={() => setError(null)} style={{background: 'none', border:'none', cursor:'pointer', float:'right'}}>✕</button>
          </div>
        )}

        {/* Chat Window */}
        <div className="chat-window">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">👋</div>
              <h2 className="empty-title">Welcome to AI Travel Assistant</h2>
              <p className="empty-subtitle">Ask me about trips, destinations, or bookings.</p>
              
              <div className="discovery-sections">
                <div className="discovery-section">
                  <h3 className="section-heading">🌍 Popular Destinations</h3>
                  <div className="discovery-grid">
                    <button className="discovery-btn" onClick={() => handleQuickSend("Tell me about Goa packages", true)}>🌴 Goa</button>
                    <button className="discovery-btn" onClick={() => handleQuickSend("Tell me about Manali packages", true)}>🏔️ Manali</button>
                    <button className="discovery-btn" onClick={() => handleQuickSend("Tell me about Bali packages", true)}>⛩️ Bali</button>
                    <button className="discovery-btn" onClick={() => handleQuickSend("Tell me about Dubai packages", true)}>🏙️ Dubai</button>
                  </div>
                </div>

                <div className="discovery-section">
                  <h3 className="section-heading">🎯 Travel Categories</h3>
                  <div className="discovery-grid">
                    <button className="discovery-btn category" onClick={() => handleQuickSend("Budget travel options", true)}>💰 Budget</button>
                    <button className="discovery-btn category" onClick={() => handleQuickSend("Luxury travel options", true)}>👑 Luxury</button>
                    <button className="discovery-btn category" onClick={() => handleQuickSend("Adventure travel options", true)}>⛰️ Adventure</button>
                  </div>
                </div>

                <div className="discovery-section">
                  <h3 className="section-heading">⚡ Quick Suggestions</h3>
                  <div className="discovery-grid">
                    <button className="discovery-btn suggestion" onClick={() => handleQuickSend("Goa trip packages", true)}>Goa trip packages</button>
                    <button className="discovery-btn suggestion" onClick={() => handleQuickSend("Planning a family trip", true)}>Planning a family trip</button>
                    <button className="discovery-btn suggestion" onClick={() => handleQuickSend("Planning a birthday trip", true)}>Planning a birthday trip</button>
                    <button className="discovery-btn suggestion" onClick={() => handleQuickSend("Corporate travel options", true)}>Corporate travel options</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`message-row ${msg.role}`}>
              <div className="message-bubble">
                {msg.content}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {loading && (
            <div className="message-row ai">
              <div className="typing-indicator">
                AI is typing... <span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Lead Capture/Input Area */}
        <div className="input-area">
          
          <div className="travel-dates-widget">
            <div className="date-group">
              <span className="date-label">Departure</span>
              <input
                type="date"
                className="date-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Select departure date"
              />
            </div>

            <div className="date-separator">→</div>

            <div className="date-group">
              <span className="date-label">Return</span>
              <input
                type="date"
                className="date-input"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                title="Select return date"
              />
            </div>

            {duration > 0 && (
              <div className="duration-badge">
                <span style={{ fontSize: "1.1rem" }}>🗓️</span> {duration} {duration === 1 ? "day" : "days"}
              </div>
            )}
            
            {startDate && endDate && duration === 0 && (
              <div className="duration-badge error">
                ⚠️ Invalid Dates
              </div>
            )}
          </div>

          <form className="input-form" onSubmit={(e) => sendMessage(e)}>
            <input
              type="text"
              className="chat-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about destinations, packages, or trips..."
              disabled={loading}
            />
            <button type="submit" className="send-btn" disabled={loading || !input.trim()}>
              ➤
            </button>
          </form>

        </div>
      </main>
    </div>
  );
}

export default App;
