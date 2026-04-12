import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HashFox Labs — Learn Any Market, Without Risk",
  description:
    "HashFox Labs is the universal sandbox for traders. Backtest strategies and paper-trade across crypto, prediction markets, forex, and stocks — all in one place before going live.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/hashfoxlogo.png" type="image/png" sizes="32x32" />
      </head>
      <body>{children}</body>
    </html>
  );
}
