import type { Metadata } from "next";
import CommunityChrome from "@/components/landing/CommunityChrome";
import ProfilePageWrapper from "@/components/community/ProfilePageWrapper";

export const metadata: Metadata = {
  title: "Profile - HashFox Labs",
  description: "User profile on HashFox Labs community.",
};

export default function ProfileRoute() {
  return (
    <CommunityChrome>
      <ProfilePageWrapper />
    </CommunityChrome>
  );
}
