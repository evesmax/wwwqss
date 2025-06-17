import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Palette, Code, Settings, Users, Lightbulb, CheckCircle } from "lucide-react";

export default function QProfessionalServicesPage() {
  const [heroRef, heroInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [servicesRef, servicesInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [benefitsRef, benefitsInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  useEffect(() => {
    document.title = "Q Professional Services - Diseño y Personalización de Software | QSoftware Solutions";
  }, []);

  const services = [
    {
      icon: <Palette className="h-8 w-8" />,
      title: "Diseño de Interfaces",
      description: "Creamos interfaces de usuario intuitivas y atractivas que mejoran la experiencia del usuario y la productividad.",
      features: ["Diseño UX/UI personalizado", "Prototipado interactivo", "Design Systems"]
    },
    {
      icon: <Code className="h-8 w-8" />,
      title: "Desarrollo a Medida",
      description: "Desarrollamos software completamente personalizado que se adapta perfectamente a tus procesos de negocio.",
      features: ["Arquitectura escalable", "Integración con sistemas existentes", "Código limpio y mantenible"]
    },
    {
      icon: <Settings className="h-8 w-8" />,
      title: "Personalización Avanzada",
      description: "Adaptamos y configuramos soluciones existentes para que cumplan exactamente con tus requisitos específicos.",
      features: ["Configuración personalizada", "Módulos específicos", "Workflows optimizados"]
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Consultoría Tecnológica",
      description: "Te acompañamos en la definición de estrategias tecnológicas y la optimización de tus procesos digitales.",
      features: ["Análisis de requerimientos", "Arquitectura de soluciones", "Roadmap tecnológico"]
    }
  ];

  const benefits = [
    "Soluciones 100% adaptadas a tus necesidades específicas",
    "Reducción significativa de tiempos y costos operativos",
    "Integración perfecta con tus sistemas actuales",
    "Escalabilidad y flexibilidad para el crecimiento futuro",
    "Soporte técnico especializado y mantenimiento continuo",
    "Metodologías ágiles para entregas rápidas y efectivas"
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary-500/5 z-0"></div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              ref={heroRef}
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                <span className="text-[#474747]">Q Professional</span> <span className="text-primary">Services</span>
              </h1>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#474747] leading-tight mb-6">
                Diseño y personalización de software a la medida de tus necesidades
              </h2>
              <p className="text-lg md:text-xl text-gray-600 mb-8">
                Transformamos tus ideas en soluciones tecnológicas únicas. Nuestro equipo de expertos en diseño y desarrollo 
                crea software completamente personalizado que se adapta perfectamente a los procesos y objetivos de tu empresa.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="hover:bg-[#474747]">
                  <a href="https://wa.me/523334655385" target="_blank" rel="noopener noreferrer">
                    Solicitar Consulta Gratuita
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button variant="outline" size="lg" asChild className="hover:bg-[#474747] hover:text-white">
                  <a href="#servicios">Ver Nuestros Servicios</a>
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex justify-center"
            >
              <svg 
                viewBox="0 0 400 300" 
                className="w-full h-auto max-w-md"
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Background circles */}
                <circle cx="320" cy="80" r="60" fill="#00aeef" opacity="0.1"/>
                <circle cx="80" cy="220" r="40" fill="#474747" opacity="0.1"/>
                
                {/* Main screen/monitor */}
                <rect x="50" y="80" width="220" height="140" rx="8" fill="white" stroke="#e5e7eb" strokeWidth="2"/>
                <rect x="60" y="90" width="200" height="100" rx="4" fill="#f8fafc"/>
                
                {/* Code lines */}
                <rect x="70" y="100" width="60" height="4" rx="2" fill="#00aeef"/>
                <rect x="140" y="100" width="40" height="4" rx="2" fill="#474747"/>
                <rect x="70" y="110" width="80" height="4" rx="2" fill="#d1d5db"/>
                <rect x="70" y="120" width="50" height="4" rx="2" fill="#00aeef"/>
                <rect x="130" y="120" width="70" height="4" rx="2" fill="#d1d5db"/>
                <rect x="70" y="130" width="90" height="4" rx="2" fill="#474747"/>
                <rect x="70" y="140" width="30" height="4" rx="2" fill="#00aeef"/>
                <rect x="110" y="140" width="60" height="4" rx="2" fill="#d1d5db"/>
                <rect x="70" y="150" width="40" height="4" rx="2" fill="#474747"/>
                <rect x="120" y="150" width="50" height="4" rx="2" fill="#00aeef"/>
                <rect x="70" y="160" width="80" height="4" rx="2" fill="#d1d5db"/>
                <rect x="70" y="170" width="60" height="4" rx="2" fill="#474747"/>
                
                {/* Mobile device */}
                <rect x="290" y="120" width="80" height="140" rx="12" fill="white" stroke="#e5e7eb" strokeWidth="2"/>
                <rect x="300" y="135" width="60" height="90" rx="4" fill="#f8fafc"/>
                <circle cx="330" cy="245" r="8" fill="#e5e7eb"/>
                
                {/* Mobile app elements */}
                <rect x="310" y="145" width="40" height="6" rx="3" fill="#00aeef"/>
                <rect x="310" y="155" width="30" height="4" rx="2" fill="#d1d5db"/>
                <rect x="310" y="165" width="35" height="4" rx="2" fill="#474747"/>
                <rect x="310" y="175" width="25" height="4" rx="2" fill="#00aeef"/>
                <rect x="310" y="185" width="40" height="4" rx="2" fill="#d1d5db"/>
                <rect x="310" y="195" width="20" height="4" rx="2" fill="#474747"/>
                <rect x="310" y="205" width="35" height="4" rx="2" fill="#00aeef"/>
                
                {/* Floating elements */}
                <circle cx="120" cy="50" r="3" fill="#00aeef"/>
                <circle cx="300" cy="50" r="2" fill="#474747"/>
                <circle cx="80" cy="270" r="2" fill="#00aeef"/>
                <circle cx="350" cy="280" r="3" fill="#474747"/>
                
                {/* Connecting lines/network */}
                <path d="M160 160 Q200 120 290 160" stroke="#00aeef" strokeWidth="2" opacity="0.6" fill="none"/>
                <path d="M160 180 Q220 200 290 180" stroke="#474747" strokeWidth="2" opacity="0.4" fill="none"/>
                
                {/* Code brackets */}
                <text x="320" y="110" className="text-xs" fill="#00aeef" fontFamily="monospace">{"</>"}</text>
                <text x="40" y="40" className="text-xs" fill="#474747" fontFamily="monospace">{"{"}</text>
                <text x="360" y="40" className="text-xs" fill="#00aeef" fontFamily="monospace">{"}"}</text>
              </svg>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <motion.div
            ref={servicesRef}
            initial={{ opacity: 0, y: 20 }}
            animate={servicesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Nuestros Servicios Especializados
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Ofrecemos una gama completa de servicios de diseño y desarrollo para crear soluciones tecnológicas 
              que impulsen el crecimiento y la eficiencia de tu negocio.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={servicesInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105"
              >
                <div className="flex items-center mb-6">
                  <div className="bg-primary/10 p-3 rounded-lg mr-4">
                    <div className="text-primary">
                      {service.icon}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900">{service.title}</h3>
                </div>
                <p className="text-gray-600 mb-6">{service.description}</p>
                <ul className="space-y-2">
                  {service.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-center text-sm text-gray-700">
                      <CheckCircle className="h-4 w-4 text-primary mr-2 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <motion.div
            ref={benefitsRef}
            initial={{ opacity: 0, y: 20 }}
            animate={benefitsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              ¿Por Qué Elegir Q Professional Services?
            </h2>
            <p className="text-lg text-gray-600 max-w-3xl mx-auto">
              Nuestro enfoque personalizado y experiencia en desarrollo de software nos permite entregar 
              soluciones que realmente transforman la manera en que trabajas.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {benefits.map((benefit, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={benefitsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="flex items-start"
              >
                <CheckCircle className="h-6 w-6 text-primary mr-3 mt-1 flex-shrink-0" />
                <p className="text-gray-700">{benefit}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={benefitsInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="text-center"
          >
            <div className="bg-primary/5 rounded-2xl p-8 md:p-12">
              <Lightbulb className="h-16 w-16 text-primary mx-auto mb-6" />
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                ¿Tienes una idea en mente?
              </h3>
              <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
                Conversemos sobre cómo podemos convertir tu visión en una solución tecnológica real. 
                Ofrecemos consultas gratuitas para evaluar tus necesidades y proponer la mejor estrategia.
              </p>
              <Button asChild size="lg" className="hover:bg-[#474747]">
                <a href="https://wa.me/523334655385" target="_blank" rel="noopener noreferrer">
                  Iniciar Proyecto
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-16 bg-gray-900 text-white">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Comienza tu proyecto hoy mismo
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Nuestro equipo está listo para ayudarte a crear la solución tecnológica perfecta para tu empresa.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-primary hover:bg-primary/90">
              <a href="https://wa.me/523334655385" target="_blank" rel="noopener noreferrer">
                Contactar por WhatsApp
              </a>
            </Button>
            <Button variant="outline" size="lg" asChild className="border-white text-white hover:bg-white hover:text-gray-900">
              <a href="mailto:contacto@qsoftwaresolutions.net">
                Enviar Email
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}