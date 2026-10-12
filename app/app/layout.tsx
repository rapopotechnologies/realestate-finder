import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Toaster } from "sonner";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

export const metadata: Metadata = {
  title: { default: `${BRAND_NAME} | ${BRAND_TAGLINE}`, template: `%s | ${BRAND_NAME}` },
  description: "Find Florida tax deed auctions and HUD homes that never show up on Zillow.",
  // Owner details live behind login; keep the whole app out of search engines
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${GeistSans.variable} font-sans`}>
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
