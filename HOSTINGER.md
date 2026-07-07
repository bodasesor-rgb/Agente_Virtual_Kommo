# Deploy en Hostinger — SIN compilar (recomendado)

La carpeta `deploy/` ya trae Lucy **precompilado**. No uses pnpm ni monorepo en Hostinger.

## Configuración en hPanel

| Campo | Valor |
|-------|--------|
| Rama | `main` |
| Node | `22.x` |
| **Directorio raíz** | **`deploy`** |
| Marco | `Other` |

### Compilación y salida

| Campo | Valor |
|-------|--------|
| Gestor de paquetes | `npm` |
| Comando de compilación | `echo ok` |
| Directorio de salida | `.` |
| Archivo de entrada | `index.mjs` |

> No hace falta `npm install` ni `npm run build`. El código ya está listo.

### Variables de entorno

```
OPENAI_API_KEY=sk-proj-...
KOMMO_SUBDOMAIN=tu-subdominio
KOMMO_ACCESS_TOKEN=...
WHATSAPP_TOKEN=...
PHONE_NUMBER_ID=...
```

### Probar

```
https://TU-DOMINIO.hostingersite.com/api/health
```

### Webhook Kommo

```
https://TU-DOMINIO.hostingersite.com/api/kommo/webhook
```

---

## Desarrollo local (no Hostinger)

```bash
npm install
npm run build
npm start
```

Para actualizar `deploy/` después de cambios:

```bash
npm run build && cp api-server/dist/*.mjs api-server/dist/postgres.* deploy/
```
