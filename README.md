# Agente Virtual Kommo — Simulador

Simulador tipo Kommo para probar el agente de IA **antes** de conectarlo al CRM real de Bodasesor.

## Qué incluye

- **Embudo fake** con tus 9 etapas reales (Datos e Interesess del cliente → Cliente perdido)
- **Campos personalizados** como en tu Kommo (Dirección, Fecha Y horari, Numero de Inv, Respuesta IA 1, etc.)
- **Lead de ejemplo**: Montserrat (WhatsApp Business, Pachuca, 70 invitados, fiesta)
- **Chat de prueba**: escribes como cliente y el agente responde
- **Movimiento de embudo**: arrastrar leads entre etapas o dejar que el agente lo haga

## Arrancar en local

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # opcional: OPENAI_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Abre: http://localhost:8000

## Modos del agente

1. **Demo (sin API key)**: respuestas fijas de prueba
2. **GPT real**: agrega `OPENAI_API_KEY` en `.env`
3. **Tu código Replit**: agrega `AGENT_WEBHOOK_URL` apuntando a tu servidor

## Próximo paso

Cuando el flujo funcione aquí, conectamos el webhook real de Kommo con los mismos campos y etapas.
