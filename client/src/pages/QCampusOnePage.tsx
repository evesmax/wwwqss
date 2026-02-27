import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ArrowRight, Check, GraduationCap, Users, BookOpen, Calendar } from "lucide-react";
import { Link } from "wouter";

export default function QCampusOnePage() {
  const [heroRef, heroInView] = useInView({ triggerOnce: true, threshold: 0.1 });
  const [featuresRef, featuresInView] = useInView({ triggerOnce: true, threshold: 0.1 });

  useEffect(() => {
    document.title = "QCampusOne - Gestión Académica Integral | Q Software Solutions";
    window.scrollTo(0, 0);
  }, []);

  const features = [
    { icon: <GraduationCap className="h-6 w-6" />, title: "Gestión Académica", description: "Control completo de planes de estudio, calificaciones y evaluaciones" },
    { icon: <Users className="h-6 w-6" />, title: "Administración Escolar", description: "Inscripciones, matrículas y gestión de estudiantes centralizada" },
    { icon: <BookOpen className="h-6 w-6" />, title: "Portal Educativo", description: "Plataforma para alumnos, profesores y padres de familia" },
    { icon: <Calendar className="h-6 w-6" />, title: "Horarios y Asistencia", description: "Programación inteligente de horarios y control de asistencia" },
  ];

  const benefits = [
    "Digitalización completa de procesos académicos",
    "Comunicación directa con padres de familia",
    "Reportes de desempeño estudiantil automatizados",
    "Control financiero de colegiaturas y pagos",
    "Accesible desde cualquier dispositivo",
    "Soporte y capacitación incluidos",
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
                <i className="fas fa-graduation-cap text-2xl"></i>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold">QCampusOne</h1>
            </div>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              Sistema completo de gestión académica y administrativa para instituciones educativas. Transforma la experiencia educativa con tecnología.
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
          <h2 className="text-3xl font-bold mb-4">Moderniza tu institución educativa</h2>
          <p className="text-gray-600 mb-8 max-w-xl mx-auto">
            Agenda una demostración personalizada y descubre cómo QCampusOne puede transformar tu gestión académica.
          </p>
          <Link href="/#contact">
            <Button size="lg">Contáctanos <ArrowRight className="ml-2 h-5 w-5" /></Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
