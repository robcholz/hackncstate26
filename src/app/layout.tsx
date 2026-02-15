import type { Metadata } from "next";
import type { ReactNode } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "./globals.css";

export const metadata: Metadata = {
  title: "Phishing Lens"
};

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading"
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono"
});

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
