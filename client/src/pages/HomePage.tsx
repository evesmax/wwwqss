import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ServicesSection from "@/components/ServicesSection";
import WhyUsSection from "@/components/WhyUsSection";
import ProcessSection from "@/components/ProcessSection";
import TestimonialsSection from "@/components/TestimonialsSection";
import CTASection from "@/components/CTASection";
import ContactSection from "@/components/ContactSection";
import Footer from "@/components/Footer";
import { SEO, orgJsonLd } from "@/lib/useSEO";

export default function HomePage() {

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <SEO
        title="Q Software Solutions | Consultoría de Software en Guadalajara"
        description="Empresa de consultoría de software e innovación tecnológica en Guadalajara, México. Desarrollamos soluciones SaaS, ERP, POS e IA a la medida para impulsar el crecimiento de tu negocio."
        path="/"
        jsonLd={orgJsonLd}
      />
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
