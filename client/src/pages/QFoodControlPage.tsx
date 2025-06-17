import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, BarChart3, ShoppingCart, Users, Clock } from "lucide-react";
import foodControlLogo from "@assets/FoodC.png";
import chefTabletImage from "@assets/chef-con-una-tablet.jpg";

export default function QFoodControlPage() {
  const [heroRef, heroInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [featuresRef, featuresInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  useEffect(() => {
    document.title = "Q Food Control - Gestión Inteligente para Restaurantes | Q Software Solutions";
  }, []);

  const features = [
    {
      icon: <ShoppingCart className="h-6 w-6" />,
      title: "Punto de Venta Integrado",
      description: "Sistema POS completo con gestión de mesas y comandas en tiempo real"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Control de Inventarios",
      description: "Supervisión exhaustiva de stock, costos y rotación de productos"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Gestión de Personal",
      description: "Control de horarios, turnos y rendimiento del equipo"
    },
    {
      icon: <Clock className="h-6 w-6" />,
      title: "Análisis en Tiempo Real",
      description: "Datos precisos al instante para decisiones estratégicas"
    }
  ];

  const benefits = [
    "Optimización completa de operaciones",
    "Análisis detallado del rendimiento del menú",
    "Reducción de costos operativos",
    "Mejora en la experiencia del cliente",
    "Aumento significativo de rentabilidad",
    "Eliminación de procesos manuales"
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="pt-24 pb-20 md:pt-32 md:pb-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary-500/5 z-0"></div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              ref={heroRef}
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-6">
                <img 
                  src={foodControlLogo} 
                  alt="Q Food Control Logo" 
                  className="h-16 md:h-20 mb-6"
                />
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Moderniza tu <span className="text-primary">Restaurante</span>, Optimiza tu <span className="text-primary">Futuro</span>
              </h1>
              
              <h2 className="text-xl md:text-2xl text-primary font-semibold mb-6">
                Gestión Inteligente en la Nube
              </h2>
              
              <p className="text-lg text-gray-600 mb-8 max-w-lg">
                En el competitivo mundo gastronómico, la clave del éxito reside en la eficiencia y la capacidad de adaptación. Food Control es tu socio tecnológico en la nube, diseñado para revolucionar la administración de tu restaurante y catapultar tu crecimiento.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="hover:bg-[#474747]">
                  <a href="#contact">
                    Solicitar Demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </a>
                </Button>
                <Button variant="outline" size="lg" asChild className="hover:bg-[#474747] hover:text-white">
                  <a href="#features">Conocer Más</a>
                </Button>
              </div>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={heroInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="relative"
            >
              <div className="rounded-2xl overflow-hidden shadow-xl">
                <img 
                  src={chefTabletImage} 
                  alt="Chef profesional usando tablet en cocina moderna para gestión de restaurante" 
                  className="w-full h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent rounded-2xl"></div>
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <h3 className="text-xl font-bold mb-2">Tecnología al Servicio de la Gastronomía</h3>
                  <p className="text-sm opacity-90">Gestión digital intuitiva para chefs profesionales</p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Content Section */}
      <section id="features" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div
              ref={featuresRef}
              initial={{ opacity: 0, y: 20 }}
              animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Transforma la <span className="text-primary">Gestión</span> de tu Restaurante
              </h2>
              
              <p className="text-lg text-gray-600 mb-8">
                Nuestra plataforma intuitiva te permite supervisar y optimizar todas tus operaciones: desde el punto de venta y la gestión de mesas, hasta el control exhaustivo de inventarios, costos y el análisis detallado del rendimiento de tu menú.
              </p>
              
              <p className="text-lg text-gray-600 mb-8">
                Olvídate de los procesos manuales y las conjeturas. Con Food Control, obtienes datos precisos al instante para tomar decisiones estratégicas, mejorar la experiencia de tus clientes y aumentar significativamente tu rentabilidad.
              </p>
              
              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <motion.div 
                    key={index} 
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    animate={featuresInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                  >
                    <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Check className="h-4 w-4 text-primary" />
                    </div>
                    <span className="text-gray-700">{benefit}</span>
                  </motion.div>
                ))}
              </div>
              
              <p className="text-xl font-semibold text-primary mb-6">
                Es hora de evolucionar. Descubre cómo Food Control puede transformar la gestión de tu restaurante y abrirte las puertas a nuevas oportunidades.
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="space-y-8"
            >
              {/* Funcionalidades principales */}
              <div className="bg-gradient-to-br from-primary/10 to-secondary-500/10 rounded-2xl p-8">
                <h3 className="text-2xl font-bold text-center mb-6 text-primary">Funcionalidades Principales</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {features.map((feature, index) => (
                    <motion.div 
                      key={index} 
                      className="bg-white rounded-lg p-6 shadow-md hover:shadow-lg transition-shadow"
                      initial={{ opacity: 0, y: 20 }}
                      animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                      transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                    >
                      <div className="text-primary mb-3">{feature.icon}</div>
                      <h4 className="font-semibold text-lg mb-2">{feature.title}</h4>
                      <p className="text-gray-600">{feature.description}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA Card */}
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <img 
                    src={foodControlLogo} 
                    alt="Q Food Control" 
                    className="h-12 mx-auto mb-4"
                  />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">¿Listo para comenzar?</h3>
                  <p className="text-gray-600">Solicita una demostración personalizada</p>
                </div>
                
                <div className="space-y-4">
                  <Button asChild className="w-full" size="lg">
                    <a href="#contact">
                      Solicitar Demo Gratuita
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  
                  <Button variant="outline" asChild className="w-full" size="lg">
                    <a href="/">Volver al Inicio</a>
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}