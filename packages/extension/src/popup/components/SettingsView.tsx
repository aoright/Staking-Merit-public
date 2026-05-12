import React from 'react';
import type { UserSettings } from '@shieldwall/shared';

interface Props {
  settings: UserSettings;
  onUpdate: (partial: Partial<UserSettings>) => void;
}

export function SettingsView({ settings, onUpdate }: Props) {
  return (
    <div>
      <div className="settings-group">
        <div className="settings-group-title">General</div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Enable ShieldWall</div>
            <div className="setting-desc">Intercept and analyze transactions</div>
          </div>
          <div
            className={`toggle ${settings.enabled ? 'on' : ''}`}
            onClick={() => onUpdate({ enabled: !settings.enabled })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Auto-approve safe</div>
            <div className="setting-desc">Skip review for known-safe contracts</div>
          </div>
          <div
            className={`toggle ${settings.autoApproveSafe ? 'on' : ''}`}
            onClick={() => onUpdate({ autoApproveSafe: !settings.autoApproveSafe })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Notifications</div>
            <div className="setting-desc">Show browser notifications</div>
          </div>
          <div
            className={`toggle ${settings.notifications ? 'on' : ''}`}
            onClick={() => onUpdate({ notifications: !settings.notifications })}
          />
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Analysis Engine</div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Transaction Simulation</div>
            <div className="setting-desc">Dry-run transactions before signing</div>
          </div>
          <div
            className={`toggle ${settings.simulationEnabled ? 'on' : ''}`}
            onClick={() => onUpdate({ simulationEnabled: !settings.simulationEnabled })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">AI Provider</div>
            <div className="setting-desc">LLM for semantic analysis</div>
          </div>
          <select
            className="select"
            value={settings.aiProvider}
            onChange={(e) => onUpdate({ aiProvider: e.target.value as UserSettings['aiProvider'] })}
          >
            <option value="openai">OpenAI</option>
            <option value="ollama">Ollama (Local)</option>
            <option value="none">Disabled</option>
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Auto-block threshold</div>
            <div className="setting-desc">Risk score ≥ this → auto-reject</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="range"
              min={50}
              max={100}
              value={settings.autoBlockThreshold}
              onChange={(e) => onUpdate({ autoBlockThreshold: parseInt(e.target.value) })}
              style={{ width: 80 }}
            />
            <span style={{ fontSize: 12, color: '#f85149', fontWeight: 600, minWidth: 24 }}>
              {settings.autoBlockThreshold}
            </span>
          </div>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">About</div>
        <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <div className="setting-label">ShieldWall v0.1.0</div>
          <div className="setting-desc">
            Open source AI transaction firewall
            <br />
            <a href="https://github.com/shieldwall" target="_blank" rel="noopener" style={{ color: '#58a6ff' }}>
              GitHub
            </a>
            {' · '}
            <a href="https://shieldwall.dev" target="_blank" rel="noopener" style={{ color: '#58a6ff' }}>
              Website
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
