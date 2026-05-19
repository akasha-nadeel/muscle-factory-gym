import { headers } from "next/headers";
import { getFreshKioskToken } from "./actions";
import { CheckinForm } from "./_form";
import { KioskQR } from "./_kiosk-qr";

export const dynamic = "force-dynamic";

/**
 * Derive the public URL where /checkin/scan can be reached. Phone cameras
 * scanning the kiosk QR need an absolute URL — not a relative path.
 *
 * Preference order:
 *   1. APP_URL env var (set on Vercel) — the canonical answer
 *   2. Request headers (x-forwarded-host / host + proto) — works on
 *      localhost during dev without configuring APP_URL
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
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Scan the QR</h1>
          <p className="text-sm text-muted-foreground">
            Point your phone camera at the QR to check in
          </p>
        </div>
        <div className="flex justify-center">
          <KioskQR initialToken={initialToken} scanUrlBase={scanUrlBase} />
        </div>
        <div className="text-center text-muted-foreground text-sm">OR</div>
        <CheckinForm />
      </div>
    </main>
  );
}
