import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { services } from "@/lib/services";

export default function ServicesSection() {
  const [titleRef, titleInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section id="services" className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <motion.div
          ref={titleRef}
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Nuestros Servicios</h2>
          <p className="text-lg text-gray-600">
            Soluciones tecnológicas integrales adaptadas para cumplir tus objetivos de negocio e impulsar la innovación.
          </p>
        </motion.div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {services.map((service, index) => (
            <ServiceCard 
              key={service.id}
              service={service} 
              index={index} 
            />
          ))}
        </div>
      </div>
    </section>
  );
}

interface ServiceCardProps {
  service: {
    id: string;
    icon: string;
    title: string;
    description: string;
    iconColor: string;
    iconBg: string;
  };
  index: number;
}

function ServiceCard({ service, index }: ServiceCardProps) {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <motion.div
      ref={ref}
      className="bg-white rounded-xl shadow-md p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
    >
      <div className={`h-12 w-12 ${service.iconBg} ${service.iconColor} rounded-lg flex items-center justify-center mb-6`}>
        <i className={`fas ${service.icon} text-xl`}></i>
      </div>
      <h3 className="text-xl font-semibold mb-3">{service.title}</h3>
      <p className="text-gray-600 mb-4">
        {service.description}
      </p>
      <a href="#contact" className="text-primary font-medium inline-flex items-center hover:text-[#575757] transition-colors">
        Saber Más <ArrowRight className="ml-2 h-4 w-4" />
      </a>
    </motion.div>
  );
}
