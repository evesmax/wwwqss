# Runbook de migración a Cloud Run

Producto de migrar `wwwqss` de Replit a Google Cloud Run (9 sep 2026). Complementa
el plan de fases de migración (cost/priorización) con los problemas técnicos reales
que aparecieron al ejecutarla. **Actualiza este archivo con cada proyecto nuevo** —
cópialo al repo del siguiente proyecto a migrar y agrega lo que encuentres ahí.

Proyectos en el portafolio que comparten este mismo stack (Vite + Express + TS +
Drizzle + Neon): wwwqss (migrado), Rentia Manager, Trooxer, qfacturahub, qnexusapp,
HolaKura, QPulseMes, NexusTransporte, qcampusone.

---

## Paso 0 — Verificación de dependencias ocultas (hacer PRIMERO, siempre)

El hallazgo más caro de toda la migración: que el código no tenga imports de Replit
**no significa** que los servicios que usa sean tuyos.

- [ ] **¿Quién es dueño de la base de datos?** Entra a console.neon.tech con TU
      cuenta y busca el hostname exacto de `DATABASE_URL`. Si no aparece, la creó
      Replit a su nombre — migrarla es obligatorio antes de apagar Replit, no
      opcional después.
- [ ] **¿Usa `@replit/object-storage`?** Mismo problema de ownership, con archivos
      en vez de filas. Confirma dónde vive el bucket real antes de asumir nada.
- [ ] **¿Hay imports de paquetes de desarrollo a nivel de módulo?**
      `grep -rn "from \"vite\"" server/` — si algo importa `vite` fuera de un
      bloque condicional de desarrollo, el build de producción lo va a necesitar
      igual, aunque nunca se ejecute esa rama.
- [ ] **¿Hay clientes de servicios externos instanciados fuera de una función?**
      `grep -rn "^const.*= new " server/` — un `new GoogleGenAI(...)` a nivel de
      módulo truena el arranque si falta la key, aunque la ruta que lo usa nunca
      se llame.
- [ ] **¿El puerto está hardcodeado?** `grep -n "port" server/index.ts` — si no
      lee `process.env.PORT`, no toques el código: usa `--port=N` en el deploy de
      Cloud Run.
- [ ] **¿Qué session store usa?** Si es `memorystore` (memoria), fija
      `--max-instances=1` en Cloud Run en vez de reescribir código.
- [ ] **¿Existe `.gitignore`?** Créalo *antes* de generar cualquier archivo local
      con credenciales.

---

## Paso 1 — Herramientas locales

```bash
brew install --cask google-cloud-sdk
gcloud auth login
```

> **Gotcha:** Docker Desktop vía `brew install --cask docker` falla pidiendo
> contraseña interactiva de sudo. Instálalo manual desde docker.com (el `.dmg`,
> arrastrar a Aplicaciones, abrir y aceptar permisos ahí).

> **Gotcha:** el navegador no se abre solo en `gcloud auth login` dentro de un
> entorno de agente. Copia la URL impresa y ábrela tú mismo — el redirect a
> `localhost` lo captura igual el proceso que ya está corriendo.

---

## Paso 2 — Proyecto GCP: presupuesto antes que nada

Orden exacto, no cambiarlo: crear proyecto → enlazar billing → **presupuesto** →
recién ahí habilitar APIs que cobran.

```bash
gcloud projects create qss-<NOMBRE> --name="QSS - <NOMBRE>"
gcloud config set project qss-<NOMBRE>
gcloud billing projects link qss-<NOMBRE> --billing-account=<ID>

gcloud services enable billingbudgets.googleapis.com --project=qss-<NOMBRE>
gcloud billing budgets create --billing-account=<ID> \
  --display-name="<NOMBRE> - presupuesto mensual" \
  --budget-amount=10 --filter-projects=projects/qss-<NOMBRE> \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0

gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  --project=qss-<NOMBRE>
gcloud config set run/region us-central1
```

> **Gotcha:** `billingbudgets.googleapis.com` no está habilitada por default — el
> primer intento de crear presupuesto falla y da la URL para habilitarla.
> Habilítala y reintenta.

---

## Paso 3 — Dockerfile: los dos errores que sí importan

```dockerfile
# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

> **CRÍTICO:** `ENV NODE_ENV=production` antes de `npm ci` hace que npm omita
> devDependencies, sin importar si quitaste `--omit=dev` del comando. Va
> *después* del install, nunca antes — este orden causó el primer crash real
> (`Cannot find package 'vite'`).

> **Gotcha:** si el build corre en Mac Apple Silicon, la imagen sale en `arm64` y
> Cloud Run la rechaza (`must support amd64/linux`). Construir siempre con
> `docker buildx build --platform linux/amd64 ...`.

---

## Paso 4 — Prueba local antes de tocar la nube

```bash
docker build -t <app>:local .
docker run -d --name <app>-test \
  --env-file conn.env.docker \
  -e SESSION_SECRET="$(openssl rand -base64 32)" \
  -p 5050:5000 \
  <app>:local
docker logs <app>-test
```

Si arranca y responde 200 en `/`, ya validaste el build completo gratis, antes de
gastar un solo segundo de Cloud Run.

---

## Paso 5 — Secrets + permisos mínimos

```bash
grep "^DATABASE_URL=" conn.env.docker | cut -d= -f2- | \
  gcloud secrets create DATABASE_URL --data-file=- --project=qss-<NOMBRE>

PROJECT_NUMBER=$(gcloud projects describe qss-<NOMBRE> --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" --project=qss-<NOMBRE>
```

Extrae valores directo del archivo local con `grep | cut` hacia un pipe — nunca
los imprimas en pantalla para copiarlos a mano.

---

## Paso 6 — Deploy a Cloud Run

```bash
gcloud run deploy <app> \
  --image=us-central1-docker.pkg.dev/qss-<NOMBRE>/<app>/web:v1 \
  --region=us-central1 --port=5000 --allow-unauthenticated \
  --min-instances=0 --max-instances=1 --memory=512Mi --cpu=1 \
  --set-secrets="DATABASE_URL=DATABASE_URL:latest,SESSION_SECRET=SESSION_SECRET:latest"
```

`min-instances=0` (paga solo si hay visitas) + `max-instances=1` (evita el
problema de sesiones en memoria sin tocar código) es el default correcto para
cualquiera de estos proyectos de tráfico bajo.

---

## Paso 7 — Dominio y DNS

> **CRÍTICO:** antes de cambiar cualquier registro, `gcloud dns record-sets list
> --zone=<zona>` y busca **registros MX**. Si hay correo (Google Workspace), esos
> registros no se tocan bajo ninguna circunstancia.

La zona DNS puede no estar en el proyecto GCP recién creado — búscala en *todos*
los proyectos existentes: `gcloud dns managed-zones list --project=<cada uno>`.

1. Verificar dueño del dominio: `gcloud domains verify <dominio>` → agregar el TXT
   que dé Search Console **sin borrar** el TXT que ya exista (un nombre puede
   tener varios valores TXT a la vez).
2. Crear el mapeo: `gcloud beta run domain-mappings create --service=<app>
   --domain=<dominio> --region=us-central1` → da las IPs/CNAME exactos que pide.
3. Apex (dominio raíz): registros **A + AAAA**. Subdominios (`www`): **CNAME** a
   `ghs.googlehosted.com.`
4. Aplicar los registros nuevos.

> **Gotcha:** un CNAME no puede coexistir con ningún otro tipo de registro en el
> mismo nombre. Si el subdominio ya tiene un TXT de verificación de Replit, hay
> que quitarlo en la misma transacción en la que se agrega el CNAME, o la
> transacción entera falla.

> **Gotcha:** justo después de emitir el certificado es normal ver fallas SSL
> intermitentes por unos minutos mientras el borde global de Google propaga el
> cert a todos sus nodos. No es un error de configuración — esperar y reintentar.

> **Gotcha:** si el `curl` del sistema en Mac muestra `SSL_ERROR_SYSCALL` de
> forma intermitente, es LibreSSL negociando HTTP/2 de forma inconsistente — un
> problema del cliente local, no del servidor. Probar con `--http1.1` o
> simplemente reintentar.

---

## Paso 8 — CI/CD sin llaves estáticas

Workload Identity Federation en vez de exportar una llave JSON de service
account — GitHub se autentica por cada corrida, sin secreto de larga duración
que se pueda filtrar.

```bash
gcloud iam service-accounts create github-deployer --project=qss-<NOMBRE>
# roles: run.developer, artifactregistry.writer, serviceAccountUser (sobre la SA de runtime)

gcloud iam workload-identity-pools create github-pool --location=global
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global --workload-identity-pool=github-pool \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="attribute.repository=='<usuario>/<repo>'" \
  --issuer-uri="https://token.actions.githubusercontent.com"
```

> **Gotcha:** una service account recién creada tarda unos segundos en
> propagarse — si el siguiente `add-iam-policy-binding` falla con "does not
> exist", solo reintentar.

El workflow de GitHub Actions solo necesita re-especificar `--image` en cada
deploy — Cloud Run conserva la config previa (puerto, secrets, min/max
instancias) de la revisión anterior.

---

## Paso 9 — Migrar el dueño de la base de datos

Si el Paso 0 encontró que la base es de Replit, no tuya, esto no es opcional.

```bash
pg_dump "$SRC_URL" -Fc --no-owner --no-acl -f /tmp/backup.dump
pg_restore -d "$DST_URL" --no-owner --no-acl -v /tmp/backup.dump

# verificar antes de confiar en la migración:
psql "$SRC_URL" -t -c "SELECT 'tabla', count(*) FROM tabla ..."
psql "$DST_URL" -t -c "SELECT 'tabla', count(*) FROM tabla ..."

# apuntar Cloud Run a la base nueva (una versión nueva del secret no basta,
# Cloud Run resuelve el secret al crear la revisión, no en vivo):
echo "$DST_URL" | gcloud secrets versions add DATABASE_URL --data-file=-
gcloud run services update <app> --region=us-central1 \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest"
```

> **CRÍTICO:** comparar conteos de filas tabla por tabla entre origen y destino
> antes de dar por buena la migración — no asumir que `pg_restore` sin errores
> significa datos completos.

Borrar el archivo de dump local al terminar — es un snapshot completo de datos
de producción, no debe quedar suelto en `/tmp`.

---

## Paso 10 — Apagar Replit

En cuanto la base de datos nueva esté verificada y Cloud Run la esté usando,
**pausar Replit de inmediato** — no esperar la semana de respaldo planeada
originalmente. Una vez que hay dos bases distintas, dejar Replit activo es un
riesgo real de que alguien escriba ahí datos que nunca se van a sincronizar.

---

## Referencia rápida de síntomas

| Síntoma | Causa | Solución |
|---|---|---|
| `Cannot find package 'vite'` | `NODE_ENV=production` antes del install | Mover el `ENV` después de `npm ci` |
| `must support amd64/linux` | Build en Mac Apple Silicon (arm64) | `docker buildx build --platform linux/amd64` |
| `API key must be set` al arrancar | Cliente externo instanciado a nivel de módulo | Volverlo condicional/lazy dentro de la función |
| `MemoryStore is not designed for production` | Sesiones en memoria, normal en apps chicas | `--max-instances=1` en vez de reescribir código |
| Transacción DNS falla con "already exists" | Ya hay un TXT en ese nombre | Reemplazar el set completo (viejo + nuevo valor) |
| Transacción DNS falla por CNAME | Coexiste con otro tipo de registro | Quitar el otro registro en la misma transacción |
| `SSL_ERROR_SYSCALL` intermitente, cert recién emitido | Propagación del cert en el borde de Google | Esperar unos minutos, es normal |
| `SSL_ERROR_SYSCALL` con curl de Mac, servidor sano | LibreSSL negociando HTTP/2 | `curl --http1.1` |
| IAM binding falla "does not exist" recién creada la SA | Propagación (eventual consistency) | Reintentar en unos segundos |
| Acción de gcloud bloqueada por el modo automático | Cambia IAM o DNS en vivo | Autorizar explícitamente — la salvaguarda funcionando bien |

---

## Estado de los proyectos restantes

| Proyecto | Object storage propio de Replit | Riesgo | Estado |
|---|---|---|---|
| wwwqss | No | Bajo | ✅ Migrado |
| Rentia Manager | No detectado | Bajo | Siguiente |
| Trooxer | No detectado | Medio | Pendiente |
| qfacturahub | No detectado | Medio-alto (fiscal) | Pendiente |
| qnexusapp | Sin confirmar | Medio | Pendiente |
| HolaKura | **Sí, en uso real** | Medio-alto | Requiere migrar storage |
| QPulseMes | **Sí, en uso real** | Alto | Requiere migrar storage |
| NexusTransporte | **Sí, en uso real** | Alto | Requiere migrar storage |
| qcampusone | Sí, por confirmar en main | Más alto | Requiere migrar storage |

Para los cuatro con object storage: aplica la misma lógica del Paso 0 y el Paso
9 — primero confirmar de quién es el bucket, luego escribir un script que
descargue cada objeto y lo suba al destino nuevo antes de tocar el código.

---

*Escrito a partir de la migración real de wwwqss el 9 de septiembre de 2026.
Actualizar con cada proyecto nuevo — los gotchas que aparezcan en Trooxer o
qfacturahub probablemente se repitan en los que siguen.*
