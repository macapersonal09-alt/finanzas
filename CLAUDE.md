# Finanzas Personales · notas para Claude

App personal de finanzas de Maca. Registra gastos, ingresos y traspasos entre sus cuentas,
con una bandeja para contestar lo que el sistema no sabe clasificar.

## Cómo trabajar con Maca

- Siempre en **español**, en lenguaje sencillo y conciso.
- Analizar hasta estar ~95% seguro del problema y de la mejor solución antes de proponer.
- Explicar el plan y **esperar su autorización explícita antes de escribir código**.
- Dar **UN SOLO paso de instrucciones por mensaje** (el razonamiento puede ser completo).
- No usar el mecanismo automático de preguntas: preguntar en texto normal.
- Ella trabaja en la **computadora** para Apps Script y GitHub; en el **iPhone** (en inglés) para Atajos y Pushover.

## Piezas y cómo se conectan

1. **App web** (este repositorio, publicada en GitHub Pages: https://macapersonal09-alt.github.io/finanzas/)
   - `index.html`, `app.js`, `estilos.css`, `sw.js` (service worker, red primero), `manifest.webmanifest`.
   - Vistas: Inicio (saldos y gastos del mes) · Bandeja (lo POR_REVISAR) · Movimientos · + Gasto (captura manual) · Cuadrar saldo.
   - Parámetros de URL: `?mov=<id>` abre ese movimiento (en la bandeja si está POR_REVISAR); `?cuadrar=<bolsa>` abre el cuadre.
   - `config.js` solo lleva la llave **anon** de Supabase (pública, protegida por RLS + login).
   - Regla de fechas: **nunca `toISOString()`** para una fecha local.

2. **Supabase** (`https://jaologewhcbjuoinlusk.supabase.co`)
   - Tablas: `bolsas` (cuentas), `categorias`, `reglas` (patrón de comercio → categoría), `movimientos`. Vista `saldos`.
   - Bolsas: `EFECTIVO`, `ENLACE` (Banorte ****3123, la tarjeta de débito carga aquí), `INVERSION` (Banorte ****3918), `TERMINUS` (virtual: cuenta por cobrar/pagar con la empresa).
   - `movimientos`: `tipo` GASTO/INGRESO/TRASPASO · `estado` POR_REVISAR/CONFIRMADO/DESCARTADO ·
     `duda` CATEGORIA/EFECTIVO_O_PAGO/ORIGEN/DESTINO/CUENTA/DESCONOCIDO · `fuente` APP/CORREO/ATAJO · `llave` única (evita duplicados del correo).
   - Aún no hay Edge Functions.

3. **Apps Script FP-LECTOR** (en la cuenta de Google de Maca; copia de respaldo en `apps-script/FP-LECTOR/Code.gs`)
   - `cada5min()`: lee avisos de Banorte en Gmail → movimientos (compras, cajero, SPEI, traspasos, anulaciones). Solo lee Gmail, no lo modifica.
   - `doPost()`: aplicación web "Atajo Gasto" que recibe `{token, texto}` del Atajo de iPhone.
   - `avisoEfectivoSemanal()`: domingos 7 pm, Pushover para cuadrar efectivo.
   - Propiedades del script: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PUSHOVER_TOKEN`, `PUSHOVER_USER`, `ATAJO_TOKEN`, opcional `PUSHOVER_PRIORIDAD`.
   - **La copia del repo es solo respaldo**: lo que corre es lo que está en Apps Script. Al cambiarlo, actualizar ambos.

4. **Atajo de iPhone "Gasto"** ("Oye Siri, Gasto")
   - Dictate Text (Español MX) → Get Contents of URL (POST, JSON: `token`, `texto` = Dictated Text) a la URL `/exec` de la aplicación web → Show Notification con Contents of URL.
   - **Solo para efectivo.** Tarjeta y transferencias ya llegan por los correos de Banorte (dictarlas las duplicaría).
   - Si el concepto tiene regla → CONFIRMADO en silencio. Si no → POR_REVISAR + Pushover con liga "Contestar".
     Al elegir la categoría en la bandeja, la app crea la regla y la próxima vez se confirma solo.

5. **Pushover**: avisos solo cuando algo queda **por revisar** (y el cuadre del domingo).
   **Siempre prioridad alta (1) o crítica**: con prioridad normal no suena en el teléfono de Maca.
   En Apps Script la prioridad se manda como texto entero (`"1"`), no número.

## Reglas al hacer cambios

- **Apps Script**: pegar el Code.gs completo → guardar → Implementar → Gestionar implementaciones → "Atajo Gasto" → lápiz →
  Versión: **Nueva versión** → Implementar. Nunca "Nueva implementación" (cambia la URL y rompe el Atajo).
- Subir el número de versión en el encabezado de Code.gs (`FP-LECTOR vX.Y · fecha`) y en `FP.VERSION`, con una nota de qué cambió.
- **Nunca** poner llaves reales (service_role, Pushover, ATAJO_TOKEN) en archivos del repositorio: van en Propiedades del script.
- Probar lo posible con simulaciones antes de pedir una prueba real; para pruebas reales usar un gasto "prueba" y luego descartarlo en la app.
- El entorno de Claude en la nube no puede conectarse a Supabase ni a script.google.com: las pruebas reales las hace Maca.

## Historial

- 26-sep-2026 · App web v1.2 y FP-LECTOR v1.3 (lector de correos + Pushover + primer doPost).
- 27-sep-2026 · FP-LECTOR v1.4: atajo solo efectivo, limpia el dictado ("300 pesos gasolina en efectivo" → $300 · gasolina),
  Pushover con liga cuando lo dictado queda por revisar. Implementación "Atajo Gasto" versión 2. Atajo probado de punta a punta.

## Pendientes

- Cambiar la `SUPABASE_SERVICE_KEY` (se vio en una captura) y actualizarla en Propiedades del script.
- Opcional: poner el Atajo "Gasto" en la pantalla de inicio o en el botón lateral del iPhone.
