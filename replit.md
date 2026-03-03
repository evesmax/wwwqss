# QSoftware Solutions - Company Website

## Overview
Corporate website for QSoftware Solutions, a software consulting company based in Guadalajara, Mexico. Built with React (Vite) frontend and Express backend. Includes an admin panel with RBAC access control and Gemini AI assistant.

## Tech Stack
- **Frontend**: React + TypeScript, Vite, Tailwind CSS, Framer Motion, Wouter (routing)
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
    pages/admin/    - Admin panel (AdminApp, AdminLayout, RolesPage, UsersPage, GeminiChat, etc.)
    components/     - Reusable components (Navbar, Footer, ServicesSection, etc.)
    lib/            - Data and utilities (services.ts, queryClient.ts)
    assets/         - Images and logos
  public/           - Static files served at root
server/
  index.ts          - Express server entry point
  vite.ts           - Vite dev server + static file serving
  routes.ts         - API routes (auth, admin CRUD, chat)
  auth.ts           - Authentication helpers (password hashing, RBAC, seed)
  db.ts             - Database connection (Neon + Drizzle)
  replit_integrations/ - Gemini AI integration modules
shared/
  schema.ts         - Drizzle ORM schema (users, roles, permissions, conversations, messages)
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

### Admin Panel
- `/admin` - Admin login / redirect to roles
- `/admin/roles` - Roles & permissions CRUD
- `/admin/users` - Users CRUD

### API
- `POST /api/auth/login` - Login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user session
- `PUT /api/auth/password` - Change password
- `GET/POST/PUT/DELETE /api/admin/users` - Users CRUD
- `GET/POST/PUT/DELETE /api/admin/roles` - Roles CRUD
- `GET/POST /api/admin/permissions` - Permissions
- `POST /api/admin/chat` - Gemini AI chat (streaming SSE)

## Admin Panel
- **Default credentials**: admin / admin123
- **RBAC**: Users, Roles, Permissions with many-to-many relationships
- **Sidebar**: Collapsible, shows user profile and role at bottom
- **Gemini Chat**: Draggable AI assistant window, context-aware about admin features
- **Password Change**: Modal accessible from sidebar

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
