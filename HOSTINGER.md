# Hostinger — configuración EXACTA

## Lo que ves en el log (tsconfig warnings) NO es error

Si al final dice `Done in 348ms` → **el build sí pasó**.  
El problema suele ser **cómo arranca** o **qué carpeta usa Hostinger**.

---

## USA LA CARPETA `deploy` (sin compilar)

| Campo en hPanel | Valor exacto |
|-----------------|--------------|
| Rama | `main` |
| Node | `22.x` |
| **Directorio raíz** | **`deploy`** |
| Marco | Other |
| Gestor de paquetes | npm |
| **Comando compilación** | **`echo ok`** |
| **Directorio salida** | **`.`** |
| **Archivo entrada** | **`start.mjs`** |

No uses `./` como raíz. No uses `pnpm run build`.

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
- `FALTA archivo requerido` → no usaste carpeta `deploy`
- `OPENAI_API_KEY` → falta el secret
- `EADDRINUSE` / `PORT` → problema de puerto (raro en Hostinger)

Manda captura de esas líneas (no la key).
