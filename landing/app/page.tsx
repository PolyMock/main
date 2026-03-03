import Header from "@/components/Header";
import Ticker from "@/components/Ticker";
import Hero from "@/components/Hero";
import EverythingSection from "@/components/EverythingSection";
import DetailedFeature from "@/components/DetailedFeature";
import FeatureCards from "@/components/FeatureCards";
import HowItWorks from "@/components/HowItWorks";
import PaperTradeSection from "@/components/PaperTradeSection";
import Features from "@/components/Features";
import Integration from "@/components/Integration";
import CustomProduct from "@/components/CustomProduct";
import FAQ from "@/components/FAQ";
import CTA from "@/components/CTA";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <video className="video-bg" autoPlay loop muted playsInline>
        <source src="/videos/background-video.mp4" type="video/mp4" />
      </video>

      <Header />
      <Ticker />
      <Hero />
      <EverythingSection />
      <DetailedFeature />
      <FeatureCards />
      <HowItWorks />
      <PaperTradeSection />
      <Features />
      <Integration />
      <CustomProduct />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
