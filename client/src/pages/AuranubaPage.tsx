import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, CalendarCheck, Sparkles, Users, LayoutDashboard } from "lucide-react";
import { Link } from "wouter";

export default function AuranubaPage() {
  const [heroRef, heroInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [featuresRef, featuresInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    document.title = "Auranuba - Gestión de Eventos Inteligente | Q Software Solutions";
    window.scrollTo(0, 0);
  }, []);

  const features = [
    { icon: <CalendarCheck className="h-6 w-6" />, title: "Gestión de Eventos", description: "Planificación, coordinación y seguimiento de eventos de principio a fin" },
    { icon: <Sparkles className="h-6 w-6" />, title: "Personalización IA", description: "Experiencias únicas adaptadas a cada asistente con inteligencia artificial" },
    { icon: <Users className="h-6 w-6" />, title: "Registro de Asistentes", description: "Sistema completo de inscripción, check-in y gestión de invitados" },
    { icon: <LayoutDashboard className="h-6 w-6" />, title: "Dashboard en Vivo", description: "Monitoreo en tiempo real de métricas y KPIs del evento" },
  ];

  const benefits = [
    "Automatización completa del flujo de eventos",
    "Experiencias personalizadas para cada asistente",
    "Check-in digital con código QR",
    "Reportes post-evento con métricas detalladas",
    "Integración con plataformas de pago",
    "Escalable desde eventos pequeños hasta conferencias masivas",
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
                <i className="fas fa-calendar-check text-2xl"></i>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">Auranuba</h1>
            </div>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Sistema inteligente de gestión de eventos y experiencias personalizadas. Crea eventos memorables con tecnología de vanguardia.
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
          <h2 className="text-3xl font-bold mb-4">Crea eventos extraordinarios</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Agenda una demostración y descubre cómo Auranuba puede transformar la gestión de tus eventos.
          </p>
          <Link href="/#contact">
            <Button size="lg">Contáctanos <ArrowRight className="ml-2 h-5 w-5" /></Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
