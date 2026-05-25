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
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
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
      console.error('Error fetching conversations:', err);
    }
  };

  // Fetch conversations on load
  useEffect(() => {
    fetchConversations();
  }, [token]);

  const handleDelete = async (id) => {
    const confirmDelete = window.confirm('Are you sure you want to delete this chat?');
    if (!confirmDelete) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      await fetch(`${backendUrl}/api/chat/conversations/${id}`, {
        method: 'DELETE',
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
      console.error('Error deleting conversation', err);
    }
  };

  const handleRename = async (id, newTitle) => {
    if (!newTitle.trim()) return;

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      await fetch(`${backendUrl}/api/chat/conversations/${id}/rename`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTitle }),
      });
      fetchConversations();
    } catch (err) {
      console.error('Error renaming conversation', err);
    }
  };

  const handlePin = async (id, currentState) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      await fetch(`${backendUrl}/api/chat/conversations/${id}/pin`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_pinned: !currentState }),
      });
      fetchConversations();
    } catch (err) {
      console.error('Error pinning conversation', err);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Travel search state
  const [location, setLocation] = useState('');
  const [guests, setGuests] = useState('2');
  const [priceRange, setPriceRange] = useState('all');

  const filteredConversations = conversations.filter((conv) =>
    conv.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupByDate = (conversationsList) => {
    const groups = {
      Today: [],
      'Last 7 Days': [],
      Older: [],
    };
    const now = new Date();

    conversationsList.forEach((conv) => {
      const created = new Date(conv.created_at || Date.now());
      const diff = (now - created) / (1000 * 60 * 60 * 24);

      if (diff < 1) groups.Today.push(conv);
      else if (diff < 7) groups['Last 7 Days'].push(conv);
      else groups.Older.push(conv);
    });

    return groups;
  };

  const unpinnedConversations = filteredConversations.filter((c) => !c.is_pinned);
  const pinnedConversations = filteredConversations.filter((c) => c.is_pinned);
  const grouped = groupByDate(unpinnedConversations);

  const renderConversation = (conv) => (
    <div
      key={conv.id}
      className={`history-item ${conversationId === conv.id ? 'active' : ''}`}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
      }}
    >
      {editingId === conv.id ? (
        <input
          type="text"
          className="history-item-edit"
          value={editingTitle}
          onChange={(e) => setEditingTitle(e.target.value)}
          onBlur={() => {
            handleRename(conv.id, editingTitle);
            setEditingId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleRename(conv.id, editingTitle);
              setEditingId(null);
            } else if (e.key === 'Escape') {
              setEditingId(null);
            }
          }}
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          onClick={() => loadMessages(conv.id)}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            cursor: 'pointer',
          }}
          title={conv.title || 'New Chat'}
        >
          💬 {conv.title || 'New Chat'}
        </span>
      )}

      <div className="history-item-actions" style={{ display: 'flex', gap: '8px', marginLeft: '8px' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setEditingId(conv.id);
            setEditingTitle(conv.title || '');
          }}
          className="history-action-btn"
          title="Rename"
        >
          ✏️
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePin(conv.id, conv.is_pinned);
          }}
          className="history-action-btn"
          title={conv.is_pinned ? 'Unpin' : 'Pin'}
        >
          {conv.is_pinned ? '📌' : '📍'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(conv.id);
          }}
          className="history-action-btn delete"
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
      const res = await fetch(`${backendUrl}/api/chat/messages/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        const formatted = data.data.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));
        setMessages(formatted);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
      setError('Failed to load conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setInput('');
  };

  const handleSearch = () => {
    if (!location.trim()) {
      alert('Please enter a destination');
      return;
    }

    const searchMessage = `I want to book a trip to ${location} for ${guests} ${
      guests === '1' ? 'person' : 'people'
    } from ${startDate || 'flexible dates'} to ${endDate || 'flexible dates'}${
      priceRange !== 'all' ? ` with a ${priceRange} budget` : ''
    }. Can you suggest some packages?`;
    handleQuickSend(searchMessage, true);
    setLocation('');
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

    const userMessage = { role: 'user', content: messageContent };
    setMessages((prev) => [...prev, userMessage]);

    setInput('');
    setLoading(true);
    setError(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const response = await fetch(`${backendUrl}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
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

      if (!conversationId && data?.data?.conversationId) {
        const res = await fetch(`${backendUrl}/api/chat/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cData = await res.json();
        if (cData.success) {
          setConversations(cData.data);
        }
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data?.data?.reply || 'I can help with that destination!' },
      ]);
    } catch (err) {
      console.warn('Backend failed, using mock response', err);
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `That sounds like a great trip! I can help you plan a package for ${messageContent}. Could you tell me how many people are traveling and your preferred travel dates?`,
          },
        ]);
        setLoading(false);
      }, 1000);
      return;
    }

    setLoading(false);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="app-logo">✈️ Travel AI</h2>
          <button className="new-chat-btn" onClick={handleNewChat}>
            + New Chat
          </button>
        </div>
        <div className="history-list" style={{ padding: '0 10px' }}>
          <input
            placeholder="Search chats..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '8px',
              marginBottom: '10px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-secondary)',
              color: 'var(--text-main)',
            }}
          />

          {pinnedConversations.length > 0 && (
            <div style={{ marginBottom: '15px' }}>
              <h4 style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '5px', paddingLeft: '10px' }}>
                📌 Pinned
              </h4>
              {pinnedConversations.map(renderConversation)}
            </div>
          )}

          {Object.entries(grouped).map(
            ([group, convs]) =>
              convs.length > 0 && (
                <div key={group} style={{ marginBottom: '15px' }}>
                  <h4
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginBottom: '5px',
                      paddingLeft: '10px',
                    }}
                  >
                    {group}
                  </h4>
                  {convs.map(renderConversation)}
                </div>
              )
          )}
        </div>
      </aside>

      <main className="main-content">
        <header className="chat-header">
          <div>
            <h1 className="header-title">✈️ AI Travel Assistant</h1>
            <p className="header-subtitle">Plan your perfect trip</p>
          </div>
          <div>
            <button className="logout-btn-header" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            ⚠️ {error}{' '}
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', float: 'right' }}
            >
              ✕
            </button>
          </div>
        )}

        <div className="travel-dates-section">
          <div className="date-group">
            <label className="date-label">Departure</label>
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
            <label className="date-label">Return</label>
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
              <span style={{ fontSize: '1.1rem' }}>🗓️</span> {duration} {duration === 1 ? 'day' : 'days'}
            </div>
          )}

          {startDate && endDate && duration === 0 && <div className="duration-badge error">⚠️ Invalid Dates</div>}
        </div>

        {messages.length === 0 && (
          <div className="travel-search-section empty-chat-layout">
            <div className="search-container">
              <div className="search-row">
                <div className="search-field">
                  <label className="search-label">Destination</label>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Where to?"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                </div>

                <div className="search-field">
                  <label className="search-label">Guests</label>
                  <select className="search-select" value={guests} onChange={(e) => setGuests(e.target.value)}>
                    <option value="1">1 Guest</option>
                    <option value="2">2 Guests</option>
                    <option value="3">3 Guests</option>
                    <option value="4">4 Guests</option>
                    <option value="5">5+ Guests</option>
                  </select>
                </div>

                <div className="search-field">
                  <label className="search-label">Budget</label>
                  <select className="search-select" value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
                    <option value="all">All Budgets</option>
                    <option value="budget">Budget</option>
                    <option value="standard">Standard</option>
                    <option value="premium">Premium</option>
                    <option value="luxury">Luxury</option>
                  </select>
                </div>
              </div>

              <button className="search-btn" onClick={handleSearch}>
                🔍 SEARCH TRIPS
              </button>
            </div>

            <div className="dashboard-section">
              <h3 className="dashboard-section-title">🌍 Popular Destinations</h3>
              <div className="destinations-grid">
                <div className="destination-card" onClick={() => setLocation('Goa')}>
                  <div className="destination-image goa"></div>
                  <h3 className="destination-name">Goa</h3>
                  <p className="destination-desc">Beaches & Nightlife</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Bali')}>
                  <div className="destination-image bali"></div>
                  <h3 className="destination-name">Bali</h3>
                  <p className="destination-desc">Island Paradise</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Dubai')}>
                  <div className="destination-image dubai"></div>
                  <h3 className="destination-name">Dubai</h3>
                  <p className="destination-desc">Luxury & Adventure</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Manali')}>
                  <div className="destination-image manali"></div>
                  <h3 className="destination-name">Manali</h3>
                  <p className="destination-desc">Mountains & Snow</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Kerala')}>
                  <div className="destination-image kerala"></div>
                  <h3 className="destination-name">Kerala</h3>
                  <p className="destination-desc">Backwaters & Nature</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Jaipur')}>
                  <div className="destination-image jaipur"></div>
                  <h3 className="destination-name">Jaipur</h3>
                  <p className="destination-desc">Heritage & Culture</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Singapore')}>
                  <div className="destination-image singapore"></div>
                  <h3 className="destination-name">Singapore</h3>
                  <p className="destination-desc">City Lights & Family Fun</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Paris')}>
                  <div className="destination-image paris"></div>
                  <h3 className="destination-name">Paris</h3>
                  <p className="destination-desc">Romance & Art</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Maldives')}>
                  <div className="destination-image maldives"></div>
                  <h3 className="destination-name">Maldives</h3>
                  <p className="destination-desc">Beaches & Water Villas</p>
                </div>

                <div className="destination-card" onClick={() => setLocation('Tokyo')}>
                  <div className="destination-image tokyo"></div>
                  <h3 className="destination-name">Tokyo</h3>
                  <p className="destination-desc">Culture & Neon Streets</p>
                </div>
              </div>
            </div>

            <div className="dashboard-section">
              <h3 className="dashboard-section-title">🎯 Travel Style</h3>
              <div className="pills-container">
                <button className="pill-btn" onClick={() => handleQuickSend('Budget travel options', true)}>
                  💰 Budget
                </button>
                <button className="pill-btn" onClick={() => handleQuickSend('Luxury travel options', true)}>
                  👑 Luxury
                </button>
                <button className="pill-btn" onClick={() => handleQuickSend('Adventure travel options', true)}>
                  ⛰️ Adventure
                </button>
              </div>
            </div>

            <div className="dashboard-section">
              <h3 className="dashboard-section-title">✨ Trip Type</h3>
              <div className="pills-container">
                <button className="pill-btn" onClick={() => handleQuickSend('Planning a family trip', true)}>
                  👨‍👩‍👧‍👦 Family Trip
                </button>
                <button className="pill-btn" onClick={() => handleQuickSend('Planning a birthday trip', true)}>
                  🎂 Birthday Trip
                </button>
                <button className="pill-btn" onClick={() => handleQuickSend('Trip with friends', true)}>
                  👫 Trip with Friends
                </button>
                <button className="pill-btn" onClick={() => handleQuickSend('Corporate travel options', true)}>
                  💼 Corporate Trip
                </button>
              </div>
            </div>
          </div>
        )}

        {(messages.length > 0 || loading) && (
          <div className="chat-window">
            {messages.map((msg, index) => (
              <div key={index} className={`message-row ${msg.role}`}>
                <div className="message-bubble">{msg.content}</div>
              </div>
            ))}

            {loading && (
              <div className="message-row ai">
                <div className="typing-indicator">
                  AI is typing... <span className="dot"></span>
                  <span className="dot"></span>
                  <span className="dot"></span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}

        <div className="input-area">
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
