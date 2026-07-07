# Simulador Kommo + Lucy

Prueba el embudo Bodasesor y chatea con **Lucy** sin conectar Kommo real.

## Requisitos

- Python 3.10+
- Node.js 22+
- `OPENAI_API_KEY` (la misma que usas en Hostinger)

---

## Paso 1 — Arrancar Lucy (terminal 1)

```bash
cd /ruta/al/repo

# Solo la primera vez (desarrollo local):
cp package.development.json package.json
npm install
npm run build:source

# Cada vez que cambies código de api-server:
npm run build:source

# Arrancar Lucy en puerto 3000:
export OPENAI_API_KEY=sk-proj-TU-KEY
npm run start:dev
```

Comprueba: http://localhost:3000/api/health → `{"status":"ok",...}`

---

## Paso 2 — Arrancar simulador (terminal 2)

```bash
cd /ruta/al/repo

python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edita .env y pon:
#   OPENAI_API_KEY=sk-proj-...
#   AGENT_WEBHOOK_URL=http://localhost:3000/api/kommo/simulator

uvicorn app.main:app --reload --port 8000
```

Abre: **http://localhost:8000**

En la barra lateral debe decir **「Lucy conectada · simulador」** en verde.

---

## Paso 3 — Probar el flujo

1. Haz clic en el lead **Montserrat** (columna «Datos e Interesess del cliente»).
2. En el chat escribe como cliente, por ejemplo:
   - `Hola, quiero cotizar una fiesta para 80 personas en Pachuca`
   - `Mi correo es test@ejemplo.com`
3. Lucy responde en el chat.
4. Ve a la pestaña **Campos** — verás dirección, invitados, requerimiento, etc. actualizados.
5. Si completa los 6 datos, el lead puede moverse a **Cotización realizada**.
6. Arrastra tarjetas entre columnas para simular a Rodrigo moviendo etapas.

---

## Modos del agente

| Configuración | Comportamiento |
|---------------|----------------|
| `AGENT_WEBHOOK_URL=http://localhost:3000/api/kommo/simulator` | **Lucy real** (prompt V4, catálogo, embudo) |
| Solo `OPENAI_API_KEY` sin webhook | Agente simple del simulador |
| Ninguna | Mensaje demo pidiendo configuración |

---

## Usar Lucy en Hostinger desde el simulador local

En `.env` del simulador:

```
AGENT_WEBHOOK_URL=https://midnightblue-mosquito-424375.hostingersite.com/api/kommo/simulator
OPENAI_API_KEY=sk-proj-...
```

*(Necesitas desplegar el endpoint `/api/kommo/simulator` en Hostinger — viene en el próximo deploy.)*

---

## Datos de demo

- Pipeline: **Embudo de ventas** (Kommo ID 9335963)
- 9 etapas con los nombres reales de Bodasesor
- Campos con IDs Kommo: 1048774, 1048776, 1048778, 1048780, 1048782, 1048784, 1048786
- Lead demo: Montserrat, Pachuca, 70 invitados, fiesta

Botón **Restaurar demo** resetea todo.

---

## Solución de problemas

| Problema | Solución |
|----------|----------|
| Badge «Lucy no responde» | Lucy no está en puerto 3000 o `AGENT_WEBHOOK_URL` incorrecta |
| Error 500 al enviar mensaje | Revisa `OPENAI_API_KEY` en la terminal de Lucy |
| Campos no se actualizan | Usa `/api/kommo/simulator`, no `/api/kommo/salesbot` |
| `ModuleNotFoundError: app` | Ejecuta uvicorn desde la **raíz del repo**, no desde `app/` |
