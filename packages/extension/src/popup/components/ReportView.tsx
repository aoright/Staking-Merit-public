import React from 'react';
import type { AnalysisReport } from '@shieldwall/shared';

interface Props {
  report: AnalysisReport;
  onDecision: (approved: boolean) => void;
}

const riskEmoji: Record<string, string> = {
  safe: '✅', low: '🟢', medium: '🟡', high: '🟠', critical: '🔴',
};

const riskColor: Record<string, string> = {
  safe: '#3fb950', low: '#58a6ff', medium: '#d29922', high: '#db6d28', critical: '#f85149',
};

export function ReportView({ report, onDecision }: Props) {
  const color = riskColor[report.riskLevel] ?? '#8b949e';

  return (
    <div className="report">
      {/* Risk Score */}
      <div style={{ textAlign: 'center' }}>
        <div
          className="score-ring"
          style={{
            border: `3px solid ${color}`,
            color,
            boxShadow: `0 0 20px ${color}33`,
          }}
        >
          {report.riskScore}
        </div>
        <div style={{ marginTop: 8 }}>
          <span className={`risk-badge ${report.riskLevel}`}>
            {riskEmoji[report.riskLevel]} {report.riskLevel} risk
          </span>
        </div>
      </div>

      {/* AI Summary */}
      {report.aiAnalysis && (
        <div className="card">
          <div className="card-title">🧠 AI Analysis</div>
          <div className="card-body">{report.aiAnalysis.summary}</div>
          {report.aiAnalysis.steps.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 16, color: '#8b949e', fontSize: 12 }}>
              {report.aiAnalysis.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Decoded Function */}
      {report.decoded && (
        <div className="card">
          <div className="card-title">📝 Transaction</div>
          <div className="card-body">
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#bc8cff' }}>
              {report.decoded.protocol && (
                <span style={{ color: '#8b949e' }}>{report.decoded.protocol} → </span>
              )}
              {report.decoded.name}()
            </div>
            {report.decoded.params.map((param, i) => (
              <div key={i} style={{ fontSize: 11, color: '#8b949e', marginTop: 4 }}>
                <span style={{ color: '#58a6ff' }}>{param.name}</span>: {param.label ?? param.value}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Balance Changes */}
      {report.simulation && report.simulation.balanceChanges.length > 0 && (
        <div className="card">
          <div className="card-title">💰 Balance Changes</div>
          <div className="card-body">
            {report.simulation.balanceChanges.map((change, i) => (
              <div key={i} className="balance-change">
                <span>{change.symbol}</span>
                <span className={change.amount.startsWith('-') ? 'balance-out' : 'balance-in'}>
                  {change.amount.startsWith('-') ? '📤 ' : '📥 '}
                  {change.amount} {change.symbol}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Approval Changes */}
      {report.simulation && report.simulation.approvalChanges.length > 0 && (
        <div className="card">
          <div className="card-title">🔓 Approval Changes</div>
          <div className="card-body">
            {report.simulation.approvalChanges.map((change, i) => (
              <div key={i} className="balance-change">
                <span>
                  {change.isRevoke ? '🔒 Revoke' : '🔓 Approve'} {change.symbol}
                </span>
                <span style={{ color: change.newAllowance === 'unlimited' ? '#f85149' : '#8b949e', fontSize: 11 }}>
                  → {change.spenderLabel ?? `${change.spender.slice(0, 6)}...${change.spender.slice(-4)}`}
                  <br />
                  Amount: {change.newAllowance}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Risk Signals */}
      {report.contractRisk && report.contractRisk.signals.length > 0 && (
        <div className="card">
          <div className="card-title">⚠️ Risk Signals</div>
          <div className="card-body">
            {report.contractRisk.signals.map((signal, i) => (
              <div key={i} className="signal-item">
                <div className={`signal-dot ${signal.severity}`} />
                <div>
                  <div style={{ fontWeight: 500 }}>{signal.title}</div>
                  <div style={{ fontSize: 11, color: '#8b949e' }}>{signal.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gas Cost */}
      {report.simulation?.gasCostUsd !== undefined && (
        <div className="card">
          <div className="card-title">⛽ Estimated Gas</div>
          <div className="card-body">≈ ${report.simulation.gasCostUsd.toFixed(4)}</div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="actions">
        <button className="btn btn-reject" onClick={() => onDecision(false)}>
          ✋ Reject
        </button>
        <button className="btn btn-approve" onClick={() => onDecision(true)}>
          ✅ Approve
        </button>
      </div>
    </div>
  );
}
