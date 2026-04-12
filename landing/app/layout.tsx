import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HashFox Labs — Learn Any Market, Without Risk",
  description:
    "HashFox Labs is the universal sandbox for traders. Backtest strategies and paper-trade across crypto, prediction markets, forex, and stocks — all in one place before going live.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/favicon-512.png", sizes: "512x512", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
