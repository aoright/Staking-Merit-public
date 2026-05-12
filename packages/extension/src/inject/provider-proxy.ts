// ============================================
// ShieldWall — Provider Proxy (Injected Script)
// ============================================
// This script is injected into EVERY web page to intercept
// wallet provider calls (MetaMask, etc.) before they execute.
//
// Communication flow:
// dApp → Provider Proxy → Content Script → Background SW → Analysis Pipeline

import { EXTENSION } from '@shieldwall/shared';

const CHANNEL = EXTENSION.CHANNEL_NAME;

/**
 * Methods that we intercept for analysis.
 * All other RPC methods pass through unmodified.
 */
const INTERCEPTED_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
]);

/**
 * Wrap the existing window.ethereum provider with our proxy.
 */
function proxyProvider() {
  const originalProvider = (window as any).ethereum;
  if (!originalProvider) {
    // No wallet detected, retry after a short delay
    setTimeout(proxyProvider, 500);
    return;
  }

  // Prevent double-wrapping
  if ((originalProvider as any).__shieldwall_proxied) return;

  const originalRequest = originalProvider.request.bind(originalProvider);

  originalProvider.request = async (args: { method: string; params?: unknown[] }) => {
    const { method, params } = args;

    // Pass through non-sensitive methods immediately
    if (!INTERCEPTED_METHODS.has(method)) {
      return originalRequest(args);
    }

    // Send to content script for analysis
    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      // Listen for the analysis response
      const handler = (event: MessageEvent) => {
        if (
          event.source !== window ||
          event.data?.channel !== CHANNEL ||
          event.data?.direction !== 'from-content' ||
          event.data?.requestId !== requestId
        ) {
          return;
        }
        window.removeEventListener('message', handler);

        if (event.data.approved) {
          // User approved — execute the original request
          originalRequest(args).then(resolve).catch(reject);
        } else {
          // User rejected
          reject(new Error('ShieldWall: Transaction rejected by user'));
        }
      };

      window.addEventListener('message', handler);

      // Send the interception to content script
      window.postMessage(
        {
          channel: CHANNEL,
          direction: 'from-page',
          requestId,
          method,
          params,
          origin: window.location.origin,
          chainId: originalProvider.chainId
            ? parseInt(originalProvider.chainId, 16)
            : undefined,
        },
        '*'
      );

      // Timeout safety valve
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('ShieldWall: Analysis timed out'));
      }, EXTENSION.ANALYSIS_TIMEOUT);
    });
  };

  (originalProvider as any).__shieldwall_proxied = true;
  console.log('[ShieldWall] 🛡️ Provider proxy activated');
}

// Run on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', proxyProvider);
} else {
  proxyProvider();
}

// Also watch for late-loaded providers (e.g., MetaMask injects after DOMContentLoaded)
const observer = new MutationObserver(() => {
  if ((window as any).ethereum && !(window as any).ethereum.__shieldwall_proxied) {
    proxyProvider();
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
