"use client";

import dynamic from "next/dynamic";
import WalletProvider from "./WalletProvider";

const CommunityPage = dynamic(() => import("./CommunityPage"), { ssr: false });

export default function CommunityWithWallet() {
  return (
    <WalletProvider>
      <CommunityPage />
    </WalletProvider>
  );
}
