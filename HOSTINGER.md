# Hostinger — pasos si sigue fallando

## Error 503 en el sitio

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
