# Simulador Kommo + Lucy — inicio rápido

## 1. Arrancar (una sola terminal)

```bash
git pull origin main
./scripts/start-simulator.sh
```

Abre: **http://localhost:8000**

No necesitas Lucy local. El simulador usa **Hostinger** (donde ya está tu `OPEN_AI`).

---

## 2. Probar el chat

1. Clic en el lead **Montserrat**
2. Escribe un mensaje (ej: `Hola, quiero cotizar para 80 personas en Pachuca`)
3. Espera **5–10 segundos** — verás «Lucy está escribiendo…»
4. Lucy responde en el chat

El menú lateral debe decir: **「Lucy Hostinger · lista para chatear」**

---

## 3. Si no responde

| Problema | Solución |
|----------|----------|
| No hay lead seleccionado | Clic en **Montserrat** primero |
| Badge amarillo | Menú → **Hostinger (recomendado)** → **Aplicar** |
| Error de API key | Solo afecta si usas **Local :3000** — usa Hostinger |
| Tarda mucho | Normal (~7 s) — Lucy está en la nube |

---

## Hostinger debe estar en Run

Comprueba: https://midnightblue-mosquito-424375.hostingersite.com/api/health  
→ `"openai_configured": true`
