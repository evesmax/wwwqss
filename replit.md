# QSoftware Solutions - Company Website

## Overview
Corporate website for QSoftware Solutions, a software consulting company based in Guadalajara, Mexico. Built with React (Vite) frontend and Express backend.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter (routing)
- **Backend**: Express.js + TypeScript
- **UI Components**: Radix UI (shadcn/ui), Lucide icons, Font Awesome icons
- **Build**: Vite (client) + esbuild (server)

## Project Structure
```
client/
  src/
    pages/          - Page components (HomePage, product pages, etc.)
    components/     - Reusable components (Navbar, Footer, ServicesSection, etc.)
    lib/            - Data and utilities (services.ts, queryClient.ts)
    assets/         - Images and logos
  public/           - Static files served at root (e.g., qss-comercial-strategy2026.html)
server/
  index.ts          - Express server entry point
  vite.ts           - Vite dev server + static file serving
  routes.ts         - API routes
shared/
  schema.ts         - Shared types (Drizzle ORM)
```

## Routes
- `/` - Homepage
- `/productos/qnexus-control` - QNexus Control product page
- `/productos/qcampus-one` - QCampusOne product page
- `/productos/qnexus-app` - QNexus App product page
- `/productos/holakura` - HolaKura product page
- `/productos/auranuba` - Auranuba product page
- `/qfood` - Q Food Control page
- `/qinventia` - Q Inventia Control page
- `/qprofessional` - Q Professional Services page
- `/qss-comercial-strategy2026.html` - Static commercial strategy page

## Key Features
- Products section with 5 product cards + Software a la Medida
- Social media links (Instagram, Facebook) in Footer and Contact section
- Embedded chat agent widget (qssintelligence.replit.app)
- WhatsApp contact integration
- Responsive design with mobile navigation

## Deployment
- Dev: `npm run dev` (port 5000)
- Build: `npm run build` (Vite + esbuild)
- Production: `npm start` (NODE_ENV=production)
- Deployment target: autoscale (Cloud Run)
