import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HashFox Labs - Backtest & Paper-Trade Any Market",
  description: "A product studio building tools for backtesting and paper trading across prediction markets and crypto markets. Test strategies before risking capital.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-192.png" type="image/png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/favicon-512.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
