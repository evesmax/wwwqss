import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, Network, MapPin, Truck, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function QNexusControlPage() {
  const [heroRef, heroInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [featuresRef, featuresInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    document.title = "QNexus Control - Control Logístico y Flotas | Q Software Solutions";
    window.scrollTo(0, 0);
  }, []);

  const features = [
    { icon: <Truck className="h-6 w-6" />, title: "Gestión de Flotas", description: "Monitoreo y control en tiempo real de toda tu flota vehicular" },
    { icon: <MapPin className="h-6 w-6" />, title: "Rastreo GPS", description: "Seguimiento preciso de ubicación y rutas optimizadas" },
    { icon: <Network className="h-6 w-6" />, title: "Control Logístico", description: "Centraliza la gestión de inventarios y cadena de suministro" },
    { icon: <BarChart3 className="h-6 w-6" />, title: "Reportes Avanzados", description: "Métricas detalladas de rendimiento operacional en tiempo real" },
  ];

  const benefits = [
    "Reducción de costos de combustible hasta un 30%",
    "Optimización automática de rutas de distribución",
    "Alertas en tiempo real de eventos críticos",
    "Integración con sistemas ERP existentes",
    "Panel de control intuitivo y personalizable",
    "Soporte técnico dedicado 24/7",
  ];

  return (
    <div className="min-h-screen bg-white">
      <nav className="bg-white shadow-sm fixed top-0 w-full z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/">
            <span className="text-2xl font-bold cursor-pointer">
              <span className="text-primary">QSoftware</span>
              <span className="ml-1">Solutions</span>
            </span>
          </Link>
          <Link href="/">
            <Button variant="outline">Volver al Inicio</Button>
          </Link>
        </div>
      </nav>

      <section className="pt-32 pb-20 bg-gradient-to-br from-gray-50 to-white">
        <motion.div
          ref={heroRef}
          className="container mx-auto px-6"
          initial={{ opacity: 0, y: 30 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="h-14 w-14 bg-primary/10 text-primary rounded-xl flex items-center justify-center">
                <i className="fas fa-network-wired text-2xl"></i>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">QNexus Control</h1>
            </div>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Plataforma integral de control logístico y gestión de flotas vehiculares en tiempo real. Optimiza tus operaciones con tecnología de punta.
            </p>
            <a href="#contact-section">
              <Button size="lg" className="text-lg px-8">
                Solicitar Demo <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>
        </motion.div>
      </section>

      <section className="py-20">
        <motion.div
          ref={featuresRef}
          className="container mx-auto px-6"
          initial={{ opacity: 0, y: 30 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-3xl font-bold text-center mb-12">Características Principales</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((f, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-6 text-center hover:shadow-md transition-shadow">
                <div className="h-12 w-12 bg-primary/10 text-primary rounded-lg flex items-center justify-center mx-auto mb-4">
                  {f.icon}
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm">{f.description}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12">Beneficios</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-white rounded-lg">
                  <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">{b}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="contact-section" className="py-20">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold mb-4">Lleva tu operación al siguiente nivel</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Agenda una demostración personalizada y descubre cómo QNexus Control puede transformar tu logística.
          </p>
          <Link href="/#contact">
            <Button size="lg">Contáctanos <ArrowRight className="ml-2 h-5 w-5" /></Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
