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

## Arrancar simulador (Python)

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Abre: http://localhost:8000

## Arrancar Lucy api-server (Node)

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
| `lib/db` (`@workspace/db`) | **Recreado aquí** desde el uso en Lucy (no hace falta buscarlo en Replit) |
| `lib/api-zod` | **Recreado aquí** (mínimo para health check) |
| `package.json` + `pnpm-workspace.yaml` | **Ya integrados** |
| `whatsapp-sender/` | Ya en repo |
| `mockup-sandbox/`, `lucy-admin/` | Opcional (están en `artifacts.zip`) |

### Arrancar monorepo Lucy

```bash
# Requiere PostgreSQL local (o DATABASE_URL de Replit)
pnpm install
cd lib/db && pnpm exec drizzle-kit push   # crea tablas
cd ../../api-server && pnpm run build && pnpm start
```

