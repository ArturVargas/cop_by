# COP By — Roadmap de producto

> **Última actualización:** junio 2026  
> **Enfoque:** usabilidad y tracción (revenue secundario por ahora)

---

## North Star

**Hacer que COPm / pesos digitales sean la forma más fácil de gastar desde MiniPay para usuarios en Colombia.**

### Métrica principal

**COP gastado o enviado por usuario activo semanal** (no solo comprado).

| Métrica | Rol |
| --- | --- |
| Conversión completada (compra COPm) | Activación |
| Gasto o envío completado (transfer / BRE-B) | Retención |
| Retorno en 7 días | Tracción |
| Compartidos / referidos | Crecimiento orgánico |

---

## Usuario objetivo

| Atributo | Definición |
| --- | --- |
| **Quién** | Usuarios de MiniPay en Colombia |
| **Entrada** | Reciben USD (USDC, USDT, etc.) en su wallet |
| **Necesidad** | Convertir y **gastar en pesos colombianos** |
| **Perfil** | No crypto-nativo; quiere pesos usables, no un flujo técnico |

### Mensaje de producto

> *"Convierte tus dólares de MiniPay en pesos que puedes usar."*

COPm es el motor onchain; el usuario no tiene que entender tokens.

---

## Estado actual (ya construido)

| Capacidad | Estado |
| --- | --- |
| Comprar COPm desde saldos en wallet (Squid) | ✅ |
| Enviar COPm a otra wallet | ✅ |
| Comprar COPm y recibirlo en otra wallet | ✅ |
| Fee Squid visible en UI | ✅ |
| Analytics (swaps + transfers) | ✅ |
| Logging onchain + Neon | ✅ |

---

## Arquitectura de rails (visión)

Dos vías complementarias, no excluyentes:

```
MiniPay wallet
    ├─ Comprar COPm (Squid)      → pesos en wallet, P2P, ecosistema Celo
    └─ Pagar vía BRE-B (Abroad)  → pesos al mundo real (banco, Nequi, comercio)
```

| Rail | Proveedor | Caso de uso |
| --- | --- | --- |
| Onchain COPm | Squid Router | Balance en MiniPay, transferencias P2P |
| Fiat COP vía BRE-B | [Abroad](https://docs.abroad.finance/) (en evaluación) | Pagos a cuentas y comercios en Colombia |

---

## Distribución

| Canal | Táctica |
| --- | --- |
| **MiniPay** | Flujo corto (&lt;3 taps visibles), montos en COP, copy en español colombiano |
| **Comunidades Colombia** | Un caso de uso claro por activación (*"paga en Colombia desde MiniPay"*) |
| **Boca a boca** | Comprobante compartible (WhatsApp), referidos, envío a familia |

**Mensaje sugerido para comunidades:**

> *"¿Recibes dólares en MiniPay? Con COP By los conviertes en pesos y los mandas a cualquier cuenta en Colombia."*

---

## Fases del roadmap

### Fase 0 — Alinear producto con el usuario

**Duración estimada:** 2–3 semanas  
**Objetivo general:** Que quien llegue una vez entienda el valor en segundos y tenga razones para volver.

| # | Tarea | Detalle general | Objetivo |
| --- | --- | --- | --- |
| 0.1 | Reposicionar copy | Cambiar lenguaje de "compra COPm" a "convierte USD → pesos". COPm solo en detalles técnicos. | Reducir fricción cognitiva para no-crypto |
| 0.2 | Simplificar flujo de compra | Monto en COP como input principal. Orden de tokens y fees detrás de sección "Avanzado". | Subir tasa de completación del flujo |
| 0.3 | Historial de actividad | Lista unificada de compras y transferencias con estado (pendiente, confirmado, error). | Retención; la app deja de sentirse de un solo uso |
| 0.4 | Pantalla de éxito mejorada | Monto, destinatario, link a explorer, botón copiar/compartir comprobante. | Confianza post-tx y prueba social |
| 0.5 | "Enviar pesos" prominente | Elevar compra/transferencia a terceros como acción principal, no opción escondida. | Activar caso de uso remesas / boca a boca |
| 0.6 | Destinatarios con contexto | Nombres o alias sobre addresses recientes (además de `localStorage` actual). | Repetición de transferencias con confianza |
| 0.7 | Onboarding de 1 pantalla | Explicar valor en 3 pasos antes del flujo técnico. | Mejorar activación desde MiniPay |

**Criterio de éxito Fase 0**

- Tasa de completación del flujo de compra &gt; 70%
- Usuarios que vuelven en 7 días &gt; 25%

---

### Fase 1 — Primer gasto real: BRE-B con Abroad

**Duración estimada:** 4–8 semanas (depende de acceso a API Abroad)  
**Objetivo general:** Dar una razón concreta para volver después de convertir USD — gastar en el mundo real colombiano.

**Proveedor candidato:** [Abroad Finance](https://docs.abroad.finance/) — USDC/USDT → COP fiat vía BRE-B.

| # | Tarea | Detalle general | Objetivo |
| --- | --- | --- | --- |
| 1.1 | Contacto y acceso API | Solicitar API keys, sandbox y documentación de workflows a Abroad sales. | Desbloquear integración |
| 1.2 | Validar requisitos de compliance | Confirmar KYC por usuario vs integrador, límites, mínimos y tiempos de settlement. | Diseñar UX sin sorpresas regulatorias |
| 1.3 | Flujo técnico MVP | Backend: quote → payout → webhooks. Frontend: monto COP + destinatario BRE-B + confirmación. | Primer pago BRE-B end-to-end |
| 1.4 | Tab "Gastar" en UI | Evolucionar `Comprar \| Transferir` hacia `Comprar \| Enviar \| Gastar`. | Unificar conversión + gasto en una app |
| 1.5 | Persistencia y analytics | Registrar payouts BRE-B en DB (similar a swaps/transfers). | Medir adopción y depurar fallos |
| 1.6 | Manejo de errores y estados | Estados claros: cotizando, procesando, completado, fallido + mensajes en español. | Confianza en pagos fiat |

**Flujo objetivo**

```
[¿Cuántos pesos?] → [¿A quién? llave BRE-B / cuenta] → [Confirmar] → [USDC desde MiniPay] → [COP vía BRE-B]
```

**Preguntas abiertas con Abroad (bloqueantes)**

- ¿Integración con wallet MiniPay vía JWT (`/walletAuth`)?
- ¿KYC por usuario final o a nivel integrador?
- ¿Sandbox disponible antes de producción?
- ¿Solo USDC o también USDT?

**Criterio de éxito Fase 1**

- &gt; 15% de usuarios activos completan al menos un gasto BRE-B
- &gt; 1.2 transacciones de gasto por usuario activo semanal

---

### Fase 2 — Loops de tracción

**Duración estimada:** 6–8 semanas (puede solaparse con cierre de Fase 1)  
**Objetivo general:** Crecimiento orgánico en MiniPay, comunidades colombianas y WhatsApp.

| # | Tarea | Detalle general | Objetivo |
| --- | --- | --- | --- |
| 2.1 | Hero "Envía pesos a Colombia" | Landing / primera pantalla centrada en remesas y pagos a familia. | Viralidad en comunidades |
| 2.2 | Comprobante compartible | Imagen o link post-tx optimizado para WhatsApp. | Boca a boca con prueba social |
| 2.3 | Cashback offchain | Bonus COPm en DB (ej. primera recarga BRE-B o primera compra). Sin contratos onchain. | Incentivo de primera repetición |
| 2.4 | Referidos simples | Código o link; ambos reciben beneficio en próxima operación (offchain). | Medir y escalar crecimiento |
| 2.5 | Contenido para comunidades | Video corto (~30 s) + copy para grupos Telegram/WhatsApp. | Activación en canales CO |

**Criterio de éxito Fase 2**

- &gt; 10% de compras/envíos a terceros
- Baseline de referidos activados medido y en crecimiento

---

### Fase 3 — Segunda vertical de gasto

**Duración:** cuando Fase 1 tenga datos de uso  
**Objetivo general:** Expandir casos de gasto solo si hay demanda validada.

| Vertical | Proveedor | Cuándo abordar |
| --- | --- | --- |
| Recargas telefónicas | Por definir (Bemovil, Reloadly, etc.) | Cuando exista API y Fase 1 &gt; 15% adopción |
| Gift cards (Netflix, etc.) | Por definir | Tras elegir catálogo CO |
| Vouchers (Rappi, Uber, Didi) | Por definir | Si hay partner o margen claro |

**Regla:** no abrir una nueva vertical hasta que la anterior supere ~15% de usuarios activos usándola.

---

## Congelado (no construir hasta presión real)

| Ítem | Criterio para desbloquear |
| --- | --- |
| **Swap & stake COPm** | Partner de yield + modelo legal claro |
| **Multi-approve / Permit2 onchain** | &gt; 30% abandono en paso "Activar" en producción |
| **Cashback onchain** | Auditoría, grant (Talent) o requisito regulatorio |
| **4 verticales de pago en paralelo** | Descartado — una vertical a la vez |

---

## Backlog priorizado (próximos 6–8 semanas)

| Prioridad | Tarea | Esfuerzo | Impacto tracción |
| --- | --- | --- | --- |
| 1 | Reposicionar copy (USD → pesos) | Bajo | Alto |
| 2 | Historial de transacciones | Medio | Alto |
| 3 | Comprobante compartible post-tx | Bajo | Alto |
| 4 | "Enviar pesos" como acción principal | Bajo | Alto |
| 5 | Contactar Abroad → sandbox | Ops | Crítico |
| 6 | MVP BRE-B (quote + payout + webhook) | Alto | Muy alto |
| 7 | Referidos offchain | Medio | Medio |
| 8 | Recargas telefónicas | — | Bloqueado (sin proveedor) |

---

## Journey del usuario (objetivo)

```
Llega (MiniPay / comunidad)
        │
        ▼
   ¿Qué necesito?
    ┌───┼───┐
    ▼   ▼   ▼
 Convertir  Enviar  Pagar en Colombia
    │       │           │
    ▼       ▼           ▼
 COPm     Transfer    BRE-B
(Squid)   o BRE-B    (Abroad)
    │       │           │
    └───────┴───────────┘
              │
              ▼
    Comprobante compartible
              │
              ▼
       Vuelve en 7 días
```

---

## Decisiones de producto tomadas

| Decisión | Elección |
| --- | --- |
| Usuario principal | MiniPay CO que recibe USD y quiere gastar en COP |
| Revenue | Solo tracción por ahora; fee Squid existente |
| Primera vertical de gasto | BRE-B vía Abroad (no recargas — sin proveedor) |
| Cashback | Offchain primero; onchain solo si se exige |
| Distribución | MiniPay + comunidades Colombia + boca a boca |

---

## Próximos pasos inmediatos

1. Ejecutar **Fase 0** (copy, historial, comprobante, enviar pesos prominente).
2. En paralelo: **contactar Abroad** para API keys y sandbox.
3. Con acceso API: diseñar **MVP BRE-B** (Fase 1) antes de buscar proveedores de recargas.
