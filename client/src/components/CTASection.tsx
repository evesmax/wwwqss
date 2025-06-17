import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

export default function CTASection() {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <motion.div 
          ref={ref}
          className="max-w-3xl mx-auto text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-primary">¿Listo para Tomar el Control de tu Tecnología?</h2>
          <p className="text-lg text-gray-600 mb-8">
            Deja que nuestros expertos te ayuden a implementar un sistema de control centralizado que optimice todo tu ecosistema tecnológico.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-primary text-white hover:bg-[#474747]">
              <a href="#contact">Solicitar una Demo</a>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-primary text-primary hover:bg-[#474747] hover:text-white">
              <a href="#services">Explorar Nuestras Soluciones</a>
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
