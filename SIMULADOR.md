# Simulador Kommo + Lucy — inicio rápido

## Opción recomendada: Hostinger (sin localhost)

Abre en el navegador:

**https://midnightblue-mosquito-424375.hostingersite.com/simulator**

(También funciona `/simulador`.)

- El embudo y los leads viven en **localStorage** de tu navegador.
- El chat llama a Lucy en el mismo servidor (`POST /api/kommo/simulator`).
- Necesitas `OPEN_AI` configurada en Hostinger y el sitio en **Run**.

Comprueba salud: https://midnightblue-mosquito-424375.hostingersite.com/api/health → `"openai_configured": true`

---

## Opción local (Python, solo desarrollo)

```bash
git pull origin main
./scripts/start-simulator.sh
```

Abre: **http://localhost:8000**

No necesitas Lucy local si apuntas el preset a **Hostinger**.

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
