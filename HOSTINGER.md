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
| Gestor de paquetes | npm |
| **Comando compilación** | **`npm run build`** (Hostinger solo permite esto o dejarlo vacío — elige `npm run build`) |
| **Directorio salida** | **`.`** |
| **Archivo entrada** | **`start.mjs`** |

No uses `pnpm`. No compiles en el servidor (`npm run build:source` es solo para desarrollo local).

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

```bash
npm install
npm run build:source    # compila api-server
npm run sync-deploy     # copia dist/ → deploy/
npm run start:dev       # arranca sin pasar por deploy/
```

En producción Hostinger ejecuta `npm run build`, que en este repo solo imprime `ok` (no compila nada; el código ya viene precompilado en `deploy/`). Luego arranca con `start.mjs`.
