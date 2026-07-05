---
name: feedback-autonomous
description: User wants me to run queries/checks myself instead of asking them to run SQL — be more autonomous
metadata:
  type: feedback
---

No hacer que el usuario corra queries SQL o comandos que yo podría verificar por otros medios (leyendo código, usando la app, etc).

**Why:** El usuario se frustró porque le pedí correr 3 queries SQL en Supabase cuando podría haber buscado la info yo mismo. Dijo: "intenta no hacerme correr todo a mi. no podias buscarlo vos?"

**How to apply:** Antes de pedir al usuario que corra algo, intentar resolver con las herramientas disponibles (leer código, buscar en archivos, correr scripts locales, usar la app). Solo pedir al usuario que corra SQL en Supabase cuando es estrictamente necesario y no hay alternativa.
