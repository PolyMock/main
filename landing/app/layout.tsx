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
        <link rel="icon" href="/hashfoxlogo.png" type="image/png" sizes="any" />
        <style>{`
          link[rel="icon"] {
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
