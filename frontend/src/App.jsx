import { useState, useEffect } from 'react';
import ChatInterface from './components/ChatInterface';
import CampaignsPage from './pages/CampaignsPage';
import AnalyticsPage from './pages/AnalyticsPage';

export default function App() {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'dark';
  });

  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light');
    } else {
      document.body.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const handleNavigate = (path) => {
    if (path === '/') setActiveTab('dashboard');
    else if (path === '/campaigns') setActiveTab('campaigns');
    else if (path === '/analytics') setActiveTab('analytics');
    else setActiveTab(path);
  };

  return (
    <div className="app">
      {/* ── Header ──────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-logo">
          <a
            href="/"
            className="logo-link"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: 'inherit' }}
          >
            <div className="app-logo-icon">X</div>
            <span className="app-logo-text">Xeno CRM</span>
          </a>
        </div>
        
        <nav className="nav-links" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button 
            className={`nav-link ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Assistant
          </button>
          <button 
            className={`nav-link ${activeTab === 'campaigns' ? 'active' : ''}`}
            onClick={() => setActiveTab('campaigns')}
          >
            Campaigns
          </button>
          <button 
            className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>

          <button
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? (
              // Sun Icon
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
            ) : (
              // Moon Icon
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
            )}
          </button>
          
          <div className="app-status" style={{ marginLeft: '12px' }}>
            <span className="status-dot"></span>
            <span>System Online</span>
          </div>
        </nav>
      </header>

      {/* ── Main content area ───────────────────────────────── */}
      <main className="app-main">
        {activeTab === 'dashboard' && <ChatInterface />}
        {activeTab === 'campaigns' && <CampaignsPage onNavigate={handleNavigate} />}
        {activeTab === 'analytics' && <AnalyticsPage onNavigate={handleNavigate} />}
      </main>
    </div>
  );
}
