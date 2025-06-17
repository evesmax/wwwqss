import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";

const processSteps = [
  {
    number: 1,
    title: "Análisis",
    description: "Evaluamos la operación de actual de tu empresa, identificando puntos críticos y procesos para optimizar eficiencia.",
  },
  {
    number: 2,
    title: "Diseño de Solución",
    description: "Desarrollamos una arquitectura personalizada que integra los procesos de tu empresa para eficientar su correcto desempeño.",
  },
  {
    number: 3,
    title: "Implementación Integral",
    description: "Nuestro equipo especializado instala y configura todos los sistemas de control, capacitando a tu personal en el uso de las nuevas herramientas.",
  },
  {
    number: 4,
    title: "Soporte Continuo",
    description: "Brindamos monitoreo 24/7 de tu operación y actualizaciones constantes del sistema.",
  },
];

export default function ProcessSection() {
  const [titleRef, titleInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <motion.div
          ref={titleRef}
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Nuestro Proceso de <span className="text-primary">Transformación</span></h2>
          <p className="text-lg text-gray-600">
            Transformamos tus ideas en realidad con desarrollo de software personalizado y la aplicación de tecnología de punta para resolver tus desafíos empresariales.
          </p>
        </motion.div>
        
        <div className="grid md:grid-cols-4 gap-8">
          {processSteps.map((step, index) => (
            <ProcessStep 
              key={step.number}
              step={step}
              index={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface ProcessStepProps {
  step: {
    number: number;
    title: string;
    description: string;
  };
  index: number;
}

function ProcessStep({ step, index }: ProcessStepProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <motion.div
      ref={ref}
      className="relative"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <div className="bg-white rounded-xl shadow-md p-8 h-full">
        <div className="absolute -top-4 -left-4 h-12 w-12 rounded-full bg-primary text-white font-bold flex items-center justify-center text-xl">
          {step.number}
        </div>
        <h3 className="text-xl font-semibold mb-4 pt-2">{step.title}</h3>
        <p className="text-gray-600">
          {step.description}
        </p>
      </div>
    </motion.div>
  );
}
