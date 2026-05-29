import { renderAppIcon } from "@/lib/pwa/render-icon";

// iOS home-screen icon (Apple ignores the manifest icons and uses this).
// Lets members "Add to Home Screen" on iPhone with a proper branded icon.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return renderAppIcon(180);
}
