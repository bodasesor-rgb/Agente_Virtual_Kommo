# Hostinger — pasos si sigue fallando

## Desplegar automáticamente (recomendado)

El repo incluye `.github/workflows/deploy-hostinger.yml` que redespliega en cada push a `main`.

Configura **uno** de estos secrets en GitHub → Settings → Secrets → Actions:

| Secret | Dónde obtenerlo |
|--------|-----------------|
| `HOSTINGER_WEBHOOK_URL` | hPanel → Avanzado → Git → Auto Deployment → copiar webhook |
| `HOSTINGER_API_TOKEN` | hPanel → Perfil → API → crear token |

O desde tu máquina (con el token):

```bash
HOSTINGER_API_TOKEN=xxx npm run deploy:hostinger
```

Tras el deploy, `/api/health` debe mostrar `"version":"3.3"` y `"lucy_prompt":"V7"`.

---

Significa que **Lucy no arrancó** (proceso caído). Causas más comunes:

### A) Falta `OPEN_AI` en Hostinger

En hPanel → Node.js → **Variables de entorno**:

| Nombre | Valor |
|--------|-------|
| **`OPEN_AI`** | `sk-proj-...` (tu key completa, sin comillas) |

Guarda y **redespliega**.

### B) Deploy viejo o fallido

1. GitHub → rama `main` actualizada
2. Hostinger → Redesplegar
3. Revisa **Registros** del deploy — busca `Missing credentials` o `FALTA archivo`

### C) Comprobar que Lucy vive

Cuando funcione, esto debe responder JSON (no 503):

`https://TU-DOMINIO.hostingersite.com/api/health`

```json
{"status":"ok","openai_configured":true,...}
```

Si `openai_configured` es `false`, la key no llegó — revisa el nombre **`OPEN_AI`**.

---

El fix está en `main`. En GitHub → commits, debe existir:
- `start.mjs` en la raíz
- **NO** debe existir `pnpm-lock.yaml`

Si ves `pnpm-lock.yaml` en el repo de Hostinger, estás en un commit viejo.

---

## 2. Configuración exacta en hPanel

| Campo | Valor |
|-------|-------|
| Rama | `main` |
| Node | `22.x` |
| Directorio raíz | `./` |
| Gestor de paquetes | **npm** |
| Comando compilación | **npm run build** |
| Directorio salida | `.` |
| Archivo entrada | **start.mjs** |

Variable de entorno obligatoria en Hostinger:

| Nombre | Valor |
|--------|-------|
| **`OPEN_AI`** | `sk-proj-...` (tu key de OpenAI) |

Opcional — catálogo PDF (Google Drive):

| Nombre | Valor |
|--------|-------|
| `GOOGLE_DRIVE_CATALOG_FOLDER_ID` | ID de la carpeta Drive (default ya apunta a `Catalogó bodasesor 2026 finales`) |
| `GOOGLE_DRIVE_PDF_DISABLED` | `1` para apagar el índice PDF |
| `DRIVE_PDF_REFRESH_MINUTES` | Intervalo de refresco (default `60`) |

### Columna Sinónimos en Google Sheet

En el Sheet de precios puedes agregar una columna **`Sinonimos`** (o `Sinónimos`) con frases separadas por coma.
Lucy las lee al refrescar el catálogo y las combina con los sinónimos default del código
(tacos→taquiza, comida japonesa→sushi, open bar→barra de bebidas, etc.).

También acepta `OPENAI_API_KEY` si prefieres ese nombre.

---

## 3. Si el log sigue mostrando PNPM

Hostinger tiene caché del deploy anterior.

**Haz esto (en orden):**

1. En hPanel → tu sitio Node.js → **borrar / eliminar** la aplicación Node
2. Crear **nueva** aplicación Node.js conectada al mismo repo
3. Rama `main`, gestor **npm**, entrada `start.mjs`
4. Añadir `OPENAI_API_KEY` antes de desplegar
5. Desplegar

---

## 4. Log correcto (debe verse así)

```
npm ci
up to date, audited 1 package
npm run build
ok
[start] Archivos OK, arrancando Lucy desde deploy/...
Server listening
```

**Mal** (commit viejo o caché pnpm):

```
Scope: all 7 workspace projects
ERR_PNPM_FETCH_404 @workspace/api-zod
```

---

## 5. Probar que Lucy responde

- `https://TU-DOMINIO.hostingersite.com/` → redirige al **simulador de pruebas**
- `https://TU-DOMINIO.hostingersite.com/simulator` → interfaz tipo Kommo (también `/simulador`)
- `https://TU-DOMINIO.hostingersite.com/api/health` → `"status":"ok"`

---

## 6. Si falla en el ARRANQUE (después del build)

Busca en registros:

| Mensaje | Solución |
|---------|----------|
| `FALTA archivo requerido: deploy/index.mjs` | Repo incompleto — verifica carpeta `deploy/` en GitHub |
| `OPENAI_API_KEY` / `Missing credentials` | Añade la variable en Hostinger → Environment |
| `EADDRINUSE` | Puerto ocupado — contacta soporte Hostinger |

Manda captura del log **después** de `npm run build` (sin mostrar la API key).

---

## 7. Que Lucy no se duerma (24/7 en Hostinger)

Hostinger **suspende** apps Node sin tráfico HTTP **externo**. El ping interno cada 3 min (en `index.ts`) solo ayuda si el proceso ya está vivo; **no** evita que Hostinger lo apague.

### Solución recomendada: GitHub Actions (incluido en el repo)

Workflow **Keep Alive Hostinger** → `GET /api/health` cada **5 minutos** desde GitHub.

1. GitHub → **Actions** → *Keep Alive Hostinger* → debe correr en verde cada 5 min.
2. Si cambias de dominio: Settings → Variables → `LUCY_PUBLIC_URL` = `https://TU-DOMINIO.hostingersite.com`

### Alternativa: UptimeRobot (gratis)

Monitor HTTP cada **5 min** a:

`https://TU-DOMINIO.hostingersite.com/api/health`

### hPanel

La app Node debe estar en **Run** (no detenida).

### Cómo detectar cold start

En `/api/health`, campo `uptime` (segundos desde arranque):

- Muy bajo en cada visita → Lucy se estaba durmiendo.
- Miles de segundos → lleva horas despierta.

### Opcional en Hostinger

`KEEP_ALIVE_PUBLIC_URL=https://TU-DOMINIO.hostingersite.com` — ping público extra desde el servidor (complemento; lo crítico es GitHub o UptimeRobot).
