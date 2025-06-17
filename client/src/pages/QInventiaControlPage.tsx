import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, Package, BarChart3, AlertTriangle, Smartphone, Eye } from "lucide-react";
import inventiaLogo from "@assets/Inventia.png";
import warehouseSupervisorImage from "@assets/supervisor-de-exportacion-que-redacta-la-facturacion-para-la-logistica-de-los-productos.jpg";

export default function QInventiaControlPage() {
  const [heroRef, heroInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const [featuresRef, featuresInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  useEffect(() => {
    document.title = "Q Inventia Control - Control Total de tu Inventario | Q Software Solutions";
  }, []);

  const features = [
    {
      icon: <Eye className="h-6 w-6" />,
      title: "Visibilidad en Tiempo Real",
      description: "Conoce tus niveles de stock al segundo"
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Control de Costos Preciso",
      description: "Entiende la rentabilidad de cada producto"
    },
    {
      icon: <Package className="h-6 w-6" />,
      title: "Reducción de Mermas",
      description: "Optimiza la rotación y evita el desperdicio"
    },
    {
      icon: <Smartphone className="h-6 w-6" />,
      title: "Acceso Multidispositivo",
      description: "Gestiona tu inventario desde donde estés"
    },
    {
      icon: <AlertTriangle className="h-6 w-6" />,
      title: "Reportes Inteligentes",
      description: "Toma decisiones basadas en datos concretos"
    }
  ];

  const benefits = [
    "Monitoreo de cada artículo en tiempo real",
    "Registro fácil de entradas, salidas y traslados",
    "Cálculo preciso de costos",
    "Optimización de niveles de stock",
    "Alertas inteligentes para puntos de reorden",
    "Acceso desde cualquier dispositivo"
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
                  src={inventiaLogo} 
                  alt="Q Inventia Control Logo" 
                  className="h-16 md:h-20 mb-6"
                  style={{
                    filter: 'hue-rotate(10deg) saturate(1.2) brightness(1.1)'
                  }}
                />
              </div>
              
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                Control <span className="text-primary">Total</span> de tu Inventario
              </h2>
              
              <h3 className="text-xl md:text-2xl text-primary font-semibold mb-6">
                ¡Optimiza, Ahorra y Crece!
              </h3>
              
              <p className="text-lg text-gray-600 mb-8 max-w-lg">
                ¿El manejo de tu inventario se siente como un laberinto sin salida? ¿Mermas, compras a destiempo y falta de visibilidad están impactando tus ganancias?
              </p>
              
              <p className="text-lg text-gray-600 mb-8 max-w-lg">
                Con Inventia Control, nuestra solución de administración de inventarios en la nube, retoma el control absoluto y transforma tu stock en un motor de rentabilidad.
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
                  src={warehouseSupervisorImage} 
                  alt="Supervisor de almacén gestionando inventario con sistema digital" 
                  className="w-full h-[400px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent rounded-2xl"></div>
                <div className="absolute bottom-6 left-6 right-6 text-white">
                  <h3 className="text-xl font-bold mb-2">Control Profesional de Inventarios</h3>
                  <p className="text-sm opacity-90">Gestión digital avanzada para almacenes modernos</p>
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
                Transforma tu <span className="text-primary">Stock</span> en Rentabilidad
              </h2>
              
              <p className="text-lg text-gray-600 mb-8">
                Nuestra plataforma intuitiva te permite monitorear cada artículo en tiempo real, desde la recepción hasta su venta o consumo. Registra entradas, salidas, traslados y ajustes con facilidad.
              </p>
              
              <p className="text-lg text-gray-600 mb-8">
                Calcula costos con precisión, optimiza tus niveles de stock para evitar el desperdicio y las roturas, y recibe alertas inteligentes para puntos de reorden.
              </p>
              
              <p className="text-lg text-gray-600 mb-8">
                Olvídate de las hojas de cálculo obsoletas y los conteos manuales interminables. Accede a tu información crítica desde cualquier dispositivo, en cualquier momento.
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
                Toma decisiones basadas en datos, reduce pérdidas y asegura que siempre tengas lo que necesitas, cuando lo necesitas.
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="space-y-8"
            >
              {/* Funcionalidades principales */}
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <h3 className="text-2xl font-bold text-center mb-6 text-primary">Características Principales</h3>
                <div className="grid grid-cols-1 gap-6">
                  {features.map((feature, index) => (
                    <motion.div 
                      key={index} 
                      className="flex items-start gap-4 p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                      initial={{ opacity: 0, y: 20 }}
                      animate={featuresInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                      transition={{ duration: 0.4, delay: 0.4 + index * 0.1 }}
                    >
                      <div className="text-primary mt-1">{feature.icon}</div>
                      <div>
                        <h4 className="font-semibold text-lg mb-1">{feature.title}</h4>
                        <p className="text-gray-600">{feature.description}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* CTA Card */}
              <div className="bg-primary rounded-2xl shadow-xl p-8 text-white">
                <div className="text-center mb-6">
                  <img 
                    src={inventiaLogo} 
                    alt="Q Inventia Control" 
                    className="h-12 mx-auto mb-4 filter brightness-0 invert"
                    style={{
                      filter: 'brightness(0) invert(1)'
                    }}
                  />
                  <h3 className="text-2xl font-bold mb-2">¿Listo para comenzar?</h3>
                  <p className="opacity-90">Solicita una demostración personalizada</p>
                </div>
                
                <div className="space-y-4">
                  <Button asChild className="w-full bg-white text-primary hover:bg-gray-100" size="lg">
                    <a href="#contact">
                      Solicitar Demo Gratuita
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                  
                  <Button variant="outline" asChild className="w-full border-white text-white hover:bg-white/10" size="lg">
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