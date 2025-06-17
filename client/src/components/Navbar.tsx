import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, ChevronDown } from "lucide-react";
// Importamos el nuevo logo de Q Software Solutions
// @ts-ignore
import logoImage from "../assets/QwLogo.jpg";

const navLinks = [
  { href: "#home", label: "Inicio" },
  { href: "#services", label: "Servicios" },
  { href: "#why-us", label: "Por Qué Elegirnos" },
];

const solutionsProducts = [
  { 
    name: "Q Nexus Control", 
    href: "https://qnexuscontrol.com/", 
    external: true,
    description: "Software especializado para el control de flotillas de transporte"
  },
  { 
    name: "Q Inventia Control", 
    href: "/qinventia", 
    external: true,
    description: "Software de administración de inventarios"
  },
  { 
    name: "Q Food Control", 
    href: "/qfood", 
    external: true,
    description: "Software para administración de restaurantes"
  },
  { 
    name: "Q Professional Services", 
    href: "/qprofessional", 
    external: true,
    description: "Servicios de diseño y personalización de software a la medida"
  },
];

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [solutionsDropdownOpen, setSolutionsDropdownOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  // Cerrar el menú móvil cuando se hace clic en un enlace
  const handleNavLinkClick = () => {
    if (isMenuOpen) {
      setIsMenuOpen(false);
    }
  };

  // Añadir sombra a la barra de navegación al desplazarse
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 10) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <header className={`fixed w-full bg-white z-50 transition-shadow duration-300 ${scrolled ? "shadow-md" : "shadow-sm"}`}>
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center -ml-2">
            <Link href="/" className="flex items-center">
              <img src={logoImage} alt="QSoftware Solutions Logo" className="h-12 md:h-14 object-contain" />
            </Link>
          </div>
          
          {/* Navegación de Escritorio */}
          <nav className="hidden md:flex space-x-10 items-center">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-lg font-medium hover:text-primary transition-all duration-300 hover:scale-105 hover:shadow-sm relative group"
                onClick={handleNavLinkClick}
              >
                {link.label}
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 -mb-1"></span>
              </a>
            ))}
            
            {/* Menú desplegable Soluciones */}
            <div 
              className="relative"
              onMouseEnter={() => setSolutionsDropdownOpen(true)}
              onMouseLeave={() => setSolutionsDropdownOpen(false)}
            >
              <button
                className="text-lg font-medium hover:text-primary transition-all duration-300 hover:scale-105 flex items-center relative group"
                onClick={() => setSolutionsDropdownOpen(!solutionsDropdownOpen)}
              >
                Soluciones
                <ChevronDown className={`ml-1 h-4 w-4 transition-all duration-300 ${solutionsDropdownOpen ? 'rotate-180' : ''} group-hover:scale-110`} />
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 -mb-1"></span>
              </button>
              
              {/* Dropdown */}
              {solutionsDropdownOpen && (
                <div 
                  className="absolute top-full left-0 pt-2 w-80 z-50"
                >
                  <div className="bg-white rounded-lg shadow-lg border border-gray-200 py-2">
                    {solutionsProducts.map((product) => (
                      <a
                        key={product.href}
                        href={product.href}
                        target={product.external ? "_blank" : "_self"}
                        rel={product.external ? "noopener noreferrer" : undefined}
                        className="block px-4 py-3 hover:bg-gray-50 transition-all duration-300 group hover:scale-[1.02] hover:shadow-sm"
                        onClick={() => setSolutionsDropdownOpen(false)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 group-hover:text-[#00aeef] transition-colors">
                              {product.name}
                              {product.external && <span className="ml-1 text-xs">↗</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {product.description}
                            </div>
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <a
              href="#contact"
              className="text-lg font-medium hover:text-primary transition-all duration-300 hover:scale-105 hover:shadow-sm relative group"
              onClick={handleNavLinkClick}
            >
              Contacto
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary transform scale-x-0 transition-transform duration-300 group-hover:scale-x-100 -mb-1"></span>
            </a>
          </nav>
          
          <div className="hidden md:block">
            <Button asChild className="bg-primary text-white hover:bg-[#474747] transition-all duration-300 hover:scale-105 hover:shadow-lg transform">
              <a href="https://wa.me/523334655385" target="_blank" rel="noopener noreferrer">Contáctanos</a>
            </Button>
          </div>
          
          {/* Botón del menú móvil */}
          <div className="md:hidden flex items-center">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleMenu}
              aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
        
        {/* Navegación Móvil */}
        {isMenuOpen && (
          <nav className="md:hidden mt-4 pb-4">
            <div className="flex flex-col space-y-4">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className={`font-medium hover:text-primary transition-colors ${
                    link.label === "Inicio" ? "text-lg" : "text-base"
                  }`}
                  onClick={handleNavLinkClick}
                >
                  {link.label}
                </a>
              ))}
              
              {/* Menú Soluciones móvil */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-500 mb-2">Soluciones</p>
                {solutionsProducts.map((product) => (
                  <a
                    key={product.href}
                    href={product.href}
                    target={product.external ? "_blank" : "_self"}
                    rel={product.external ? "noopener noreferrer" : undefined}
                    className="block hover:text-primary transition-colors py-2 pl-4"
                    onClick={handleNavLinkClick}
                  >
                    <div className="text-base font-medium">
                      {product.name}
                      {product.external && <span className="ml-1 text-xs">↗</span>}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {product.description}
                    </div>
                  </a>
                ))}
              </div>
              
              <Button asChild className="w-full mt-2 bg-primary text-white hover:bg-[#474747]">
                <a href="https://wa.me/523334655385" target="_blank" rel="noopener noreferrer" onClick={handleNavLinkClick}>Contáctanos</a>
              </Button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
}
