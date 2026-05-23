import Image from "next/image";
import { headers } from "next/headers";
import { CheckinForm } from "./_form";
import { KioskQR } from "./_kiosk-qr";
import { ForceDarkOnMount } from "../_force-dark";
import { getFreshKioskToken } from "./actions";

export const dynamic = "force-dynamic";

// Kiosk page is locked to dark theme — same pattern as the landing page.
const themeInitScript = `document.documentElement.classList.add('dark');`;

/**
 * Derive the public URL where /checkin/scan can be reached. Phone cameras
 * scanning the kiosk QR need an absolute URL — not a relative path.
 */
async function getScanUrlBase(): Promise<string> {
  const envUrl = process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function CheckinKioskPage() {
  const [initialToken, scanUrlBase] = await Promise.all([
    getFreshKioskToken(),
    getScanUrlBase(),
  ]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <ForceDarkOnMount />
      <main className="min-h-screen bg-background text-foreground p-4 flex items-center justify-center">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          {/* Left: logo + Gym ID form */}
          <div className="w-full max-w-md mx-auto space-y-8">
            <div className="flex justify-center">
              <Image
                src="/hero-logo.webp"
                alt="Muscle Factory Gym"
                width={822}
                height={760}
                priority
                className="h-auto w-full max-w-[260px] sm:max-w-[320px]"
              />
            </div>
            <CheckinForm />
          </div>

          {/* Right: rotating QR code for phone-camera scan */}
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl sm:text-2xl font-semibold">
                Or scan with your phone
              </h2>
              <p className="text-sm text-muted-foreground">
                Point your camera at the QR to check in
              </p>
            </div>
            <KioskQR initialToken={initialToken} scanUrlBase={scanUrlBase} />
          </div>
        </div>
      </main>
    </>
  );
}
