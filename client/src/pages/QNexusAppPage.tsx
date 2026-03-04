import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, ShoppingCart, Package, Building2, Languages, ShieldCheck, BarChart3 } from "lucide-react";
import { Link } from "wouter";

export default function QNexusAppPage() {
  const [heroRef, heroInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [featuresRef, featuresInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    document.title = "QNexusApp - Sistema POS y Gestión Retail | Q Software Solutions";
    window.scrollTo(0, 0);
  }, []);

  const features = [
    { icon: <ShoppingCart className="h-6 w-6" />, title: "Punto de Venta", description: "Sistema de cobro rápido e intuitivo con interfaz táctil" },
    { icon: <Package className="h-6 w-6" />, title: "Gestión de Inventario", description: "Seguimiento de stock en tiempo real en todas tus ubicaciones" },
    { icon: <Building2 className="h-6 w-6" />, title: "Multi-Sucursal", description: "Administra múltiples tiendas desde un solo panel" },
    { icon: <Languages className="h-6 w-6" />, title: "Interfaz Bilingüe", description: "Soporte completo en inglés y español para todos los usuarios" },
    { icon: <ShieldCheck className="h-6 w-6" />, title: "Compras Inteligentes", description: "Órdenes de compra automatizadas con controles antirrobo" },
    { icon: <BarChart3 className="h-6 w-6" />, title: "Reportes Avanzados", description: "Análisis detallado e insights para mejores decisiones" },
  ];

  const benefits = [
    "Sistema de cobro Scan & Go rápido e intuitivo",
    "Gestión de inventario en tiempo real multi-ubicación",
    "Interfaz bilingüe inglés/español para todo el equipo",
    "Administración centralizada de múltiples sucursales",
    "Órdenes de compra automatizadas con controles antirrobo",
    "Reportes y análisis detallados para mejores decisiones",
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
                <ShoppingCart className="h-7 w-7" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">QNexusApp</h1>
            </div>
            <p className="text-xl text-gray-600 mb-4 max-w-2xl mx-auto">
              Sistema Moderno y adaptado a tu Negocio
            </p>
            <p className="text-lg text-gray-500 mb-8 max-w-2xl mx-auto">
              Optimiza tus operaciones de venta con nuestra poderosa plataforma bilingüe. Gestiona inventario, ventas y múltiples ubicaciones desde un solo panel.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a href="https://qnexusapp.com/" target="_blank" rel="noopener noreferrer">
                <Button size="lg" className="text-lg px-8">
                  Comenzar Gratis <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </a>
              <a href="#features-section">
                <Button size="lg" variant="outline" className="text-lg px-8">
                  Conocer Más
                </Button>
              </a>
            </div>
          </div>
        </motion.div>
      </section>

      <section id="features-section" className="py-20">
        <motion.div
          ref={featuresRef}
          className="container mx-auto px-6"
          initial={{ opacity: 0, y: 30 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
        >
          <h2 className="text-3xl font-bold text-center mb-4">Características</h2>
          <p className="text-gray-600 text-center mb-12 max-w-xl mx-auto">Todo lo que necesitas para administrar tu negocio eficientemente</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
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
          <h2 className="text-3xl font-bold mb-4">¿Listo para Transformar tu Negocio?</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Únete a miles de minoristas que confían en QNexusApp
          </p>
          <div className="flex items-center justify-center gap-4">
            <a href="https://qnexusapp.com/" target="_blank" rel="noopener noreferrer">
              <Button size="lg">Comenzar Gratis <ArrowRight className="ml-2 h-5 w-5" /></Button>
            </a>
            <Link href="/#contact">
              <Button size="lg" variant="outline">Contáctanos</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
