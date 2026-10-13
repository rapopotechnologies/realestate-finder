import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Toaster } from "sonner";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

// Three faces, one job each (ops/design-brief.md): Fraunces for headings and big prices,
// Geist for all UI text, Plex Mono for record IDs (parcel, case, certificate)
const display = Fraunces({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} | ${BRAND_TAGLINE}`, template: `%s | ${BRAND_NAME}` },
  description: "Find Florida tax deed auctions and HUD homes that never show up on Zillow.",
  // Owner details live behind login; keep the whole app out of search engines
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <a href="#main" className="sr-only z-[100] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-3">
          Skip to main content
        </a>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast: "!bg-card !text-card-foreground !border-border !shadow-lg !font-sans",
              description: "!text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  );
}
