import { Helmet } from "react-helmet-async";

const BASE_URL = "https://qsoftwaresolutions.com";
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;
const SITE_NAME = "Q Software Solutions";

interface SEOProps {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: "website" | "article";
  jsonLd?: object;
}

export function SEO({ title, description, path = "", image = DEFAULT_IMAGE, type = "website", jsonLd }: SEOProps) {
  const canonical = `${BASE_URL}${path}`;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />

      {/* Open Graph */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="es_MX" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* JSON-LD */}
      {jsonLd && (
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      )}
    </Helmet>
  );
}

export const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Q Software Solutions",
  url: BASE_URL,
  logo: `${BASE_URL}/logo.png`,
  description: "Empresa de consultoría de software e innovación tecnológica en Guadalajara, México.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Guadalajara",
    addressRegion: "Jalisco",
    addressCountry: "MX",
  },
  sameAs: [
    "https://www.instagram.com/qsoftwaresolutions",
    "https://www.facebook.com/qsoftwaresolutions",
  ],
};

export function softwareJsonLd(name: string, description: string, url: string, category: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description,
    url,
    applicationCategory: category,
    operatingSystem: "Web, iOS, Android",
    offers: { "@type": "Offer", priceCurrency: "MXN", availability: "https://schema.org/InStock" },
    publisher: {
      "@type": "Organization",
      name: "Q Software Solutions",
      url: BASE_URL,
    },
  };
}
