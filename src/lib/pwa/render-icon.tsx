import { ImageResponse } from "next/og";

/**
 * Renders the Muscle Factory app icon as a PNG at the requested square size.
 *
 * Why generated (not a static asset): the brand logo is a wide wordmark, so
 * it can't be squished into a square icon. A simple dumbbell drawn with
 * plain divs reads clearly at every size (favicon → install icon → splash)
 * AND needs no font files — Satori (the ImageResponse renderer) requires
 * fonts for text but renders shapes natively. Dark zinc background + brand
 * red plates match the admin theme.
 *
 * The dumbbell is centered and ~56% wide, so it stays inside the maskable
 * safe zone (central 80%) — the same image works for both `any` and
 * `maskable` manifest purposes.
 */
export function renderAppIcon(size: number): ImageResponse {
  const plateW = Math.round(size * 0.15);
  const plateH = Math.round(size * 0.46);
  const barW = Math.round(size * 0.26);
  const barH = Math.round(size * 0.13);
  const radius = Math.round(size * 0.06);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: plateW,
              height: plateH,
              background: "#dc2626",
              borderRadius: radius,
            }}
          />
          <div style={{ width: barW, height: barH, background: "#fafafa" }} />
          <div
            style={{
              width: plateW,
              height: plateH,
              background: "#dc2626",
              borderRadius: radius,
            }}
          />
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
