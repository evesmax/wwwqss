import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import solucionesImage from "@assets/Soluciones.jpg";

const benefits = [
  {
    title: "Sistema de Control Central",
    description: "Nuestra plataforma unificada te brinda visibilidad y control completos sobre todo tu ecosistema tecnológico.",
  },
  {
    title: "Soluciones Personalizadas",
    description: "Creamos soluciones tecnológicas a medida diseñadas específicamente para tus desafíos empresariales únicos.",
  },
  {
    title: "Implementación Rápida",
    description: "Nuestro enfoque eficiente de entrega garantiza una implementación rápida con mínimas interrupciones en tus operaciones.",
  },
  {
    title: "Soporte Técnico 24/7",
    description: "Proporcionamos asistencia experta las 24 horas para garantizar que tus sistemas funcionen sin problemas en todo momento.",
  },
];

export default function WhyUsSection() {
  const [imageRef, imageInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [contentRef, contentInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section id="why-us" className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary-500/5 z-0"></div>
      
      <div className="container mx-auto px-6 relative z-10">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div
            ref={imageRef}
            initial={{ opacity: 0, y: 20 }}
            animate={imageInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
          >
            <img 
              src={solucionesImage} 
              alt="Profesional trabajando en soluciones tecnológicas avanzadas" 
              className="rounded-xl shadow-xl w-full h-auto"
            />
          </motion.div>
          
          <motion.div
            ref={contentRef}
            initial={{ opacity: 0, y: 20 }}
            animate={contentInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6 text-[#474747]">Por Qué Elegir QSoftware Solutions</h2>
            
            <div className="space-y-6">
              {benefits.map((benefit, index) => (
                <motion.div 
                  key={index} 
                  className="flex gap-4"
                  initial={{ opacity: 0, x: -20 }}
                  animate={contentInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                  transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                >
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-[#00aeef]/10 flex items-center justify-center">
                    <Check className="h-5 w-5 text-[#00aeef]" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{benefit.title}</h3>
                    <p className="text-gray-600">
                      {benefit.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
            
            <div className="mt-8">
              <Button asChild size="lg">
                <a href="#contact">Inicia Tu Proyecto</a>
              </Button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
