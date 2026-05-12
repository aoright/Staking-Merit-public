import React, { useEffect, useState } from 'react';
import type { AnalysisReport } from '@shieldwall/shared';
import { EXTENSION } from '@shieldwall/shared';

interface HistoryEntry {
  report: AnalysisReport;
  action: string;
}

const riskEmoji: Record<string, string> = {
  safe: '✅', low: '🟢', medium: '🟡', high: '🟠', critical: '🔴',
};

export function HistoryView() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const key = `${EXTENSION.STORAGE_PREFIX}history`;
    chrome.storage.local.get(key, (result) => {
      setHistory(result[key] ?? []);
    });
  }, []);

  if (history.length === 0) {
    return (
      <div className="empty-state">
        <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
        <p>No transaction history yet</p>
        <p style={{ fontSize: 11, marginTop: 4 }}>Analyzed transactions will appear here</p>
      </div>
    );
  }

  return (
    <div>
      {history.map((entry, i) => {
        const r = entry.report;
        const time = new Date(r.timestamp).toLocaleString();
        const target = r.request.transaction?.to;
        const shortAddr = target ? `${target.slice(0, 6)}...${target.slice(-4)}` : 'Unknown';

        return (
          <div key={i} className="history-item">
            <span style={{ fontSize: 18 }}>{riskEmoji[r.riskLevel] ?? '⚪'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 12 }}>
                {r.decoded?.protocol ?? r.decoded?.name ?? r.request.method}
              </div>
              <div style={{ fontSize: 11, color: '#8b949e' }}>
                {shortAddr} · Score: {r.riskScore}
              </div>
              <div style={{ fontSize: 10, color: '#6e7681' }}>{time}</div>
            </div>
            <span className={`history-action ${entry.action}`}>
              {entry.action}
            </span>
          </div>
        );
      })}
    </div>
  );
}
