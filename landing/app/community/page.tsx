import type { Metadata } from "next";
import CommunityChrome from "@/components/landing/CommunityChrome";
import CommunityWithWallet from "@/components/community/CommunityWithWallet";

export const metadata: Metadata = {
  title: "Community Hub - HashFox Labs",
  description:
    "Browse shared paper trades and backtested strategies across crypto, prediction markets, forex, stocks, and commodities.",
};

export default function CommunityRoute() {
  return (
    <CommunityChrome>
      <CommunityWithWallet />
    </CommunityChrome>
  );
}
