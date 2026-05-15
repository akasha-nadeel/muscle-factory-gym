import { getFreshKioskToken } from "./actions";
import { CheckinForm } from "./_form";
import { KioskQR } from "./_kiosk-qr";

export const dynamic = "force-dynamic";

export default async function CheckinKioskPage() {
  const initialToken = await getFreshKioskToken();

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <h1 className="text-center text-2xl font-semibold">Scan the QR</h1>
        <div className="flex justify-center">
          <KioskQR initialToken={initialToken} />
        </div>
        <div className="text-center text-muted-foreground text-sm">OR</div>
        <CheckinForm />
      </div>
    </main>
  );
}
