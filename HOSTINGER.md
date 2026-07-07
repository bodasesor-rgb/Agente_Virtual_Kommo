# Hostinger — configuración EXACTA

## Si NO puedes cambiar el directorio raíz

Hostinger a veces deja el **directorio raíz fijo en `./`**. Este repo ya está preparado para eso: `start.mjs` en la raíz arranca el bundle precompilado que está en `deploy/`.

---

## Configuración en hPanel

| Campo en hPanel | Valor exacto |
|-----------------|--------------|
| Rama | `main` |
| Node | `22.x` |
| **Directorio raíz** | **`./`** (el que venga por defecto — no hace falta cambiarlo) |
| Marco | Other |
| Gestor de paquetes | **npm** (si Hostinger igual usa pnpm, borra caché y redespliega tras mergear este fix) |
| **Comando compilación** | **`npm run build`** |
| **Directorio salida** | **`.`** |
| **Archivo entrada** | **`start.mjs`** |

No uses `pnpm`. El repo **ya no incluye** `pnpm-lock.yaml` ni `pnpm-workspace.yaml` para que Hostinger no intente instalar el monorepo.

El `package.json` de producción **no tiene dependencias** — Lucy corre desde `deploy/` precompilado.

---

## Si ves `ERR_PNPM_FETCH_404` o `@workspace/api-zod`

Hostinger estaba usando **pnpm** por los archivos viejos del monorepo. Tras el último merge a `main`:

1. Redespliega desde `main` (commit reciente)
2. En hPanel confirma gestor **npm**
3. Si persiste, borra el deploy y créalo de nuevo

---

## Variable de entorno obligatoria

| Nombre | Valor |
|--------|--------|
| `OPENAI_API_KEY` | tu key sk-proj-... |

Sin esto el servidor arranca pero Lucy no responde con GPT.

---

## Probar después del deploy

1. `https://TU-DOMINIO.hostingersite.com/` → debe decir **Server running**
2. `https://TU-DOMINIO.hostingersite.com/api/health` → debe decir `"status":"ok"`

---

## Si sigue fallando

En Hostinger abre el deploy fallido → **Registros** → busca líneas **después** del build:

- `FALTA archivo requerido: deploy/index.mjs` → falta la carpeta `deploy/` en el repo (vuelve a desplegar desde `main`)
- `OPENAI_API_KEY` → falta el secret
- `EADDRINUSE` / `PORT` → problema de puerto (raro en Hostinger)

Manda captura de esas líneas (no la key).

---

## Desarrollo local (opcional)

El monorepo para compilar fuentes está en `package.development.json`:

```bash
cp package.development.json package.json
npm install
npm run build:source
npm run sync-deploy
```

Para volver al modo Hostinger: restaura `package.json` desde git (`git checkout package.json package-lock.json`).
