import type { MetadataRoute } from "next";

/**
 * Web app manifest — makes the gym app installable so Chrome/Edge show the
 * address-bar "Install" icon and the app opens in its own standalone window
 * (no tabs/address bar). Next.js auto-injects <link rel="manifest"> when this
 * file exists.
 *
 * Icons are generated on the fly by the /icons/[size] route (see
 * src/app/icons/[size]/route.tsx) from the shared dumbbell renderer.
 *
 * start_url is "/" — the role-aware home redirect sends admins to /admin and
 * members to /portal, so a single entry point works for everyone.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Muscle Factory Gym",
    short_name: "Muscle Factory",
    description:
      "Muscle Factory Gym — membership, payments, and check-in management.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["business", "health", "fitness"],
    icons: [
      {
        src: "/icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
