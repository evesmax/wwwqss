# H2 Motor de SLA — plan

**Spec:** `docs/superpowers/specs/2026-11-07-service-desk-design.md`, requerimientos §6.4 (RF-SLA-01…09) y §10.

**Meta:** SLA calculado por el servidor, reproducible y recalculable, con calendarios MX, pausas, exclusiones, alertas y vista al cliente.

## Rulings (decisiones tomadas)
- Metas en minutos del calendario aplicable. Calendario laboral default: L–V 09:00–18:00 America/Mexico_City + feriados LFT art. 74. Sin 24x7 (decisión M8).
- Pausas: `waiting_customer`; `waiting_third_party` solo con motivo; el tiempo en `resolved/closed` no cuenta y al reabrir el reloj continúa (reapertura no reinicia).
- Severidad/calendario cambiados a mitad de vida: la política vigente se aplica al tiempo transcurrido desde `created_at` (recalculo determinista).
- Pausa por ventana de mantenimiento: se difiere a H5 (necesita monitores).
- Métricas "tiempo a asignación" y "tiempo de trabajo" son informativas: diferidas.
- Valores iniciales de §10 (horas hábiles): P0 1ª resp 2h / act 2h / res 6h; P1 4/4/8; P2 12/—/24; P3 16/—/36; solicitudes y preguntas como P3.

## Tareas
1. `slaCalendar.ts` (puro): ventanas laborales, zona horaria, feriados, `workingMs`, `addWorkingMs`, feriados MX. Tests.
2. `slaEngine.ts` (puro): pausas desde eventos, `computeMetric`, `computeTicketSla`, selección de política. Suite dorada RF-SLA-09.
3. Esquema `sd_sla_*` + seed + `slaService.ts` (persistencia, recálculo versionado, exclusiones).
4. Rutas admin (políticas, calendarios, feriados, exclusión, recálculo, reporte "sin SLA") + endpoint de tick protegido por token (alertas 50/75/90/100 %).
5. UI admin (config + chip SLA en ticket) y vista en portal (meta, restante, pausas con motivo).
6. Revisión, merge a `main`, verificar despliegue.
