"use client";

import { useEffect } from "react";

/**
 * Registers the minimal service worker (public/sw.js) on the client. The SW
 * exists only to make the app installable (Chrome's install-icon criteria).
 * Renders nothing. Failures are swallowed — registration is best-effort and
 * must never break the page.
 */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // best-effort: an unsupported browser or blocked SW shouldn't error
      });
    }
  }, []);
  return null;
}
