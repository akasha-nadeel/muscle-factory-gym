"use client";

import { useEffect } from "react";

/**
 * Locks the landing page to dark theme regardless of the admin's
 * localStorage preference. Mounts client-side and re-applies the dark
 * class on every visit, including Next.js client-side navigations
 * (where the inline theme-init <script> in page.tsx wouldn't re-run).
 */
export function ForceDarkOnMount() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return null;
}
