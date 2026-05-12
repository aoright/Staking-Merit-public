// ============================================
// ShieldWall — Content Script
// ============================================
// Bridge between the injected page script and the background service worker.
// Runs in an isolated world with access to chrome.runtime messaging.

import { EXTENSION } from '@shieldwall/shared';
import type { ExtensionMessage, InterceptedRequest, InterceptedMethod, ChainId } from '@shieldwall/shared';

const CHANNEL = EXTENSION.CHANNEL_NAME;

// Inject the provider proxy script into the page
function injectScript() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.type = 'module';
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

injectScript();

/**
 * Listen for messages from the injected provider proxy.
 */
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  if (event.data?.channel !== CHANNEL) return;
  if (event.data?.direction !== 'from-page') return;

  const { requestId, method, params, origin, chainId } = event.data;

  // Build the intercepted request
  const interceptedRequest: InterceptedRequest = {
    id: requestId,
    method: method as InterceptedMethod,
    params: params ?? [],
    chainId: (chainId ?? 1) as ChainId,
    origin: origin ?? window.location.origin,
    timestamp: Date.now(),
  };

  // Extract transaction data if applicable
  if (
    method === 'eth_sendTransaction' ||
    method === 'eth_signTransaction'
  ) {
    interceptedRequest.transaction = params?.[0] ?? undefined;
  }

  // Extract typed data
  if (method === 'eth_signTypedData_v4' || method === 'eth_signTypedData_v3') {
    try {
      interceptedRequest.typedData =
        typeof params?.[1] === 'string' ? JSON.parse(params[1]) : params?.[1];
    } catch { /* ignore parse errors */ }
  }

  // Extract raw message for personal_sign
  if (method === 'personal_sign') {
    interceptedRequest.rawMessage = params?.[0] as string;
  }

  // Send to background service worker for analysis
  try {
    const message: ExtensionMessage<InterceptedRequest> = {
      type: 'INTERCEPTED_REQUEST',
      payload: interceptedRequest,
      requestId,
    };

    const response = await chrome.runtime.sendMessage(message);

    // Forward the decision back to the page
    window.postMessage(
      {
        channel: CHANNEL,
        direction: 'from-content',
        requestId,
        approved: response?.approved ?? false,
        report: response?.report,
      },
      '*'
    );
  } catch (err) {
    console.error('[ShieldWall] Error communicating with background:', err);
    // On error, reject the transaction for safety
    window.postMessage(
      {
        channel: CHANNEL,
        direction: 'from-content',
        requestId,
        approved: false,
        error: 'Communication error',
      },
      '*'
    );
  }
});

console.log('[ShieldWall] 🛡️ Content script loaded');
