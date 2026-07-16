import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Muscle Factory Gym",
  description: "Single-gym membership, payments, and check-in.",
  // Lets iOS treat an installed copy as a standalone app (no Safari chrome).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muscle Factory",
  },
};

// themeColor lives in the viewport export in this Next version (moved out of
// metadata). Dark to match the app's theme — tints the installed window's
// title bar and the mobile address bar.
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        // The app is dark-only, so Clerk's own widgets (sign-in, sign-up,
        // <UserButton>, and the account/profile modals) use Clerk's `dark`
        // base theme instead of their default light styling. `--primary`
        // is the gym's brand red — align Clerk's accent to it so buttons /
        // links match the rest of the app.
        baseTheme: dark,
        variables: {
          // Brand red (hex so Clerk's colour parser is happy) matching the
          // app's --primary, so Clerk's buttons/links match the rest of it.
          colorPrimary: "#dc2626",
        },
        elements: {
          // The appearance `variables` for text-on-primary were ignored by
          // the theme (it kept auto-computing a dark foreground for our red),
          // so force white directly on the primary button + its children.
          // Clerk components render inline in our DOM, so Tailwind reaches
          // them; `!` makes it win over Clerk's inline style.
          formButtonPrimary: "text-white! [&_*]:text-white!",
        },
      }}
    >
      {/* The app is dark-only. `dark` is applied statically here (server
          rendered) so it's present on first paint with no flash and no
          per-page theme-init script. It stays on <html> because the
          components rely on Tailwind's `dark:` utility variant. */}
      <html
        lang="en"
        suppressHydrationWarning
        className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {children}
          {/* Offset toasts below the sticky 56px (h-14) header so a
              full-width mobile toast doesn't land on top of the nav and
              read as part of it. */}
          <Toaster
            richColors
            position="top-right"
            offset={{ top: 72 }}
            mobileOffset={{ top: 68 }}
          />
          <PwaRegister />
        </body>
      </html>
    </ClerkProvider>
  );
}
