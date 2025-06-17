import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import WhyUsSection from "@/components/WhyUsSection";
import ProcessSection from "@/components/ProcessSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { useEffect } from "react";

export default function HomePage() {
  // Update page title and meta description
  useEffect(() => {
    document.title = "QNexus Control | Software & Technology Consulting";
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <Navbar />
      <main>
        <HeroSection />
        <ServicesSection />
        <WhyUsSection />
        <ProcessSection />

        <CTASection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}
