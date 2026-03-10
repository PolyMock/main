"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import ProfilePageContent from "./ProfilePageContent";

function ProfileInner() {
  const searchParams = useSearchParams();
  const address = searchParams.get("address");

  if (!address) {
    return (
      <div className="min-h-screen pt-28 pb-20 px-6 text-center">
        <p className="text-gray-400 text-lg mt-20">No wallet address provided.</p>
      </div>
    );
  }

  return <ProfilePageContent address={address} />;
}

export default function ProfilePageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen pt-28 pb-20 px-6 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ProfileInner />
    </Suspense>
  );
}
