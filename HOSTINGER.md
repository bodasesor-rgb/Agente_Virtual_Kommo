# Deploy en Hostinger (Node.js Web App)

## Configuración en hPanel

| Campo | Valor |
|-------|--------|
| Rama | `main` |
| Node | `22.x` |
| Directorio raíz | `./` |
| Marco | `Other` |

### Ajustes de compilación (Cambiar)

| Campo | Valor |
|-------|--------|
| **Install** | `npm install` |
| **Build** | `npm run build` |
| **Start** | `npm start` |
| **Output** | `api-server/dist` |

> Si el build falla, Hostinger puede arrancar igual: el `dist/` ya viene precompilado en el repo.  
> En ese caso pon **Build** vacío o `echo ok` y **Start** `npm start`.

### Variables de entorno (Añadir)

```
OPENAI_API_KEY=sk-proj-...
KOMMO_SUBDOMAIN=tu-subdominio
KOMMO_ACCESS_TOKEN=...
WHATSAPP_TOKEN=...
PHONE_NUMBER_ID=...
```

### Probar que funciona

```
https://TU-DOMINIO.hostingersite.com/api/health
```

### Webhook Kommo

```
https://TU-DOMINIO.hostingersite.com/api/kommo/webhook
```
