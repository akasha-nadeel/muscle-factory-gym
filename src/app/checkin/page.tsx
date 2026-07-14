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
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-8 lg:gap-12 items-center">
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

          {/* Middle: subtle divider between the two check-in options.
              Vertical (full row height) on desktop, horizontal on mobile
              where the columns stack. */}
          <div
            className="flex items-center justify-center self-stretch"
            aria-hidden="true"
          >
            <span className="h-px w-full bg-border lg:h-full lg:w-px" />
          </div>

          {/* Right: rotating QR code for phone-camera scan */}
          <div className="w-full max-w-md mx-auto flex flex-col items-center gap-4">
            <h2 className="text-xl sm:text-2xl font-semibold text-center">
              Scan with your phone
            </h2>
            <KioskQR initialToken={initialToken} scanUrlBase={scanUrlBase} />

            {/* Per-platform scan instructions. Each line tells the member to
                use their phone's built-in camera — which opens the link in
                the real browser (session kept → auto check-in) instead of an
                in-app scanner browser that forces a re-sign-in. */}
            <div className="w-full max-w-[300px] space-y-3.5 pt-1">
              <div className="flex items-center gap-3">
                <Image
                  src="/apple.png"
                  alt="Apple"
                  width={80}
                  height={80}
                  className="size-10 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">iPhone</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Open your Camera, point at the QR, then tap the yellow
                    badge.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Image
                  src="/android.png"
                  alt="Android"
                  width={80}
                  height={80}
                  className="size-10 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">Android</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    Open your Camera or Google Lens, point at the QR, then tap
                    the link.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
