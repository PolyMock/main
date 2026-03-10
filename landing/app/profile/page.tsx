import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProfilePageWrapper from "@/components/community/ProfilePageWrapper";

export const metadata = {
  title: "Profile - HashFox Labs",
  description: "User profile on HashFox Labs community.",
};

export default function ProfilePage() {
  return (
    <main className="bg-black min-h-screen">
      <Header />
      <ProfilePageWrapper />
      <Footer />
    </main>
  );
}
