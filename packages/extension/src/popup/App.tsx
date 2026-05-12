import React, { useEffect, useState } from 'react';
import type { AnalysisReport, UserSettings, ExtensionMessage } from '@shieldwall/shared';
import { DEFAULT_SETTINGS, EXTENSION } from '@shieldwall/shared';
import { ReportView } from './components/ReportView';
import { SettingsView } from './components/SettingsView';
import { HistoryView } from './components/HistoryView';

type View = 'home' | 'report' | 'settings' | 'history';

export function App() {
  const [view, setView] = useState<View>('home');
  const [pendingReport, setPendingReport] = useState<AnalysisReport | null>(null);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Check for pending analysis
    chrome.storage.local.get(`${EXTENSION.STORAGE_PREFIX}pending`, (result) => {
      const report = result[`${EXTENSION.STORAGE_PREFIX}pending`];
      if (report) {
        setPendingReport(report);
        setView('report');
      }
    });

    // Load settings
    const msg: ExtensionMessage = { type: 'GET_SETTINGS', payload: null };
    chrome.runtime.sendMessage(msg, (resp: UserSettings) => {
      if (resp) setSettings(resp);
    });
  }, []);

  const handleDecision = (approved: boolean) => {
    if (!pendingReport) return;

    const msg: ExtensionMessage = {
      type: 'USER_DECISION',
      payload: { reportId: pendingReport.id, decision: approved ? 'approve' : 'reject' },
    };
    chrome.runtime.sendMessage(msg);

    // Clear pending
    chrome.storage.local.remove(`${EXTENSION.STORAGE_PREFIX}pending`);
    setPendingReport(null);
    setView('home');
  };

  const handleSettingsUpdate = (partial: Partial<UserSettings>) => {
    const msg: ExtensionMessage = { type: 'UPDATE_SETTINGS', payload: partial };
    chrome.runtime.sendMessage(msg, (resp: UserSettings) => {
      if (resp) setSettings(resp);
    });
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="logo">🛡️</span>
          <h1 className="title">ShieldWall</h1>
        </div>
        <div className="header-right">
          <div className={`status-dot ${settings.enabled ? 'active' : 'inactive'}`} />
          <span className="status-text">{settings.enabled ? 'Active' : 'Off'}</span>
        </div>
      </header>

      {/* Navigation */}
      <nav className="nav">
        <button className={`nav-btn ${view === 'home' ? 'active' : ''}`} onClick={() => setView('home')}>
          🏠 Home
        </button>
        <button className={`nav-btn ${view === 'history' ? 'active' : ''}`} onClick={() => setView('history')}>
          📋 History
        </button>
        <button className={`nav-btn ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}>
          ⚙️ Settings
        </button>
      </nav>

      {/* Content */}
      <main className="content">
        {view === 'home' && (
          <div className="home">
            {pendingReport ? (
              <div className="pending-banner" onClick={() => setView('report')}>
                <span className="pending-icon">⚠️</span>
                <span>Transaction pending review</span>
                <span className="pending-arrow">→</span>
              </div>
            ) : (
              <div className="safe-banner">
                <span className="safe-icon">✅</span>
                <p>No pending transactions</p>
                <p className="safe-sub">ShieldWall is monitoring your wallet activity</p>
              </div>
            )}
          </div>
        )}

        {view === 'report' && pendingReport && (
          <ReportView report={pendingReport} onDecision={handleDecision} />
        )}

        {view === 'settings' && (
          <SettingsView settings={settings} onUpdate={handleSettingsUpdate} />
        )}

        {view === 'history' && <HistoryView />}
      </main>
    </div>
  );
}
