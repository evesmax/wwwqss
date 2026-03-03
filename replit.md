# QSoftware Solutions - Company Website

## Overview
Corporate website for QSoftware Solutions, a software consulting company based in Guadalajara, Mexico. Built with React (Vite) frontend and Express backend. Includes an admin panel with RBAC access control, Gemini AI assistant, and catalog management module.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter v3 (routing with nesting)
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (Neon Serverless) + Drizzle ORM
- **UI Components**: Radix UI (shadcn/ui), Lucide icons, Font Awesome icons
- **AI**: Gemini (via Replit AI Integrations) for admin chat assistant
- **Build**: Vite (client) + esbuild (server)

## Project Structure
```
client/
  src/
    pages/          - Page components (HomePage, product pages, etc.)
    pages/admin/    - Admin panel (AdminApp, AdminLayout, RolesPage, UsersPage, GeminiChat, catalog pages)
    components/     - Reusable components (Navbar, Footer, ServicesSection, etc.)
    lib/            - Data and utilities (services.ts, queryClient.ts)
    assets/         - Images and logos
  public/           - Static files served at root
server/
  index.ts          - Express server entry point
  vite.ts           - Vite dev server + static file serving
  routes.ts         - API routes (auth, admin CRUD, chat)
  catalogRoutes.ts  - Catalog module API routes (tipos negocio, clientes, etapas, productos, kpis)
  auth.ts           - Authentication helpers (password hashing, RBAC, seed)
  db.ts             - Database connection (Neon + Drizzle)
  replit_integrations/ - Gemini AI integration modules
shared/
  schema.ts         - Drizzle ORM schema (users, roles, permissions, catalogs)
  models/chat.ts    - Chat-related Drizzle schema
```

## Routes
### Public
- `/` - Homepage
- `/productos/qnexus-control` - QNexus Control product page
- `/productos/qcampus-one` - QCampusOne product page
- `/productos/qnexus-app` - QNexus App product page
- `/productos/holakura` - HolaKura product page
- `/productos/auranuba` - Auranuba product page
- `/qfood` - Q Food Control page
- `/qinventia` - Q Inventia Control page
- `/qprofessional` - Q Professional Services page

### Admin Panel (uses wouter v3 nesting under `/admin`)
- `/admin` - Admin login / redirect to roles
- `/admin/roles` - Roles & permissions CRUD
- `/admin/users` - Users CRUD
- `/admin/catalogs/tipos-negocio` - Tipos de Negocio catalog
- `/admin/catalogs/clientes` - Clientes catalog (with metadata key-value)
- `/admin/catalogs/etapas-venta` - Etapas de Venta catalog
- `/admin/catalogs/productos` - Productos catalog (multi tipos de negocio)
- `/admin/catalogs/kpis` - KPIs catalog

### API
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user session
- `PUT /api/auth/password` - Change password
- `GET/POST/PUT/DELETE /api/admin/users` - Users CRUD
- `GET/POST/PUT/DELETE /api/admin/roles` - Roles CRUD
- `GET/POST /api/admin/permissions` - Permissions
- `POST /api/admin/chat` - Gemini AI chat (streaming SSE)
- `GET/POST/PUT/DELETE /api/catalog/tipos-negocio` - Tipos de Negocio
- `GET/POST/PUT/DELETE /api/catalog/clientes` - Clientes
- `GET/POST/PUT/DELETE /api/catalog/etapas-venta` - Etapas de Venta
- `GET/POST/PUT/DELETE /api/catalog/productos` - Productos (includes tiposNegocio relation)
- `GET/POST/PUT/DELETE /api/catalog/kpis` - KPIs

## Database Tables
### Auth/RBAC
- `users` - System users
- `roles` - User roles
- `permissions` - System permissions
- `role_permissions` - Role-permission M:N
- `user_roles` - User-role M:N

### Catalogs
- `tipos_negocio` - Business type catalog (id, codigo, nombre, descripcion)
- `clientes` - Clients (id, codigo, tipo[Prospecto/Cliente], nombre_negocio, tipo_negocio_id FK, nombre_contacto, telefono_contacto, metadata JSONB)
- `etapas_venta` - Sales stages (id, codigo_etapa, etapa, descripcion, inicial, final)
- `productos` - Products (id, codigo_producto, nombre, descripcion, precio)
- `producto_tipos_negocio` - Product-TipoNegocio M:N
- `kpis` - KPIs (id, codigo_kpi, kpi, descripcion, valor)

## Admin Panel
- **Default credentials**: admin / admin123
- **RBAC**: Users, Roles, Permissions with many-to-many relationships
- **Sidebar**: Collapsible, shows user profile and role at bottom, "Catálogos" submenu with expandable items
- **Gemini Chat**: Draggable AI assistant window, context-aware about admin features
- **Password Change**: Modal accessible from sidebar
- **Catálogos Module**: Full CRUD for Tipos de Negocio, Clientes (with metadata key-value pairs), Etapas de Venta, Productos (with multi tipos de negocio), KPIs

## Key Features
- Products section with 5 product cards + Software a la Medida
- Social media links (Instagram, Facebook) in Footer and Contact section
- Embedded chat agent widget (qssintelligence.replit.app)
- WhatsApp contact integration
- Responsive design with mobile navigation
- Admin panel with RBAC access control

## Deployment
- Dev: `npm run dev` (port 5000)
- Build: `npm run build` (Vite + esbuild)
- Production: `npm start` (NODE_ENV=production)
- Deployment target: autoscale (Cloud Run)
