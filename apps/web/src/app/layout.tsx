import type { Metadata } from "next";
import { Inter, Exo_2 } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Providers } from "@/components/Providers";

const inter = Inter({ subsets: ["latin"] });
const exo2 = Exo_2({ 
  subsets: ["latin"],
  variable: "--font-exo2",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://payspawn.ai"),
  title: {
    default: "PaySpawn - AI Agent Payments Infrastructure",
    template: "%s | PaySpawn",
  },
  description: "Non-custodial payment infrastructure for AI agents. Give your agent spending power with on-chain limits. Built on Base. Zero protocol fees.",
  keywords: ["AI agent payments", "crypto payments", "USDC", "Base network", "non-custodial", "API payments", "agent infrastructure", "x402"],
  authors: [{ name: "PaySpawn" }],
  creator: "PaySpawn",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    title: "PaySpawn - AI Agent Payments Infrastructure",
    description: "Non-custodial payment infrastructure for AI agents. Give your agent spending power with on-chain limits. Built on Base.",
    url: "https://payspawn.ai",
    siteName: "PaySpawn",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PaySpawn - AI Agent Payments",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PaySpawn - AI Agent Payments Infrastructure",
    description: "Non-custodial payment infrastructure for AI agents. Give your agent spending power with on-chain limits.",
    creator: "@payspawn",
    images: ["/og-image.png"],
  },
  alternates: {
    canonical: "https://payspawn.ai",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={exo2.variable}>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
