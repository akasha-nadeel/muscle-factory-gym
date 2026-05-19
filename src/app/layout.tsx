import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
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
  title: "Gym Management",
  description: "Single-gym membership, payments, and check-in.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {/*
            SVG color-matrix filter used in light mode to invert ONLY the
            white parts of the gym logo while preserving the red FACTORY
            text. The matrix maps:
              R_out = R - G  → white (1,1,1) becomes 0, red (1,0,0) stays 1
              G_out = G - B  → white→0, red's G stays 0
              B_out = B - G  → white→0, red's B stays 0
            CSS `filter: invert() hue-rotate(180deg)` uses a YIQ matrix that
            turns red into salmon; this surgical matrix is exact for the
            two-color (red + white) logo.
          */}
          <svg width="0" height="0" className="absolute" aria-hidden="true">
            <defs>
              <filter
                id="logo-light-mode"
                colorInterpolationFilters="sRGB"
              >
                <feColorMatrix
                  type="matrix"
                  values="1 -1 0 0 0
                          0 1 -1 0 0
                          0 -1 1 0 0
                          0 0 0 1 0"
                />
              </filter>
            </defs>
          </svg>
          {children}
          <Toaster richColors position="top-right" />
        </body>
      </html>
    </ClerkProvider>
  );
}
