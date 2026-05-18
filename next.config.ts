import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint config still uses Next 16 import paths after our downgrade.
    // Bypassing during build; run `pnpm lint` separately when we're ready
    // to update the eslint config to Next 15's flat-config patterns.
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Router cache TTL for client-side back/forward navigation.
    // Next 15 defaults both to 0 (always refetch); we extend them so admins
    // bouncing between sections see instant transitions instead of waiting
    // for the same server query to re-run. Stale data isn't a real concern
    // here — admin sees their own writes, and we call router.refresh()
    // after server actions that mutate.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
