import { useState, useEffect, useCallback } from "react";
import { useInView } from "react-intersection-observer";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { testimonials } from "@/lib/testimonials";

export default function TestimonialsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [titleRef, titleInView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const goToPrevSlide = useCallback(() => {
    const newIndex = currentIndex === 0 ? testimonials.length - 1 : currentIndex - 1;
    setCurrentIndex(newIndex);
  }, [currentIndex]);

  const goToNextSlide = useCallback(() => {
    const newIndex = currentIndex === testimonials.length - 1 ? 0 : currentIndex + 1;
    setCurrentIndex(newIndex);
  }, [currentIndex]);

  // Deslizamiento automático cada 5 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      goToNextSlide();
    }, 5000);

    return () => clearInterval(interval);
  }, [goToNextSlide]);

  return (
    <section id="testimonials" className="py-20 bg-primary-700 text-white">
      <div className="container mx-auto px-6">
        <motion.div
          ref={titleRef}
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={titleInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Testimonios de Clientes</h2>
          <p className="text-lg opacity-80">
            Conoce lo que nuestros clientes dicen sobre trabajar con nosotros.
          </p>
        </motion.div>
        
        {/* Slider de Testimonios */}
        <div className="testimonial-slider relative max-w-4xl mx-auto">
          <div className="overflow-hidden">
            <div className="testimonial-track flex">
              {testimonials.map((testimonial, index) => (
                <div 
                  key={index}
                  className={`testimonial-slide w-full flex-shrink-0 px-4 transition-opacity duration-300 ${
                    index === currentIndex ? "block" : "hidden"
                  }`}
                >
                  <motion.div 
                    className="bg-white bg-opacity-10 backdrop-blur-sm rounded-xl p-8 shadow-lg"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4 }}
                  >
                    <div className="flex items-center mb-6">
                      <div className="text-yellow-400 flex">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className="fill-current h-5 w-5" />
                        ))}
                      </div>
                    </div>
                    <blockquote className="mb-6 text-lg italic">
                      "{testimonial.quote}"
                    </blockquote>
                    <div className="flex items-center">
                      <div className="h-12 w-12 rounded-full bg-primary-200 flex items-center justify-center text-primary-700 font-bold text-xl mr-4">
                        {testimonial.initials}
                      </div>
                      <div>
                        <p className="font-semibold">{testimonial.name}</p>
                        <p className="text-sm opacity-80">{testimonial.title}, {testimonial.company}</p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Controles del Slider */}
          <div className="flex justify-center mt-8 space-x-2">
            {testimonials.map((_, index) => (
              <button
                key={index}
                className={`w-3 h-3 rounded-full bg-white transition-opacity focus:outline-none ${
                  index === currentIndex ? "opacity-100" : "opacity-50"
                }`}
                onClick={() => goToSlide(index)}
                aria-label={`Ir al testimonio ${index + 1}`}
              ></button>
            ))}
          </div>
          
          <button 
            className="absolute top-1/2 left-0 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors focus:outline-none"
            onClick={goToPrevSlide}
            aria-label="Testimonio anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          
          <button 
            className="absolute top-1/2 right-0 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors focus:outline-none"
            onClick={goToNextSlide}
            aria-label="Siguiente testimonio"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </div>
      </div>
    </section>
  );
}
