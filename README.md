# Agente Virtual Kommo — Simulador + Lucy (api-server)

Simulador tipo Kommo para probar **Lucy** antes de conectar al CRM real.

## Estructura del repo

```
api-server/          ← Código Lucy de Replit (TypeScript/Express)
app/                 ← Simulador Kommo fake (Python/FastAPI)
static/              ← UI del simulador
```

## Qué incluye el simulador

- Embudo con las 9 etapas de Bodasesor (IDs Kommo donde están en el código)
- Campos con `kommo_field_id` reales (1048774, 1048776, etc.)
- Lead demo Montserrat
- Chat de prueba sin tocar Kommo real

## Simulador Kommo (probar sin CRM real)

Guía completa: **[SIMULADOR.md](./SIMULADOR.md)**

```bash
# Terminal 1 — Lucy
cp package.development.json package.json && npm install && npm run build:source
export OPENAI_API_KEY=sk-proj-...
node api-server/dist/index.mjs

# Terminal 2 — Simulador
pip install -r requirements.txt
export AGENT_WEBHOOK_URL=http://localhost:3000/api/kommo/simulator
./scripts/start-simulator.sh
```

Abre http://localhost:8000 — embudo kanban, chat con Lucy, campos Kommo.

## Arrancar Lucy api-server (Node) — producción Hostinger

**Nota:** el zip trae dependencias de monorepo (`@workspace/db`, `@workspace/api-zod`).
Faltan esos paquetes para correr standalone. Opciones:

1. Mandar también las carpetas `@workspace/db` y root `pnpm-workspace.yaml`
2. O usar el `dist/` precompilado si tienes las env vars

```bash
cd api-server
npm install   # requiere ajustar dependencias workspace
npm run build
npm start
```

Endpoints principales de Lucy:
- `POST /api/kommo/webhook` — mensajes entrantes WhatsApp
- `POST /api/kommo/salesbot` — Salesbot síncrono
- `POST /api/kommo/pipeline-change` — cuando Rodrigo mueve etapa

## Conectar simulador → Lucy

En `.env` del simulador:
```
AGENT_WEBHOOK_URL=http://localhost:3000/api/kommo/salesbot
```

## Qué falta del Repl

| Carpeta / paquete | Estado |
|-------------------|--------|
| `lib/db` (`@workspace/db`) | **Original de Replit** (`lib.zip`) |
| `lib/api-zod` | **Original de Replit** (`lib.zip`) |
| `lib/api-client-react` + `lib/api-spec` | Bonus para `lucy-admin` |
| `package.json` + `pnpm-workspace.yaml` | **Ya integrados** |
| `whatsapp-sender/` | Ya en repo |
| `mockup-sandbox/`, `lucy-admin/` | Opcional (están en `artifacts.zip`) |

### Base de datos — sin DATABASE_URL

Si en Replit **no tienes** `DATABASE_URL`, no pasa nada: Lucy usa una base **local automática** en `data/lucy-pgdata` (PGlite, archivo en disco). No necesitas PostgreSQL ni cuenta externa para probar.

Para producción más adelante puedes usar [Neon](https://neon.tech) o [Supabase](https://supabase.com) gratis y poner:

```
DATABASE_URL=postgresql://...
```

### Arrancar monorepo Lucy

```bash
pnpm install
cd api-server && pnpm run build && PORT=3000 pnpm start
```

No hace falta `drizzle-kit push` en modo local — las tablas se crean solas al arrancar.

