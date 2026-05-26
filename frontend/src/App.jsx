import { useEffect, useMemo, useRef, useState } from 'react';
import { DateRange } from 'react-date-range';
import { differenceInDays, format } from 'date-fns';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import './App.css';

function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auth state
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');

  // Navigation state
  const [view, setView] = useState('home');

  // Sidebar state
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // Travel search state
  const [location, setLocation] = useState('');
  const [guests, setGuests] = useState('2');
  const [priceRange, setPriceRange] = useState('all');

  // Calendar state
  const [showCalendar, setShowCalendar] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  const [range, setRange] = useState([
    {
      startDate: new Date(),
      endDate: new Date(),
      key: 'selection',
    },
  ]);

  const messagesEndRef = useRef(null);
  const calendarRef = useRef(null);

  const selectedRange = range[0];
  const nights = Math.max(0, differenceInDays(selectedRange.endDate, selectedRange.startDate));
  const startDate = format(selectedRange.startDate, 'yyyy-MM-dd');
  const endDate = format(selectedRange.endDate, 'yyyy-MM-dd');
  const dateLabel = `${format(selectedRange.startDate, 'dd MMM')} -> ${format(selectedRange.endDate, 'dd MMM')}`;

  const filteredConversations = useMemo(
    () =>
      conversations.filter((conv) => conv.title?.toLowerCase().includes(searchTerm.toLowerCase())),
    [conversations, searchTerm]
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

  const unpinnedConversations = filteredConversations.filter((conv) => !conv.is_pinned);
  const pinnedConversations = filteredConversations.filter((conv) => conv.is_pinned);
  const groupedConversations = groupByDate(unpinnedConversations);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (calendarRef.current && !calendarRef.current.contains(event.target)) {
        setShowCalendar(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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

      await fetchConversations();

      if (conversationId === id) {
        setConversationId(null);
        setMessages([]);
        setView('home');
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

      await fetchConversations();
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

      await fetchConversations();
    } catch (err) {
      console.error('Error pinning conversation', err);
    }
  };

  const loadMessages = async (id) => {
    setConversationId(id);
    setView('chat');
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
    setView('home');
    setError(null);
  };

  const handleSearch = () => {
    if (!location.trim()) {
      alert('Please enter a destination');
      return;
    }

    const searchMessage = `I want to book a trip to ${location} for ${guests} ${
      guests === '1' ? 'person' : 'people'
    } from ${startDate} to ${endDate}${priceRange !== 'all' ? ` with a ${priceRange} budget` : ''}. Can you suggest some packages?`;

    setShowCalendar(false);
    handleQuickSend(searchMessage, true);
    setLocation('');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setUser(null);
    setMessages([]);
    setConversationId(null);
    setEmail('');
    setView('home');
  };

  const handleLogin = async (loginEmail, password) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password }),
      });

      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user || { email: loginEmail });
        setEmail(loginEmail);
        setError(null);
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError(`Login error: ${err.message}`);
      console.error('Login error:', err);
    }
  };

  const handleSignup = async (signupEmail, password) => {
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: signupEmail, password }),
      });

      const data = await res.json();

      if (data.success && data.token) {
        localStorage.setItem('token', data.token);
        setToken(data.token);
        setUser(data.user || { email: signupEmail });
        setEmail(signupEmail);
        setError(null);
      } else if (data.success) {
        setError(null);
        await handleLogin(signupEmail, password);
      } else {
        setError(data.error || 'Signup failed');
      }
    } catch (err) {
      setError(`Signup error: ${err.message}`);
      console.error('Signup error:', err);
    }
  };

  const handleQuickSend = (text, autoSubmit = false) => {
    setInput(text);
    setView('chat');
    if (autoSubmit) {
      sendMessage(null, text);
    }
  };

  const sendMessage = async (event, directText = null) => {
    if (event) event.preventDefault();

    const messageContent = directText !== null ? directText : input;
    if (!messageContent.trim()) return;

    setView('chat');

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
          startDate,
          endDate,
          duration: nights || null,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Failed to send message');
      }

      const nextConversationId = data?.data?.conversationId || conversationId;
      setConversationId(nextConversationId);

      if (!conversationId && data?.data?.conversationId) {
        await fetchConversations();
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
          Chat {conv.title || 'New Chat'}
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
          Edit
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePin(conv.id, conv.is_pinned);
          }}
          className="history-action-btn"
          title={conv.is_pinned ? 'Unpin' : 'Pin'}
        >
          {conv.is_pinned ? 'Pin' : 'Keep'}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(conv.id);
          }}
          className="history-action-btn delete"
          title="Delete"
        >
          Del
        </button>
      </div>
    </div>
  );

  const DatePickerBar = (
    <div className="travel-dates-section">
      <div className="date-picker-shell" ref={calendarRef}>
        <button
          type="button"
          className="date-trigger"
          onClick={() => setShowCalendar((prev) => !prev)}
          aria-expanded={showCalendar}
        >
          <span className="date-trigger-label">Travel Dates</span>
          <span className="date-trigger-value">{dateLabel}</span>
          <span className="date-trigger-meta">{nights > 0 ? `${nights} Nights` : 'Select Dates'}</span>
        </button>

        {showCalendar && (
          <div className="calendar-popover">
            <DateRange
              ranges={range}
              onChange={(item) => setRange([item.selection])}
              months={isMobile ? 1 : 2}
              direction={isMobile ? 'vertical' : 'horizontal'}
              moveRangeOnFirstSelection={false}
              rangeColors={['#007bff']}
              minDate={new Date()}
            />
          </div>
        )}
      </div>

      <div className="date-summary-pills">
        <div className="date-summary-pill">
          <span className="summary-label">Departure</span>
          <span className="summary-value">{format(selectedRange.startDate, 'dd MMM yyyy')}</span>
        </div>
        <div className="date-summary-pill">
          <span className="summary-label">Return</span>
          <span className="summary-value">{format(selectedRange.endDate, 'dd MMM yyyy')}</span>
        </div>
        <div className={`duration-badge ${nights === 0 ? 'error' : ''}`}>
          {nights > 0 ? `${nights} Nights` : 'Pick return date'}
        </div>
      </div>
    </div>
  );

  const HomeUI = (
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
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
          Search Trips
        </button>
      </div>

      <div className="dashboard-section">
        <h3 className="dashboard-section-title">Popular Destinations</h3>
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
        <h3 className="dashboard-section-title">Travel Style</h3>
        <div className="pills-container">
          <button className="pill-btn" onClick={() => handleQuickSend('Budget travel options', true)}>
            Budget
          </button>
          <button className="pill-btn" onClick={() => handleQuickSend('Luxury travel options', true)}>
            Luxury
          </button>
          <button className="pill-btn" onClick={() => handleQuickSend('Adventure travel options', true)}>
            Adventure
          </button>
        </div>
      </div>

      <div className="dashboard-section">
        <h3 className="dashboard-section-title">Trip Type</h3>
        <div className="pills-container">
          <button className="pill-btn" onClick={() => handleQuickSend('Planning a family trip', true)}>
            Family Trip
          </button>
          <button className="pill-btn" onClick={() => handleQuickSend('Planning a birthday trip', true)}>
            Birthday Trip
          </button>
          <button className="pill-btn" onClick={() => handleQuickSend('Trip with friends', true)}>
            Trip with Friends
          </button>
          <button className="pill-btn" onClick={() => handleQuickSend('Corporate travel options', true)}>
            Corporate Trip
          </button>
        </div>
      </div>
    </div>
  );

  const ChatUI = (
    <div className="chat-window">
      {messages.length === 0 && !loading && (
        <div className="chat-empty-panel">
          <h3 className="chat-empty-title">Start your trip conversation</h3>
          <p className="chat-empty-subtitle">Ask anything about destinations, budgets, itineraries, or packages.</p>
        </div>
      )}

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
  );

  const AuthPage = () => {
    const [authEmail, setAuthEmail] = useState('');
    const [authPassword, setAuthPassword] = useState('');
    const [isSignup, setIsSignup] = useState(false);
    const [authError, setAuthError] = useState('');

    const handleAuthSubmit = async (event) => {
      event.preventDefault();
      setAuthError('');

      if (!authEmail || !authPassword) {
        setAuthError('Please enter email and password');
        return;
      }

      if (isSignup) {
        await handleSignup(authEmail, authPassword);
      } else {
        await handleLogin(authEmail, authPassword);
      }
    };

    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-logo">Travel AI</h1>
            <p className="auth-subtitle">Your AI Travel Assistant</p>
          </div>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <div className="auth-form-group">
              <label className="auth-label">Email</label>
              <input
                type="email"
                className="auth-input"
                placeholder="your@email.com"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-form-group">
              <label className="auth-label">Password</label>
              <input
                type="password"
                className="auth-input"
                placeholder="********"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
              />
            </div>

            {authError && <div className="auth-error">{authError}</div>}
            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-btn">
              {isSignup ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="auth-toggle">
            <p className="auth-toggle-text">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}
              <button type="button" className="auth-toggle-btn" onClick={() => setIsSignup((prev) => !prev)}>
                {isSignup ? 'Sign In' : 'Sign Up'}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  };

  if (!token) {
    return <AuthPage />;
  }

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2 className="app-logo">Travel AI</h2>
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
                Pinned
              </h4>
              {pinnedConversations.map(renderConversation)}
            </div>
          )}

          {Object.entries(groupedConversations).map(
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
            <h1 className="header-title">AI Travel Assistant</h1>
            <p className="header-subtitle">
              {view === 'home' ? 'Explore ideas and build your next trip' : 'Continue your trip planning conversation'}
            </p>
          </div>

          <div className="header-actions">
            {view === 'chat' && (
              <button className="back-btn" onClick={() => setView('home')}>
                Back
              </button>
            )}
            <button className="logout-btn-header" onClick={handleLogout}>
              Log Out
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            {error}
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', float: 'right' }}
            >
              Close
            </button>
          </div>
        )}

        {DatePickerBar}

        {view === 'home' && HomeUI}
        {view === 'chat' && ChatUI}

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
              {'>'}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default App;
