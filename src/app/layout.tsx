import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "Mimic | D&D Beyond to Roll20 Converter",
  description: "Instantly transform your D&D Beyond character sheets into Roll20-ready JSON files. Secure, frictionless, and totally free.",
  openGraph: {
    title: "Mimic",
    description: "Instantly transform your D&D Beyond character sheets into Roll20-ready JSON files.",
    url: "https://mimic.windwardline.com",
    siteName: "Mimic",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mimic",
    description: "Instantly transform your D&D Beyond character sheets into Roll20-ready JSON files.",
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
