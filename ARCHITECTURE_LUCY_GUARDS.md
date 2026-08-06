# Arquitectura de decisiones de Lucy

## Regla principal
Una intención del cliente se resuelve por una prioridad explícita. No se agregan
`if` de tickets dentro del orquestador sin primero ubicar la regla en su dominio
y añadir una prueba de regresión.

## Orden de decisión
1. Normalización y captura CRM.
2. Handoff y post-cierre.
3. Contacto e identidad de Bodasesor.
4. Catálogo solicitado explícitamente.
5. Inclusiones, paquetes y niveles.
6. Precio y solicitudes de mayoreo.
7. Ventas del producto.
8. Embudo y pregunta pendiente.
9. Sanitizado y anti-repetición antes de WhatsApp.

Los puntos 2–6 usan `guards/policy.ts`: cada handler devuelve `continue` o
`reply`; el primer `reply` gana. Los handlers de inclusiones y precio se
ejecutan en la posición que tenían en el flujo anterior para no cambiar la
prioridad histórica de productos.

## Dónde vive cada regla
`api-server/src/guards/domains.ts` es el índice obligatorio:

- `opening.ts`: nombre, saludo y primer turno.
- `catalogOffer.ts` / `catalogSanitize.ts`: links y catálogo.
- `postCierreHandler.ts`: conversación después del cierre y handoff.
- `priorityHandlers.ts`: decisiones prioritarias explícitas.
- `salesReplies.ts`: alimentos, entretenimiento, carpas y pistas.
- `funnelHandler.ts`: avance del embudo y no re-preguntar datos.
- `embudoConstants.ts` / `embudoQuestions.ts`: contrato del cierre y preguntas.

## Invariantes que nunca se relajan
- No inventar precio, inclusión ni SKU.
- Catálogo genérico no elige un servicio inventado.
- “Sí, mándamelo” no es nombre.
- No pedir de nuevo un campo que ya se capturó.
- No cerrar sin los campos obligatorios.
- Post-cierre no reinicia el embudo.

## Pruebas
`lucy-flow-selftest.ts` sigue siendo la regresión completa histórica.
`selftest/domains/` es el destino de nuevas pruebas por dominio.
`scripts/smoke-guards-cleanup.mjs` verifica módulos sin arrancar PGlite.
