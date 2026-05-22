import Image from "next/image";
import { CheckinForm } from "./_form";
import { ForceDarkOnMount } from "../_force-dark";

export const dynamic = "force-dynamic";

// Kiosk page is locked to dark theme — same pattern as the landing page.
// Runs before React hydrates so there's no flash of light theme on cold load.
const themeInitScript = `document.documentElement.classList.add('dark');`;

export default async function CheckinKioskPage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: themeInitScript }}
        suppressHydrationWarning
      />
      <ForceDarkOnMount />
      <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-4">
        <div className="w-full max-w-md space-y-8">
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
      </main>
    </>
  );
}
