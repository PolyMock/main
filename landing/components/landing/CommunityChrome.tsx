"use client";

import BitcoinChartBackground from "@/components/landing/BitcoinChartBackground";
import SiteNav from "@/components/landing/SiteNav";
import LandingFooter from "@/components/landing/LandingFooter";

export default function CommunityChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen relative">
      <BitcoinChartBackground />
      <div className="noise-overlay" aria-hidden />
      <div className="grain-overlay" aria-hidden />
      <SiteNav />
      <div className="relative z-10">
        {children}
        <LandingFooter />
      </div>
    </main>
  );
}
