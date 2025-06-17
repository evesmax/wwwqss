import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
// Importamos la imagen principal de desarrollo de software
import principalImage from "@assets/Principal.jpg";
// Importamos los logotipos de clientes reales
import trtLogo from "@assets/TRT Logo copia.jpg";
import frygoLogo from "@assets/Frygo.png";
import bezirkLogo from "@assets/Bezirk.png";
import andradeLogo from "@assets/Logo.png";
import ideasGeckoLogo from "@assets/Ideas Gecko_1749738429303.jpg";

export default function HeroSection() {
  const [contentRef, contentInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [imageRef, imageInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section id="home" className="pt-32 pb-20 md:pt-40 md:pb-28 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary-500/5 z-0"></div>
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: 20 }}
            animate={contentInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4">
              <span className="text-[#474747]">Controla tu</span> <span className="text-primary">Ecosistema Tecnológico</span>
            </h1>
            <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#474747] leading-tight mb-6">
              Software a la medida, impulsado por la innovación y la tecnología
            </h2>
            <p className="text-lg md:text-xl text-gray-600 mb-8 max-w-lg">
              QSoftware Solutions ofrece soluciones de software innovadoras y consultoría tecnológica estratégica para optimizar tus operaciones empresariales e impulsar el crecimiento.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="hover:bg-[#474747]">
                <a href="#contact">
                  Comienza Ahora
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button variant="outline" size="lg" asChild className="hover:bg-[#474747] hover:text-white">
                <a href="#services">Nuestros Servicios</a>
              </Button>
            </div>
          </motion.div>
          
          <motion.div
            ref={imageRef}
            initial={{ opacity: 0, y: 20 }}
            animate={imageInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <img 
              src={principalImage} 
              alt="Desarrollo de software especializado con código React y tecnologías modernas para soluciones empresariales" 
              className="rounded-xl shadow-xl w-full h-auto"
            />
          </motion.div>
        </div>
        
        <div className="mt-20 pt-10 border-t border-gray-200">
          <p className="text-center text-gray-600 mb-8 font-medium">Empresas que confían en nuestras soluciones</p>
          <div className="relative overflow-hidden">
            <div className="flex animate-scroll items-center space-x-12">
              {/* Primera iteración de logos */}
              <div className="flex items-center space-x-12 flex-shrink-0">
                <img src={trtLogo} alt="Transportes Refrigerados Tlalnepantla" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={frygoLogo} alt="Frygo Express" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={bezirkLogo} alt="Bezirk Centro-Goethe" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={andradeLogo} alt="Andrade Chicharrón de Chile" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={ideasGeckoLogo} alt="Ideas Gecko" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
              </div>
              {/* Segunda iteración para carrusel continuo */}
              <div className="flex items-center space-x-12 flex-shrink-0">
                <img src={trtLogo} alt="Transportes Refrigerados Tlalnepantla" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={frygoLogo} alt="Frygo Express" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={bezirkLogo} alt="Bezirk Centro-Goethe" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={andradeLogo} alt="Andrade Chicharrón de Chile" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
                <img src={ideasGeckoLogo} alt="Ideas Gecko" className="h-12 object-contain filter grayscale hover:grayscale-0 transition-all duration-300 mix-blend-multiply" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
