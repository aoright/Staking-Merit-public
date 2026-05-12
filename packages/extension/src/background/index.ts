// ============================================
// ShieldWall — Background Service Worker
// ============================================
// The "brain" of the extension. Receives intercepted requests,
// runs the analysis pipeline, stores history, and manages the popup.

import type {
  ExtensionMessage,
  InterceptedRequest,
  AnalysisReport,
  UserSettings,
} from '@shieldwall/shared';
import { DEFAULT_SETTINGS, EXTENSION } from '@shieldwall/shared';
import { analyzePipeline, type PipelineConfig } from '@shieldwall/core';

// ---- State ----

let pendingAnalysis: Map<
  string,
  {
    report: AnalysisReport;
    resolve: (value: { approved: boolean; report: AnalysisReport }) => void;
  }
> = new Map();

// ---- Message Handler ----

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'INTERCEPTED_REQUEST') {
    handleInterceptedRequest(message.payload as InterceptedRequest, message.requestId!)
      .then(sendResponse)
      .catch((err) => {
        console.error('[ShieldWall BG] Analysis error:', err);
        sendResponse({ approved: false, error: err.message });
      });
    return true; // Will respond asynchronously
  }

  if (message.type === 'USER_DECISION') {
    const { reportId, decision } = message.payload as { reportId: string; decision: string };
    handleUserDecision(reportId, decision === 'approve');
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'GET_SETTINGS') {
    getSettings().then(sendResponse);
    return true;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    saveSettings(message.payload as Partial<UserSettings>).then(sendResponse);
    return true;
  }
});

// ---- Core Logic ----

async function handleInterceptedRequest(
  request: InterceptedRequest,
  requestId: string
): Promise<{ approved: boolean; report: AnalysisReport }> {
  const settings = await getSettings();

  // Check if ShieldWall is disabled
  if (!settings.enabled) {
    const dummyReport: AnalysisReport = {
      id: requestId,
      request,
      riskLevel: 'safe',
      riskScore: 0,
      analysisDurationMs: 0,
      timestamp: Date.now(),
    };
    return { approved: true, report: dummyReport };
  }

  // Check whitelist
  if (request.transaction?.to && settings.whitelist.includes(request.transaction.to.toLowerCase())) {
    const dummyReport: AnalysisReport = {
      id: requestId,
      request,
      riskLevel: 'safe',
      riskScore: 0,
      analysisDurationMs: 0,
      timestamp: Date.now(),
    };
    return { approved: true, report: dummyReport };
  }

  // Build pipeline config from user settings
  const pipelineConfig: PipelineConfig = {
    simulationEnabled: settings.simulationEnabled,
    aiEnabled: settings.aiProvider !== 'none',
    aiProvider: settings.aiProvider === 'none' ? undefined : settings.aiProvider,
    customRpcs: settings.customRpcs,
  };

  // Run the analysis pipeline
  const report = await analyzePipeline(request, pipelineConfig);

  // Auto-block if above threshold
  if (report.riskScore >= settings.autoBlockThreshold) {
    await saveToHistory(report, 'auto-blocked');
    showNotification(report, 'blocked');
    return { approved: false, report };
  }

  // Auto-approve if safe and setting enabled
  if (settings.autoApproveSafe && report.riskLevel === 'safe') {
    await saveToHistory(report, 'auto-approved');
    return { approved: true, report };
  }

  // Open popup for user decision
  return new Promise((resolve) => {
    pendingAnalysis.set(report.id, { report, resolve });

    // Store the pending report for the popup to read
    chrome.storage.local.set({
      [`${EXTENSION.STORAGE_PREFIX}pending`]: report,
    });

    // Open the popup or notify the user
    showNotification(report, 'pending');

    // Timeout: auto-reject if no response
    setTimeout(() => {
      if (pendingAnalysis.has(report.id)) {
        pendingAnalysis.delete(report.id);
        resolve({ approved: false, report });
      }
    }, EXTENSION.ANALYSIS_TIMEOUT);
  });
}

function handleUserDecision(reportId: string, approved: boolean) {
  const pending = pendingAnalysis.get(reportId);
  if (pending) {
    pendingAnalysis.delete(reportId);
    saveToHistory(pending.report, approved ? 'approved' : 'rejected');
    pending.resolve({ approved, report: pending.report });
  }
}

// ---- Settings Management ----

async function getSettings(): Promise<UserSettings> {
  const key = `${EXTENSION.STORAGE_PREFIX}settings`;
  const result = await chrome.storage.local.get(key);
  return { ...DEFAULT_SETTINGS, ...result[key] };
}

async function saveSettings(partial: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await chrome.storage.local.set({
    [`${EXTENSION.STORAGE_PREFIX}settings`]: updated,
  });
  return updated;
}

// ---- History ----

async function saveToHistory(report: AnalysisReport, action: string) {
  const key = `${EXTENSION.STORAGE_PREFIX}history`;
  const result = await chrome.storage.local.get(key);
  const history: Array<{ report: AnalysisReport; action: string }> = result[key] ?? [];

  history.unshift({ report, action });

  // Keep only the most recent entries
  if (history.length > EXTENSION.MAX_HISTORY) {
    history.length = EXTENSION.MAX_HISTORY;
  }

  await chrome.storage.local.set({ [key]: history });
}

// ---- Notifications ----

function showNotification(report: AnalysisReport, type: 'pending' | 'blocked') {
  const riskEmoji: Record<string, string> = {
    safe: '✅',
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
  };

  const emoji = riskEmoji[report.riskLevel] ?? '⚠️';
  const title =
    type === 'blocked'
      ? `${emoji} Transaction Auto-Blocked`
      : `${emoji} Transaction Needs Review`;

  chrome.notifications.create(report.id, {
    type: 'basic',
    iconUrl: 'icons/icon-128.png',
    title,
    message: report.aiAnalysis?.summary ?? `Risk Score: ${report.riskScore}/100`,
    priority: report.riskLevel === 'critical' ? 2 : 1,
  });
}

console.log('[ShieldWall] 🛡️ Background service worker started');
