import { Link } from "wouter";
import { MapPin, Phone, Mail } from "lucide-react";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="container mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12">
          <div>
            <Link href="/" className="text-2xl font-bold text-white mb-6 inline-block">
              <span className="text-primary">QSoftware</span>
              <span className="ml-1">Solutions</span>
            </Link>
            <p className="text-gray-400 mb-6">
              Desarrollamos soluciones de software únicas y eficientes, a la vanguardia de la innovación.
            </p>
            <div className="flex space-x-4">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <i className="fab fa-linkedin-in"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <i className="fab fa-twitter"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <i className="fab fa-facebook-f"></i>
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <i className="fab fa-instagram"></i>
              </a>
            </div>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-6 text-white">Enlaces Rápidos</h3>
            <ul className="space-y-3">
              <li><a href="#home" className="text-gray-400 hover:text-white transition-colors">Inicio</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Servicios</a></li>
              <li><a href="#why-us" className="text-gray-400 hover:text-white transition-colors">Por Qué Elegirnos</a></li>
              <li><a href="#testimonials" className="text-gray-400 hover:text-white transition-colors">Testimonios</a></li>
              <li><a href="#contact" className="text-gray-400 hover:text-white transition-colors">Contacto</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-6 text-white">Servicios</h3>
            <ul className="space-y-3">
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Gestión de Flotas</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Control Logístico</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Automatización de Transporte</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Rastreo GPS</a></li>
              <li><a href="#services" className="text-gray-400 hover:text-white transition-colors">Análisis de Rutas</a></li>
            </ul>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-6 text-white">Información de Contacto</h3>
            <ul className="space-y-3">
              <li className="flex items-start">
                <MapPin className="h-5 w-5 mt-1 mr-3 text-primary-400" />
                <span className="text-gray-400">Guadalajara, Jalisco</span>
              </li>

              <li className="flex items-start">
                <Mail className="h-5 w-5 mt-1 mr-3 text-primary-400" />
                <span className="text-gray-400">contacto@qsoftwaresolutions.com</span>
              </li>
              <li className="flex items-start">
                <svg className="h-5 w-5 mt-1 mr-3 text-primary-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.893 3.685"/>
                </svg>
                <span className="text-gray-400">+52 3334655385</span>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-gray-400 text-sm">
            © {currentYear} QSoftware Solutions. Todos los derechos reservados.
          </p>
          <div className="mt-4 md:mt-0">
            <a href="#" className="text-gray-400 hover:text-white text-sm mx-3 transition-colors">Política de Privacidad</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm mx-3 transition-colors">Términos de Servicio</a>
            <a href="#" className="text-gray-400 hover:text-white text-sm mx-3 transition-colors">Política de Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
