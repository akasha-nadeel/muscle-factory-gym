import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
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

function readEnv(key: string): string | undefined {
  try {
    const ctx = getCloudflareContext();
    const v = (ctx?.env as Record<string, unknown> | undefined)?.[key];
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // not running in a CF request context (local dev / build-time)
  }
  return process.env[key];
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publishableKey = readEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
