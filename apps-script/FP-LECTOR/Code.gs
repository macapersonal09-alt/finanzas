/**
 * =====================================================================
 * FP-LECTOR · v1.5 · 30-sep-2026
 * Lee los avisos de Banorte del correo y los convierte en movimientos
 * de la app Finanzas Personales (Supabase).
 *
 * NO MODIFICA TU GMAIL: no marca, no etiqueta, no mueve. Solo lee.
 *
 * Funciones que se corren a mano:
 *   probarEnSeco()        → arma la hoja "FP PRUEBA LECTOR" con lo que
 *                           haría. NO escribe en Supabase.
 *   registrarHistorial()  → registra de verdad desde el 1-sep-2026.
 *   instalarActivador()   → deja corriendo cada5min() solo.
 *   probarPushover()      → manda un aviso de prueba a tu teléfono.
 *   probarAtajo()         → muestra cómo leería "200 tacos" SIN registrar nada.
 *   avisoEfectivoSemanal()→ (lo corre el activador cada domingo 7 pm)
 *
 * WEB APP (para el Atajo de iPhone "Gasto"):
 *   Implementar → Nueva implementación → Aplicación web · Ejecutar como: Yo ·
 *   Quién tiene acceso: Cualquier usuario. El Atajo manda {token, texto}.
 *   ATAJO_TOKEN (propiedad) = una contraseña inventada que también lleva el Atajo.
 *   Al cambiar el código: Gestionar implementaciones → lápiz → Versión: Nueva
 *   versión → Implementar. Así la URL del Atajo NO cambia.
 *
 * Propiedades del script (Configuración del proyecto → Propiedades):
 *   SUPABASE_URL          https://jaologewhcbjuoinlusk.supabase.co
 *   SUPABASE_SERVICE_KEY  la llave service_role (NUNCA en el chat)
 *   PUSHOVER_TOKEN        el API Token de la aplicación "Finanzas" en Pushover
 *   PUSHOVER_USER         tu User Key de Pushover
 *   PUSHOVER_PRIORIDAD    opcional: 0 normal · 1 alta/crítica (default) · 2 emergencia
 *   ATAJO_TOKEN           la contraseña que lleva el Atajo "Gasto"
 *
 * v1.5:
 *   · "TRASPASO DE CTA : 1151995728" = alguien te depositó desde su cuenta
 *     Banorte (p. ej. Airbnb). Entra como INGRESO a tu cuenta del aviso.
 *   · reglas de ingreso: si ese número ya tiene regla (la app la crea al
 *     contestar), el depósito se CONFIRMA solo y no manda Pushover
 *
 * v1.4:
 *   · el Atajo solo registra EFECTIVO (tarjeta y transferencias llegan por correo)
 *   · quita del dictado "pesos", "efectivo", "en efectivo", "cash"…
 *     ("300 pesos gasolina en efectivo" → $300 · gasolina)
 *   · si lo dictado queda en la bandeja, manda Pushover con liga al movimiento
 *
 * v1.2:
 *   · si el comercio ya tiene regla, la compra se CONFIRMA sola (no pregunta)
 *   · cada5min() manda un Pushover por cada movimiento nuevo que pregunta algo,
 *     con liga que abre la app en ese movimiento (máx. 5; si son más, un resumen)
 *   · registrarHistorial() NO manda avisos
 *
 * v1.1 (medido contra 48 avisos reales del 1 al 24-sep-2026):
 *   · ANULACION COMPRA EN … descarta la compra original (misma autorización)
 *   · "Notificacion SPEI RECIBIDO" se lee, con la misma llave que su gemelo
 *   · "CARGO/ABONO POR IF {cuenta}" = traspaso entre tus cuentas, no interés
 *   · "TRASP FONDOS" (sale) + "TRASPASO" (entra) = las dos puntas de un
 *     solo traspaso; si llega una sola punta, queda preguntando
 * =====================================================================
 */

var FP = {
  VERSION: 'FP-LECTOR v1.5',
  TZ: 'America/Mexico_City',
  APP_URL: 'https://macapersonal09-alt.github.io/finanzas/',
  MAX_AVISOS: 5,
  REMITENTE: 'notificacionesbanorte@banorte.com',
  BUSCAR_DESDE: '2026/08/30',     // Gmail: correos después de esta fecha
  FECHA_MIN: '2026-09-01',        // se ignora todo lo anterior
  VENTANA_AUTOMATICA: '3d',       // cada5min() revisa los últimos 3 días
  CUENTAS: { '3123': 'ENLACE', '3918': 'INVERSION' },
  HOJA_PRUEBA: 'FP PRUEBA LECTOR'
};

var FP_MESES = {
  ENE: 1, JAN: 1, FEB: 2, MAR: 3, ABR: 4, APR: 4, MAY: 5, JUN: 6, JUL: 7,
  AGO: 8, AUG: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12, DEC: 12
};

// =====================================================================
// 1. FUNCIONES QUE SE CORREN
// =====================================================================

function probarEnSeco() {
  var consulta = 'from:' + FP.REMITENTE + ' after:' + FP.BUSCAR_DESDE;
  var avisos = fpLeerAvisos_(consulta);
  var plan = fpConsolidar_(avisos);

  var enc = ['ACCION', 'FECHA', 'HORA', 'MONTO', 'TIPO', 'SALE DE', 'ENTRA A',
    'CATEGORIA', 'ESTADO', 'DUDA', 'COMERCIO', 'DESCRIPCION', 'LLAVE',
    'FORMATO', 'FECHA CORREO', 'TEXTO ORIGINAL'];

  var filas = [];
  plan.registrar.forEach(function (a) {
    filas.push(['REGISTRA', a.fecha, a.hora || '', a.monto, a.tipo || '',
      a.bolsa_sale || '', a.bolsa_entra || '', a.categoria || '', a.estado,
      a.duda || '', a.comercio || '', a.descripcion || '', a.llave,
      a.formato, a.fechaCorreo, (a.texto_original || '').slice(0, 1500)]);
  });
  plan.ignorados.forEach(function (x) {
    var a = x.aviso;
    filas.push(['IGNORA · ' + x.motivo, a.fecha || '', a.hora || '', a.monto || '',
      '', '', '', '', '', '', a.comercio || '', '', a.llave || '',
      a.formato, a.fechaCorreo, (a.texto_original || '').slice(0, 1500)]);
  });

  var ss = fpHojaPrueba_();
  var sh = ss.getSheets()[0];
  sh.clear();
  sh.getRange(1, 1, 1, enc.length).setValues([enc]).setFontWeight('bold');
  if (filas.length) sh.getRange(2, 1, filas.length, enc.length).setValues(filas);
  sh.setFrozenRows(1);

  Logger.log(FP.VERSION + ' · PRUEBA EN SECO · ' + avisos.length + ' avisos leídos');
  Logger.log('Registraría: ' + plan.registrar.length +
    ' · Ignoraría: ' + plan.ignorados.length +
    ' · Anulaciones: ' + plan.anuladas.length +
    ' · Parejas de traspaso: ' + plan.parejas.length);
  Logger.log('Hoja: ' + ss.getUrl());
}

function registrarHistorial() {
  var consulta = 'from:' + FP.REMITENTE + ' after:' + FP.BUSCAR_DESDE;
  var r = fpRegistrar_(consulta, false);
  Logger.log(FP.VERSION + ' · HISTORIAL · ' + JSON.stringify(r));
}

function cada5min() {
  var consulta = 'from:' + FP.REMITENTE + ' newer_than:' + FP.VENTANA_AUTOMATICA;
  fpRegistrar_(consulta, true);
}

function probarPushover() {
  var ok = fpPush_({ title: 'Finanzas · prueba', message: 'Si ves esto, los avisos ya funcionan.', url: FP.APP_URL, url_title: 'Abrir la app' });
  Logger.log(ok ? 'Aviso enviado.' : 'No se envió: revisa PUSHOVER_TOKEN y PUSHOVER_USER.');
}

function instalarActivador() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction();
    if (f === 'cada5min' || f === 'avisoEfectivoSemanal') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('cada5min').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('avisoEfectivoSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(19).inTimezone(FP.TZ).create();
  Logger.log('Activadores instalados: cada5min() cada 5 minutos y avisoEfectivoSemanal() los domingos a las 7 pm.');
}

// =====================================================================
// 1b. ATAJO DE VOZ (web app) Y CUADRE SEMANAL
// =====================================================================

function doPost(e) {
  var r;
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var tok = PropertiesService.getScriptProperties().getProperty('ATAJO_TOKEN');
    if (!tok || d.token !== tok) r = { ok: false, texto: 'No autorizado.' };
    else r = fpAtajo_(String(d.texto || ''), true);
  } catch (err) {
    r = { ok: false, texto: 'Error: ' + err.message };
  }
  return ContentService.createTextOutput(r.texto).setMimeType(ContentService.MimeType.TEXT);
}

function probarAtajo() {
  Logger.log(JSON.stringify(fpAtajo_('200 tacos', false)));
  Logger.log(JSON.stringify(fpAtajo_('Gasolina $850.50', false)));
  Logger.log(JSON.stringify(fpAtajo_('300 pesos gasolina en efectivo', false)));
}

// "200 tacos" · "$1,250.50 farmacia" · "tacos 200" → monto + descripción
// Se quitan "pesos", "mxn", "efectivo", "en efectivo", "cash" (el Atajo es solo para efectivo)
// y al principio "gasté", "pagué", "compré", "en", "la"…  ("gasté 150 en el súper" → súper)
function fpLeerDictado_(texto) {
  var t = String(texto || '').replace(/\s+/g, ' ').trim();
  var m = t.match(/\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:[.,](\d{1,2}))?(?!\d)/);
  if (!m) return null;
  var monto = Number(m[1].replace(/,/g, '') + (m[2] ? '.' + m[2] : ''));
  var desc = t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length);
  desc = desc.replace(/(^|\s)((en|con|de|por)\s+)?(efectivo|cash)(?=\s|[.,;]|$)/ig, ' ');
  desc = desc.replace(/(^|\s)(pesos?|mxn)(?=\s|[.,;]|$)/ig, ' ');
  desc = desc.replace(/\s+/g, ' ').replace(/^[\s.,;]+|[\s.,;]+$/g, '');
  desc = desc.replace(/^((gast[eé]|pagu[eé]|compr[eé]|de|en|por|para|con|el|la|los|las|un|una)\s+)+/i, '').replace(/(\s+(de|en|por|para|con))+$/i, '');
  return monto > 0 ? { monto: Math.round(monto * 100) / 100, desc: desc } : null;
}

function fpAtajo_(texto, escribir) {
  var l = fpLeerDictado_(texto);
  if (!l) return { ok: false, texto: 'No entendí el monto. Di por ejemplo: 200 tacos.' };
  var comercio = (l.desc || 'EFECTIVO').toUpperCase();
  var mov = {
    fecha: Utilities.formatDate(new Date(), FP.TZ, 'yyyy-MM-dd'),
    hora: Utilities.formatDate(new Date(), FP.TZ, 'HH:mm:ss'),
    monto: l.monto, tipo: 'GASTO', bolsa_sale: 'EFECTIVO', bolsa_entra: null,
    categoria_id: null, comercio: comercio, descripcion: l.desc || null,
    estado: 'POR_REVISAR', duda: 'CATEGORIA', fuente: 'ATAJO', llave: null
  };
  var monto = '$' + l.monto.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!escribir) return { ok: true, mov: mov };
  var cfg = fpConfig_();
  var reglas = fpGet_(cfg, 'reglas?select=patron,categoria_id');
  var nombreCat = null;
  for (var i = 0; i < reglas.length; i++) {
    var patron = String(reglas[i].patron || '').toUpperCase();
    if (patron && comercio.indexOf(patron) !== -1) { mov.categoria_id = reglas[i].categoria_id; break; }
  }
  if (mov.categoria_id) {
    mov.estado = 'CONFIRMADO'; mov.duda = null;
    var c = fpGet_(cfg, 'categorias?select=nombre&id=eq.' + mov.categoria_id);
    nombreCat = c.length ? c[0].nombre : null;
  }
  var guardado = JSON.parse(fpFetch_(cfg, 'post', 'movimientos', mov, 'return=representation') || '[]')[0];
  // queda en la bandeja → aviso con liga a ese movimiento (si falla el aviso, el gasto ya quedó)
  if (guardado && guardado.estado === 'POR_REVISAR') {
    try { fpPush_(fpMensaje_(guardado)); } catch (err) { Logger.log('Pushover atajo: ' + err.message); }
  }
  return { ok: true, texto: 'Anotado: ' + monto + (l.desc ? ' · ' + l.desc : '') +
    (nombreCat ? ' · ' + nombreCat : ' · queda en la bandeja para su categoría') };
}

function avisoEfectivoSemanal() {
  var cfg = fpConfig_();
  var s = fpGet_(cfg, 'saldos?select=saldo&id=eq.EFECTIVO');
  var saldo = s.length ? Number(s[0].saldo) : 0;
  fpPush_({
    title: 'Finanzas · cuadre de efectivo',
    message: 'La app calcula que traes $' + saldo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '. ¿Cuánto traes de verdad?',
    url: FP.APP_URL + '?cuadrar=EFECTIVO', url_title: 'Cuadrar efectivo'
  });
}

// =====================================================================
// 2. LEER GMAIL
// =====================================================================

function fpLeerAvisos_(consulta) {
  var salida = [];
  var inicio = 0, lote = 100;
  while (true) {
    var hilos = GmailApp.search(consulta, inicio, lote);
    if (!hilos.length) break;
    hilos.forEach(function (h) {
      h.getMessages().forEach(function (m) {
        if (m.getFrom().toLowerCase().indexOf(FP.REMITENTE) === -1) return;
        var a = fpInterpretar_(m.getSubject(), m.getPlainBody());
        a.correo_id = m.getId();
        a.fechaCorreo = Utilities.formatDate(m.getDate(), 'America/Mexico_City', 'yyyy-MM-dd HH:mm:ss');
        if (a.fecha && a.fecha < FP.FECHA_MIN) return;
        salida.push(a);
      });
    });
    if (hilos.length < lote) break;
    inicio += lote;
  }
  salida.sort(function (x, y) { return x.fechaCorreo < y.fechaCorreo ? -1 : 1; });
  return salida;
}

// =====================================================================
// 3. INTERPRETAR UN AVISO  (función pura: no toca Gmail ni Supabase)
// =====================================================================

function fpInterpretar_(asunto, cuerpo) {
  var t = String(cuerpo || '').replace(/\r/g, '').replace(/ /g, ' ');
  var a = { formato: 'OTRO', texto_original: t.trim(), estado: 'POR_REVISAR', fuente: 'CORREO' };
  var s = String(asunto || '');

  if (/SPEI RECIBIDO/i.test(s)) return fpSpeiRecibido_(t, a);

  var operacion = fpCampo_(t, 'Operaci[oó]n');
  var importe = fpImporte_(t);
  var cuenta = fpCuenta_(t);
  var bolsa = cuenta ? FP.CUENTAS[cuenta] : null;
  var fApl = fpFechaTexto_(fpCampo_(t, 'Fecha de Aplicaci[oó]n'));

  if (/Compra en Comercio/i.test(s)) a.formato = 'COMPRA';
  else if (/Cajero Autom[aá]tico/i.test(s)) a.formato = 'CAJERO';
  else if (/Cargo\s*\/\s*Abono/i.test(s)) a.formato = 'CARGO_ABONO';

  if (a.formato === 'OTRO') { a.error = 'asunto no reconocido: ' + s; return a; }
  if (!importe) { a.error = 'sin importe'; return a; }
  a.monto = importe;
  if (!bolsa) a.error = 'cuenta desconocida: ' + (cuenta || 'ninguna');

  // ---------- COMPRA y CAJERO ----------
  if (a.formato === 'COMPRA' || a.formato === 'CAJERO') {
    var fh = fpCampo_(t, 'Fecha y hora de la operaci[oó]n');       // "24/Sep 14:46:21 hrs."
    var m = fh && fh.match(/(\d{1,2})\s*\/\s*([A-Za-zÁÉÍÓÚáéíóú]{3,4})\S*\s+(\d{1,2}:\d{2}(?::\d{2})?)/);
    if (m) { a.fecha = fpArmarFecha_(m[1], m[2], fApl); a.hora = m[3]; }
    else a.fecha = fApl;
    var aut = (t.match(/autorizaci[oó]n\s*:\s*(\d+)/i) || [])[1] || 'X';
    var llaveCompra = 'BNT|' + cuenta + '|AUT|' + aut + '|' + a.fecha;
    var op = String(operacion || '').trim();

    if (/^ANULACI[OÓ]N/i.test(op)) {
      a.formato = 'ANULACION';
      a.anula = llaveCompra;
      a.comercio = op;
      return a;
    }
    a.llave = llaveCompra;

    if (a.formato === 'COMPRA') {
      a.tipo = 'GASTO';
      a.bolsa_sale = bolsa;
      a.comercio = op.replace(/^COMPRA EN\s+/i, '').trim();
      a.duda = 'CATEGORIA';
    } else {
      a.tipo = 'TRASPASO';
      a.bolsa_sale = bolsa;
      a.bolsa_entra = 'EFECTIVO';
      var cajero = fpCampo_(t, 'Identificaci[oó]n de Cajero');
      a.comercio = (op || 'DISPOSICION DE EFECTIVO') + (cajero ? ' · cajero ' + cajero : '');
      a.duda = 'EFECTIVO_O_PAGO';
    }
  }

  // ---------- CARGO / ABONO ----------
  if (a.formato === 'CARGO_ABONO') {
    a.fecha = fpFechaTexto_(fpCampo_(t, 'Fecha de Operaci[oó]n')) || fApl;
    a.hora = (fpCampo_(t, 'Hora de Operaci[oó]n') || '').replace(/\s*horas?\s*$/i, '').trim() || null;
    var op2 = String(operacion || '').trim();
    a.comercio = op2;
    var llaveOp = 'BNT|' + cuenta + '|OP|' + op2 + '|' + a.fecha + '|' + a.hora + '|' + importe;
    var mIF = op2.match(/^(CARGO|ABONO) POR IF\s*(\d+)/i);

    if (mIF) {
      // traspaso entre cuentas Banorte; el número es la OTRA cuenta
      var otra = FP.CUENTAS[mIF[2].slice(-4)];
      var esCargo = mIF[1].toUpperCase() === 'CARGO';
      if (otra && bolsa) {
        a.tipo = 'TRASPASO';
        a.bolsa_sale = esCargo ? bolsa : otra;
        a.bolsa_entra = esCargo ? otra : bolsa;
        a.estado = 'CONFIRMADO';
        a.duda = null;
        a.llave = 'BNT|IF|' + a.bolsa_sale + '>' + a.bolsa_entra + '|' + a.fecha + '|' + importe;
      } else if (esCargo) {
        a.tipo = 'GASTO'; a.bolsa_sale = bolsa; a.duda = 'DESTINO'; a.llave = llaveOp;
      } else {
        a.tipo = 'INGRESO'; a.bolsa_entra = bolsa; a.duda = 'ORIGEN'; a.llave = llaveOp;
      }
    } else if (/^TRASP FONDOS/i.test(op2)) {
      // punta que SALE de esta cuenta
      a.tipo = 'GASTO'; a.bolsa_sale = bolsa; a.duda = 'DESTINO';
      a.pareja = 'SALE';
      a.llave = 'BNT|TRASP|' + a.fecha + '|' + a.hora + '|' + importe;
    } else if (/^TRASPASO$/i.test(op2)) {
      // punta que ENTRA a esta cuenta
      a.tipo = 'INGRESO'; a.bolsa_entra = bolsa; a.duda = 'ORIGEN';
      a.pareja = 'ENTRA';
      a.llave = 'BNT|TRASP|' + a.fecha + '|' + a.hora + '|' + importe;
    } else if (/^TRASPASO DE CTA\s*:?\s*\d{6,}/i.test(op2)) {
      // alguien te pasó dinero desde SU cuenta Banorte (el número es la suya);
      // "Cuenta Origen" del aviso es la tuya, a donde entró
      a.tipo = 'INGRESO'; a.bolsa_entra = bolsa; a.duda = 'ORIGEN'; a.llave = llaveOp;
      a.comercio = 'TRASPASO DE CTA : ' + op2.match(/(\d{6,})/)[1];
    } else if (/ORDEN DE PAGO SPEI/i.test(op2)) {
      a.tipo = 'GASTO'; a.bolsa_sale = bolsa; a.duda = 'DESTINO'; a.llave = llaveOp;
    } else if (/^[A-Z0-9]{15,}$/.test(op2)) {
      a.tipo = 'INGRESO'; a.bolsa_entra = bolsa; a.duda = 'ORIGEN';     // SPEI recibido
      a.llave = 'BNT|SPEI|' + op2;
    } else if (/^ABONO/i.test(op2)) {
      a.tipo = 'INGRESO'; a.bolsa_entra = bolsa; a.duda = 'ORIGEN'; a.llave = llaveOp;
    } else {
      a.tipo = null; a.duda = 'DESCONOCIDO'; a.llave = llaveOp;
    }
  }

  if (a.error) { a.tipo = null; a.bolsa_sale = null; a.bolsa_entra = null; a.estado = 'POR_REVISAR'; a.duda = 'CUENTA'; }
  if (!a.fecha) a.error = (a.error ? a.error + ' · ' : '') + 'sin fecha';
  return a;
}

// "Se realizo un ABONO SPEI de $ 30,000.00 MN el 02/SEP/2026 a las 10:44:02
//  horas a la cuenta ****3123 Clave de Rastreo BNET0100…"
function fpSpeiRecibido_(t, a) {
  a.formato = 'SPEI_RECIBIDO';
  var m = t.match(/ABONO SPEI de\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  var rastreo = (t.match(/Clave de Rastreo\s*([A-Z0-9]+)/i) || [])[1];
  var cuenta = fpCuenta_(t);
  var bolsa = cuenta ? FP.CUENTAS[cuenta] : null;
  if (!m || !rastreo) { a.error = 'SPEI recibido sin importe o sin clave de rastreo'; return a; }
  a.monto = Math.round(Number(m[1].replace(/,/g, '')) * 100) / 100;
  a.fecha = fpFechaTexto_((t.match(/\bel\s+(\d{1,2}\/[A-Za-z]{3,4}\/\d{4})/i) || [])[1]);
  a.hora = (t.match(/a las\s+(\d{1,2}:\d{2}(?::\d{2})?)/i) || [])[1] || null;
  a.comercio = rastreo;
  a.llave = 'BNT|SPEI|' + rastreo;
  if (!bolsa) { a.error = 'cuenta desconocida: ' + (cuenta || 'ninguna'); a.duda = 'CUENTA'; return a; }
  a.tipo = 'INGRESO';
  a.bolsa_entra = bolsa;
  a.duda = 'ORIGEN';
  if (!a.fecha) a.error = 'sin fecha';
  return a;
}

// ---------- ayudantes de lectura ----------

function fpCampo_(t, etiqueta) {
  var m = t.match(new RegExp(etiqueta + '\\s*:\\s*([^\\n]*)', 'i'));
  return m ? m[1].trim() : null;
}

function fpImporte_(t) {
  var m = t.match(/Importe\s*:\s*\$?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  var n = Number(m[1].replace(/,/g, ''));
  return n > 0 ? Math.round(n * 100) / 100 : null;
}

function fpCuenta_(t) {
  var m = t.match(/\*{3,}\s*(\d{4})/);
  return m ? m[1] : null;
}

// "24/Sep/2026", "02/SEP/2026" o "2026-09-24" → "2026-09-24"
function fpFechaTexto_(txt) {
  if (!txt) return null;
  var m = txt.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = txt.match(/(\d{1,2})\s*\/\s*([A-Za-zÁÉÍÓÚáéíóú]{3,4})\S*\s*\/\s*(\d{4})/);
  if (m) {
    var mes = FP_MESES[m[2].toUpperCase().slice(0, 3)];
    if (!mes) return null;
    return m[3] + '-' + fpDos_(mes) + '-' + fpDos_(Number(m[1]));
  }
  return null;
}

// día + mes de la operación, año de la fecha de aplicación
// (si la operación es de diciembre y se aplicó en enero, el año es el anterior)
function fpArmarFecha_(dia, mesTxt, fApl) {
  var mes = FP_MESES[mesTxt.toUpperCase().slice(0, 3)];
  if (!mes || !fApl) return fApl || null;
  var anio = Number(fApl.slice(0, 4));
  if (mes > Number(fApl.slice(5, 7))) anio -= 1;
  return anio + '-' + fpDos_(mes) + '-' + fpDos_(Number(dia));
}

function fpDos_(n) { return (n < 10 ? '0' : '') + n; }

// =====================================================================
// 4. CONSOLIDAR  (función pura: junta parejas, aplica anulaciones)
// =====================================================================

function fpConsolidar_(avisos) {
  var registrar = [], ignorados = [], porLlave = {}, anuladas = [], parejas = [];
  var puntas = {};

  avisos.forEach(function (a) {
    if (a.formato === 'ANULACION') { anuladas.push(a.anula); ignorados.push({ aviso: a, motivo: 'anula ' + a.anula }); return; }
    if (a.error || !a.llave || !a.monto || !a.fecha) { ignorados.push({ aviso: a, motivo: a.error || 'incompleto' }); return; }

    if (a.pareja) {
      var p = puntas[a.llave] || (puntas[a.llave] = {});
      p[a.pareja] = a;
    }
    if (porLlave[a.llave]) { ignorados.push({ aviso: a, motivo: 'repetido de ' + a.llave }); return; }
    porLlave[a.llave] = a;
    registrar.push(a);
  });

  // dos puntas de un traspaso → un solo traspaso confirmado
  Object.keys(puntas).forEach(function (llave) {
    var p = puntas[llave];
    if (p.SALE && p.ENTRA && p.SALE.bolsa_sale && p.ENTRA.bolsa_entra) {
      var r = porLlave[llave];
      r.tipo = 'TRASPASO';
      r.bolsa_sale = p.SALE.bolsa_sale;
      r.bolsa_entra = p.ENTRA.bolsa_entra;
      r.estado = 'CONFIRMADO';
      r.duda = null;
      r.comercio = 'TRASPASO ENTRE MIS CUENTAS';
      parejas.push({ llave: llave, bolsa_sale: r.bolsa_sale, bolsa_entra: r.bolsa_entra });
    }
  });

  // anulaciones → la compra original queda descartada
  anuladas.forEach(function (llave) {
    var r = porLlave[llave];
    if (r) { r.estado = 'DESCARTADO'; r.duda = null; r.descripcion = 'Anulada por Banorte'; }
  });

  return { registrar: registrar, ignorados: ignorados, anuladas: anuladas, parejas: parejas };
}

// =====================================================================
// 5. ESCRIBIR EN SUPABASE
// =====================================================================

function fpRegistrar_(consulta, notificar) {
  var cfg = fpConfig_();
  var plan = fpConsolidar_(fpLeerAvisos_(consulta));
  if (!plan.registrar.length && !plan.anuladas.length) return { leidos: 0, nuevos: 0 };

  var cats = {}, tipoCat = {};
  fpGet_(cfg, 'categorias?select=id,nombre,tipo').forEach(function (c) { cats[c.nombre] = c.id; tipoCat[c.id] = c.tipo; });
  var reglas = fpGet_(cfg, 'reglas?select=id,patron,categoria_id');

  var renglones = plan.registrar.map(function (a) {
    var catId = a.categoria ? (cats[a.categoria] || null) : null;
    var conRegla = a.comercio && (a.tipo === 'GASTO' || (a.tipo === 'INGRESO' && a.duda === 'ORIGEN'));
    if (!catId && conRegla) {
      var up = a.comercio.toUpperCase();
      for (var i = 0; i < reglas.length; i++) {
        var tr = tipoCat[reglas[i].categoria_id];
        if (a.tipo === 'INGRESO' ? tr !== 'INGRESO' : tr === 'INGRESO') continue;   // regla del tipo correcto
        if (up.indexOf(String(reglas[i].patron).toUpperCase()) !== -1) { catId = reglas[i].categoria_id; break; }
      }
      // comercio o depositante conocido: se confirma solo
      if (catId && (a.duda === 'CATEGORIA' || a.duda === 'ORIGEN') && a.estado === 'POR_REVISAR') { a.estado = 'CONFIRMADO'; a.duda = null; }
    }
    return {
      fecha: a.fecha, hora: a.hora || null, monto: a.monto, tipo: a.tipo || null,
      bolsa_sale: a.bolsa_sale || null, bolsa_entra: a.bolsa_entra || null,
      categoria_id: catId, comercio: a.comercio || null, descripcion: a.descripcion || null,
      estado: a.estado, duda: a.duda || null, fuente: 'CORREO', llave: a.llave,
      correo_id: a.correo_id, texto_original: (a.texto_original || '').slice(0, 4000)
    };
  });

  // 1) nuevos: lo que ya existe (misma llave) no se toca
  var nuevos = [];
  for (var i = 0; i < renglones.length; i += 200) {
    var res = fpFetch_(cfg, 'post', 'movimientos?on_conflict=llave',
      renglones.slice(i, i + 200), 'resolution=ignore-duplicates,return=representation');
    nuevos = nuevos.concat(JSON.parse(res || '[]'));
  }

  // 2) parejas: si una punta llegó en una corrida anterior, se completa
  var completadas = 0;
  plan.parejas.forEach(function (p) {
    var r = fpFetch_(cfg, 'patch',
      'movimientos?llave=eq.' + encodeURIComponent(p.llave) + '&estado=eq.POR_REVISAR&tipo=neq.TRASPASO',
      { tipo: 'TRASPASO', bolsa_sale: p.bolsa_sale, bolsa_entra: p.bolsa_entra,
        estado: 'CONFIRMADO', duda: null, comercio: 'TRASPASO ENTRE MIS CUENTAS' },
      'return=representation');
    completadas += JSON.parse(r || '[]').length;
  });

  // 3) anulaciones: la compra original se descarta (aunque ya estuviera registrada)
  var descartadas = 0;
  plan.anuladas.forEach(function (llave) {
    var r = fpFetch_(cfg, 'patch',
      'movimientos?llave=eq.' + encodeURIComponent(llave) + '&estado=neq.DESCARTADO',
      { estado: 'DESCARTADO', duda: null, descripcion: 'Anulada por Banorte' },
      'return=representation');
    descartadas += JSON.parse(r || '[]').length;
  });

  var avisos = 0;
  if (notificar) avisos = fpAvisar_(nuevos.filter(function (m) { return m.estado === 'POR_REVISAR'; }));

  return { leidos: renglones.length, nuevos: nuevos.length, parejas_completadas: completadas, anuladas: descartadas, avisos: avisos };
}

// =====================================================================
// 5b. AVISOS PUSHOVER
// =====================================================================

var FP_NOMBRE_BOLSA = { ENLACE: 'Enlace', INVERSION: 'Inversión', EFECTIVO: 'Efectivo', TERMINUS: 'Terminus' };
var FP_PREGUNTA = {
  CATEGORIA: '¿Qué fue?',
  EFECTIVO_O_PAGO: '¿A tu efectivo o pago a alguien?',
  ORIGEN: '¿De dónde vino?',
  DESTINO: '¿A dónde fue?'
};

function fpAvisar_(pendientes) {
  if (!pendientes.length) return 0;
  if (pendientes.length > FP.MAX_AVISOS) {
    return fpPush_({ title: 'Finanzas', message: pendientes.length + ' movimientos nuevos esperan tu respuesta.',
      url: FP.APP_URL, url_title: 'Abrir la bandeja' }) ? 1 : 0;
  }
  var n = 0;
  pendientes.forEach(function (m) { if (fpPush_(fpMensaje_(m))) n++; });
  return n;
}

function fpMensaje_(m) {
  var titulo = m.duda === 'EFECTIVO_O_PAGO' ? 'Cajero' : m.tipo === 'INGRESO' ? 'Entró dinero' : m.tipo === 'GASTO' ? 'Gasto' : 'Movimiento';
  var cuenta = FP_NOMBRE_BOLSA[m.bolsa_sale || m.bolsa_entra] || '';
  var monto = '$' + Number(m.monto).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    title: 'Finanzas · ' + titulo,
    message: monto + ' · ' + (m.comercio || '') + (cuenta ? ' · ' + cuenta : '') + '\n' + (FP_PREGUNTA[m.duda] || 'Revísalo'),
    url: FP.APP_URL + '?mov=' + m.id,
    url_title: 'Contestar'
  };
}

function fpPush_(msg) {
  var p = PropertiesService.getScriptProperties();
  var token = p.getProperty('PUSHOVER_TOKEN'), user = p.getProperty('PUSHOVER_USER');
  if (!token || !user) return false;
  msg.token = token; msg.user = user;
  // prioridad 1 = alta (suena aunque el teléfono esté en silencio, con Alertas críticas activadas en Pushover)
  // se cambia sin tocar código con la propiedad PUSHOVER_PRIORIDAD (0 normal · 1 alta · 2 emergencia)
  // OJO: UrlFetchApp manda los números como "1.0" y Pushover los rechaza → todo va como TEXTO entero
  var pr = parseInt(String(p.getProperty('PUSHOVER_PRIORIDAD') || '1').trim(), 10);
  if ([-2, -1, 0, 1, 2].indexOf(pr) === -1) pr = 1;
  msg.priority = String(pr);
  if (pr === 2) { msg.retry = '60'; msg.expire = '1800'; }
  var res = UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', { method: 'post', payload: msg, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) { Logger.log('Pushover ' + res.getResponseCode() + ': ' + res.getContentText()); return false; }
  return true;
}

function fpConfig_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL');
  var key = p.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_KEY en las propiedades del script.');
  return { url: url.replace(/\/+$/, ''), key: key };
}

function fpFetch_(cfg, metodo, ruta, cuerpo, prefer) {
  var h = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key };
  if (prefer) h.Prefer = prefer;
  var opc = { method: metodo, headers: h, muteHttpExceptions: true };
  if (cuerpo !== undefined) { opc.contentType = 'application/json'; opc.payload = JSON.stringify(cuerpo); }
  var res = UrlFetchApp.fetch(cfg.url + '/rest/v1/' + ruta, opc);
  if (res.getResponseCode() >= 300) {
    throw new Error('Supabase ' + res.getResponseCode() + ' en ' + ruta + ': ' + res.getContentText());
  }
  return res.getContentText();
}

function fpGet_(cfg, ruta) {
  return JSON.parse(fpFetch_(cfg, 'get', ruta));
}

// =====================================================================
// 6. HOJA DE PRUEBA
// =====================================================================

function fpHojaPrueba_() {
  var it = DriveApp.getFilesByName(FP.HOJA_PRUEBA);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  return SpreadsheetApp.create(FP.HOJA_PRUEBA);
}
