# Módulo de proyectos (RF-PRJ) — plan

Entrega en dos partes. **P1**: RF-PRJ-01..05, 12, 15, 17 (vista cliente). **P2**: RF-PRJ-06..11, 13, 14, 16, 18.

Rulings:
- Granularidad en días hábiles (fechas `YYYY-MM-DD`), lun–vie + feriados MX (`mxOfficialHolidays`) + feriados de la cuenta. Sin horas del día.
- Dependencias fin-a-inicio; una tarea inicia el día hábil siguiente al fin de su predecesora más tardía (o en su fecha fija si es posterior).
- Avance ponderado por horas de esfuerzo; si no hay horas, por días hábiles. Estatus: ratio ≥0.90 En tiempo, 0.75–0.90 En riesgo, <0.75 Atrasado; gate vencido sin firma → al menos En riesgo.
- Línea base: se congela al aprobar el plan (v1); cada cambio posterior es una revisión con motivo y origen.
- Firma de gate: usuario/contacto, fecha-hora, IP y huella SHA-256 de (gate + criterios + evidencia). Validez legal pendiente de abogado.
- Visibilidad cliente/interno por elemento; el cliente nunca ve horas, notas internas ni carga.
- Sin CPM, sin nivelación, sin costeo (fuera de alcance v1).
