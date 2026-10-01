/* =====================================================================
 * Finanzas Personales · app.js · v1.4 · 01-oct-2026
 * Vistas: inicio · bandeja · movimientos · nuevo gasto · cuadrar saldo
 * Datos: Supabase (tablas bolsas, categorias, reglas, movimientos)
 * Regla de fechas: NUNCA toISOString() para una fecha local.
 * ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------------
  // 1. ACCESO A DATOS
  // ------------------------------------------------------------------
  var COLS = 'id,fecha,hora,monto,tipo,bolsa_sale,bolsa_entra,categoria_id,comercio,descripcion,estado,duda,fuente,llave';

  function dbReal() {
    var cfg = window.FP_CONFIG;
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fp-sesion' }
    });
    function ok(r) { if (r.error) throw r.error; return r.data; }
    return {
      sesion: async function () { return ok(await sb.auth.getSession()).session; },
      entrar: async function (email, pass) { ok(await sb.auth.signInWithPassword({ email: email, password: pass })); },
      salir: async function () { await sb.auth.signOut(); },
      cargar: async function () {
        var r = await Promise.all([
          sb.from('bolsas').select('*').order('orden'),
          sb.from('categorias').select('*').order('orden'),
          sb.from('reglas').select('*')
        ]);
        var movs = [], desde = 0, paso = 1000;
        while (true) {
          var p = ok(await sb.from('movimientos').select(COLS)
            .order('fecha', { ascending: false }).order('hora', { ascending: false, nullsFirst: false })
            .range(desde, desde + paso - 1));
          movs = movs.concat(p);
          if (p.length < paso) break;
          desde += paso;
        }
        return { bolsas: ok(r[0]), cats: ok(r[1]), reglas: ok(r[2]), movs: movs };
      },
      actualizar: async function (id, cambios) {
        return ok(await sb.from('movimientos').update(cambios).eq('id', id).select(COLS).single());
      },
      actualizarVarios: async function (ids, cambios) {
        if (!ids.length) return [];
        return ok(await sb.from('movimientos').update(cambios).in('id', ids).select(COLS));
      },
      insertar: async function (mov) {
        return ok(await sb.from('movimientos').insert(mov).select(COLS).single());
      },
      guardarRegla: async function (patron, categoria_id) {
        return ok(await sb.from('reglas').upsert({ patron: patron, categoria_id: categoria_id }, { onConflict: 'patron' }).select().single());
      },
      actualizarBolsa: async function (id, cambios) {
        return ok(await sb.from('bolsas').update(cambios).eq('id', id).select().single());
      }
    };
  }

  var DB = window.FP_DB || dbReal();

  // ------------------------------------------------------------------
  // 2. ESTADO Y AYUDANTES
  // ------------------------------------------------------------------
  var S = { bolsas: [], cats: [], reglas: [], movs: [], vista: 'inicio', mes: null, filtro: 'todos', pasos: {}, abiertas: {} };
  var $ = function (s) { return document.querySelector(s); };
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var MESES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  function dos(n) { return (n < 10 ? '0' : '') + n; }
  function hoy() { var d = new Date(); return d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()); }
  function mesDe(f) { return f.slice(0, 7); }
  function fechaCorta(f) { return Number(f.slice(8, 10)) + ' ' + MESES3[Number(f.slice(5, 7)) - 1]; }
  function nombreMes(ym) { return MESES[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4); }
  function dinero(n) {
    var v = Math.abs(Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (Number(n) < 0 ? '−$' : '$') + v;
  }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bolsa(id) { return S.bolsas.find(function (b) { return b.id === id; }); }
  function nomBolsa(id) { var b = bolsa(id); return b ? b.nombre : (id || '—'); }
  function cat(id) { return S.cats.find(function (c) { return c.id === id; }); }
  // subcategorías: padre_id = la categoría madre; terminus = conceptos de lo que pagas por Terminus
  function raiz(c) { return c && c.padre_id ? (cat(c.padre_id) || c) : c; }
  function hijos(id) { return S.cats.filter(function (c) { return c.padre_id === id && c.activa; }).sort(function (a, b) { return a.orden - b.orden; }); }
  function nombreCat(c) { if (!c) return ''; var r = raiz(c); return r !== c ? r.nombre + ' · ' + c.nombre : c.nombre; }
  function catTerminus() { return S.cats.find(function (c) { return c.terminus && !c.padre_id && c.activa; }); }
  function modoCat(c) { return c.terminus ? 'TERMINUS' : c.tipo; }
  // ingresos que se aprenden: "TRASPASO DE CTA : 1151995728" (el número es quien te paga)
  function patronIngreso(comercio) { return /^TRASPASO DE CTA\s*:\s*\d{6,}\s*$/i.test(comercio || '') ? comercio : null; }
  function mov(id) { return S.movs.find(function (m) { return m.id === id; }); }
  function vivo(m) { return m.estado !== 'DESCARTADO'; }

  function aviso(t) {
    var a = $('#aviso'); a.textContent = t; a.hidden = false;
    clearTimeout(aviso._t); aviso._t = setTimeout(function () { a.hidden = true; }, 2600);
  }
  function fallo(e) { console.error(e); aviso('No se pudo guardar: ' + (e && e.message ? e.message : e)); }

  function reemplazar(m) {
    var i = S.movs.findIndex(function (x) { return x.id === m.id; });
    if (i >= 0) S.movs[i] = m; else S.movs.unshift(m);
  }

  function saldos() {
    var r = {};
    S.bolsas.forEach(function (b) { r[b.id] = Number(b.saldo_inicial) || 0; });
    S.movs.forEach(function (m) {
      if (!vivo(m) || !m.tipo) return;
      if (m.bolsa_entra && r[m.bolsa_entra] != null && m.fecha > bolsa(m.bolsa_entra).fecha_saldo_inicial) r[m.bolsa_entra] += Number(m.monto);
      if (m.bolsa_sale && r[m.bolsa_sale] != null && m.fecha > bolsa(m.bolsa_sale).fecha_saldo_inicial) r[m.bolsa_sale] -= Number(m.monto);
    });
    Object.keys(r).forEach(function (k) { r[k] = Math.round(r[k] * 100) / 100; });
    return r;
  }

  function porRevisar() { return S.movs.filter(function (m) { return m.estado === 'POR_REVISAR'; }); }

  // categorías principales ordenadas por uso (el uso de las subcategorías cuenta para su madre)
  function catsPorUso(tipo) {
    var uso = {};
    S.movs.forEach(function (m) { var r = raiz(cat(m.categoria_id)); if (r && vivo(m)) uso[r.id] = (uso[r.id] || 0) + 1; });
    return S.cats.filter(function (c) { return c.tipo === tipo && c.activa && !c.padre_id && !c.terminus; })
      .sort(function (a, b) { return (uso[b.id] || 0) - (uso[a.id] || 0) || a.orden - b.orden; });
  }

  // signo y clase de un movimiento para mostrar
  function lado(m) {
    if (m.tipo === 'GASTO') return { clase: 'sale', signo: -1 };
    if (m.tipo === 'INGRESO') return { clase: 'entra', signo: 1 };
    return { clase: 'pasa', signo: 1 };
  }
  function descripcionBolsas(m) {
    if (m.tipo === 'TRASPASO') return nomBolsa(m.bolsa_sale) + ' → ' + nomBolsa(m.bolsa_entra);
    if (m.bolsa_sale) return 'de ' + nomBolsa(m.bolsa_sale);
    if (m.bolsa_entra) return 'a ' + nomBolsa(m.bolsa_entra);
    return 'sin cuenta';
  }
  function titulo(m) { return m.descripcion || m.comercio || (cat(m.categoria_id) || {}).nombre || 'Movimiento'; }

  // ------------------------------------------------------------------
  // 3. ARRANQUE, SESIÓN, NAVEGACIÓN
  // ------------------------------------------------------------------
  async function arrancar() {
    try {
      var s = await DB.sesion();
      if (!s) return pintarLogin();
      await recargar();
      $('#nav').hidden = false;
      $('#btnRecargar').hidden = false;
      var q = new URLSearchParams(location.search);
      var mq = q.get('mov') && mov(q.get('mov'));
      if (q.get('cuadrar') && bolsa(q.get('cuadrar'))) { ir('inicio'); abrirCuadre(q.get('cuadrar')); }
      else if (mq && mq.estado === 'POR_REVISAR') { ir('bandeja'); resaltar(mq.id); }
      else if (mq) { ir('movimientos'); abrirEditor(mq); }
      else ir(porRevisar().length ? 'bandeja' : 'inicio');
      if (location.search && !(mq && mq.estado !== 'POR_REVISAR') && !q.get('cuadrar')) history.replaceState(null, '', location.pathname);
    } catch (e) {
      console.error(e);
      $('#vista').innerHTML = '<div class="tarjeta"><b>No se pudo cargar.</b><p class="meta">' + esc(e.message || e) +
        '</p><button class="btn" id="reint">Reintentar</button> <button class="btn rubi" id="salir">Salir</button></div>';
      $('#reint').onclick = arrancar;
      $('#salir').onclick = async function () { await DB.salir(); location.reload(); };
    }
  }

  async function recargar() {
    var d = await DB.cargar();
    S.bolsas = d.bolsas; S.cats = d.cats; S.reglas = d.reglas; S.movs = d.movs;
    if (!S.mes) S.mes = mesDe(hoy());
  }

  function pintarLogin() {
    $('#nav').hidden = true;
    $('#titulo').textContent = 'Finanzas';
    $('#vista').innerHTML =
      '<div class="login tarjeta"><h2>Entrar</h2>' +
      '<div class="campo"><label>Correo</label><input id="lEmail" type="email" autocomplete="username"></div>' +
      '<div class="campo"><label>Contraseña</label><input id="lPass" type="password" autocomplete="current-password"></div>' +
      '<div class="acciones"><button class="btn lleno" id="lBtn">Entrar</button></div><div class="error" id="lErr"></div></div>';
    $('#lBtn').onclick = async function () {
      $('#lErr').textContent = '';
      try { await DB.entrar($('#lEmail').value.trim(), $('#lPass').value); arrancar(); }
      catch (e) { $('#lErr').textContent = 'No se pudo entrar: ' + (e.message || e); }
    };
  }

  function ir(v) {
    if (v === 'nuevo') { abrirEditor(null); return; }
    S.vista = v;
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('activo', b.dataset.ir === v); });
    pintar();
    window.scrollTo(0, 0);
  }

  function pintar() {
    var n = porRevisar().length;
    var badge = $('#badge'); badge.hidden = !n; badge.textContent = n;
    if (S.vista === 'inicio') pintarInicio();
    else if (S.vista === 'bandeja') pintarBandeja();
    else if (S.vista === 'movimientos') pintarMovimientos();
  }

  // ------------------------------------------------------------------
  // 4. INICIO
  // ------------------------------------------------------------------
  function pintarInicio() {
    $('#titulo').textContent = 'Inicio';
    var sal = saldos();
    var pr = porRevisar().length;
    var personales = S.bolsas.filter(function (b) { return b.activa && b.tipo !== 'VIRTUAL'; });
    var total = personales.reduce(function (a, b) { return a + sal[b.id]; }, 0);
    var h = '';
    if (pr) h += '<button class="alerta" data-ir="bandeja">' + pr + (pr === 1 ? ' movimiento espera' : ' movimientos esperan') + ' tu respuesta →</button>';
    if (personales.every(function (b) { return Number(b.saldo_inicial) === 0; })) {
      h += '<div class="tarjeta" style="background:var(--zafiro-fondo);border-color:transparent"><b>Para arrancar:</b> toca cada cuenta y escribe su saldo real ' +
        '(lo que dice Banorte, lo que traes en la cartera) y elige «Corregir saldo de arranque». Mientras tanto los saldos pueden salir raros o negativos.</div>';
    }
    h += '<div class="tarjeta"><div class="meta">Tu dinero</div><div class="total num" style="text-align:left">' + dinero(total) + '</div></div>';
    h += '<div class="bolsas">';
    S.bolsas.filter(function (b) { return b.activa; }).forEach(function (b) {
      if (b.tipo === 'VIRTUAL') {
        var v = sal[b.id];
        var txt = v < 0 ? 'Le debes a Terminus' : v > 0 ? 'Terminus te debe' : 'A mano con Terminus';
        h += '<button class="bolsa terminus" data-cuadrar="' + b.id + '"><div class="nombre">' + esc(b.nombre) + '</div>' +
          '<div class="saldo">' + dinero(Math.abs(v)) + '</div><div class="pie">' + txt + '</div></button>';
      } else {
        h += '<button class="bolsa" data-cuadrar="' + b.id + '"><div class="nombre">' + esc(b.nombre) + '</div>' +
          '<div class="saldo">' + dinero(sal[b.id]) + '</div><div class="pie">Toca para cuadrar</div></button>';
      }
    });
    h += '</div>';

    // gastos del mes
    var ym = mesDe(hoy());
    var gastos = S.movs.filter(function (m) { return vivo(m) && m.tipo === 'GASTO' && mesDe(m.fecha) === ym; });
    var totalG = gastos.reduce(function (a, m) { return a + Number(m.monto); }, 0);
    // por categoría madre; las que tienen subcategorías se abren para ver el desglose
    var porCat = {}, porSub = {};
    gastos.forEach(function (m) {
      var c = cat(m.categoria_id), r = raiz(c), k = r ? r.id : 0, monto = Number(m.monto);
      porCat[k] = (porCat[k] || 0) + monto;
      if (r && hijos(r.id).length) {
        var s = porSub[k] = porSub[k] || {}, sk = c === r ? 'Otros' : c.nombre;
        s[sk] = (s[sk] || 0) + monto;
      }
    });
    var filas = Object.keys(porCat).map(function (k) { return [Number(k), porCat[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    h += '<div class="seccion">Gastos de ' + nombreMes(ym) + '</div><div class="tarjeta">';
    h += '<div class="mov-cab"><span>Total</span><span class="monto sale num">' + dinero(totalG) + '</span></div>';
    filas.slice(0, 8).forEach(function (f) {
      var r = cat(f[0]), subs = porSub[f[0]], abierta = S.abiertas[f[0]];
      var pct = totalG ? Math.round(f[1] / totalG * 100) : 0;
      var fila = '<span>' + esc(r ? r.nombre : 'Sin categoría') + (subs ? (abierta ? ' ▾' : ' ›') : '') + '</span><span class="num">' + dinero(f[1]) + '</span>' +
        '<div class="riel"><i style="width:' + pct + '%"></i></div>';
      h += subs ? '<button class="barra-cat abre" data-grupo="' + f[0] + '">' + fila + '</button>' : '<div class="barra-cat">' + fila + '</div>';
      if (subs && abierta) {
        Object.keys(subs).map(function (k) { return [k, subs[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x) {
          h += '<div class="sub-cat"><span>' + esc(x[0]) + '</span><span class="num">' + dinero(x[1]) + '</span></div>';
        });
      }
    });
    if (!filas.length) h += '<div class="meta">Sin gastos este mes.</div>';
    h += '</div>';

    // lo que pagaste por Terminus (traspasos a la cuenta con Terminus), por concepto
    var term = S.movs.filter(function (m) { return vivo(m) && m.tipo === 'TRASPASO' && m.bolsa_entra === 'TERMINUS' && mesDe(m.fecha) === ym; });
    if (term.length) {
      var porT = {}, totalT = 0;
      term.forEach(function (m) {
        var c = cat(m.categoria_id), k = !c ? 'Sin concepto' : c.padre_id ? c.nombre : 'Otros';
        porT[k] = (porT[k] || 0) + Number(m.monto); totalT += Number(m.monto);
      });
      h += '<div class="seccion">Pagaste por Terminus en ' + nombreMes(ym) + '</div><div class="tarjeta">';
      h += '<div class="mov-cab"><span>Total</span><span class="monto pasa num">' + dinero(totalT) + '</span></div>';
      Object.keys(porT).map(function (k) { return [k, porT[k]]; }).sort(function (a, b) { return b[1] - a[1]; }).forEach(function (x) {
        var pct = totalT ? Math.round(x[1] / totalT * 100) : 0;
        h += '<div class="barra-cat"><span>' + esc(x[0]) + '</span><span class="num">' + dinero(x[1]) + '</span>' +
          '<div class="riel"><i style="width:' + pct + '%"></i></div></div>';
      });
      h += '</div>';
    }
    $('#vista').innerHTML = h;
  }

  // ------------------------------------------------------------------
  // 5. BANDEJA
  // ------------------------------------------------------------------
  function modo(m) {
    if (m.duda === 'EFECTIVO_O_PAGO') return 'cajero';
    if (m.tipo === 'GASTO' && m.duda === 'CATEGORIA') return 'compra';
    if (m.tipo === 'INGRESO') return 'entra';
    if (m.tipo === 'GASTO') return 'sale';
    return 'otro';
  }

  function pintarBandeja() {
    $('#titulo').textContent = 'Bandeja';
    var lista = porRevisar().slice().sort(function (a, b) { return (b.fecha + (b.hora || '')).localeCompare(a.fecha + (a.hora || '')); });
    if (!lista.length) { $('#vista').innerHTML = '<div class="vacio"><b>Todo al día.</b><br>No hay nada que revisar.</div>'; return; }
    $('#vista').innerHTML = lista.map(tarjeta).join('');
  }

  function botonCat(m, c, txt, acc) {
    return '<button class="btn chico zafiro" data-acc="' + (acc || 'cat') + '" data-id="' + m.id + '" data-cat="' + c.id + '"' +
      (acc ? '' : ' data-final="1"') + '>' + esc(txt) + '</button>';
  }
  // primero las categorías principales; si la elegida tiene subcategorías, un segundo nivel
  function botonesCats(m, tipoCat) {
    var madre = cat((S.pasos[m.id] || {}).madre);
    if (madre) {
      return '<div class="pregunta">' + esc(madre.nombre) + ':</div><div class="botones">' +
        hijos(madre.id).map(function (c) { return botonCat(m, c, c.nombre); }).join('') + botonCat(m, madre, 'Otros') + '</div>' +
        '<div class="botones" style="margin-top:8px"><button class="btn" data-acc="sinMadre" data-id="' + m.id + '">← Categorías</button></div>';
    }
    return '<div class="botones">' + catsPorUso(tipoCat).map(function (c) {
      return botonCat(m, c, c.nombre + (hijos(c.id).length ? ' ›' : ''), 'cat');
    }).join('') + '</div>';
  }
  function botonesBolsas(m, excluir, acc) {
    return '<div class="botones">' + S.bolsas.filter(function (b) { return b.activa && b.id !== excluir && b.tipo !== 'VIRTUAL'; }).map(function (b) {
      return '<button class="btn chico zafiro" data-acc="' + acc + '" data-id="' + m.id + '" data-bolsa="' + b.id + '">' + esc(b.nombre) + '</button>';
    }).join('') + '</div>';
  }

  function tarjeta(m) {
    var l = lado(m), md = modo(m), p = S.pasos[m.id] || {};
    var h = '<div class="tarjeta" id="t-' + m.id + '">';
    h += '<div class="mov-cab"><div><div class="comercio">' + esc(m.comercio || 'Sin descripción') + '</div>' +
      '<div class="meta">' + fechaCorta(m.fecha) + (m.hora ? ' · ' + m.hora.slice(0, 5) : '') + ' · ' + esc(descripcionBolsas(m)) + '</div></div>' +
      '<div class="monto num ' + l.clase + '">' + dinero(m.monto) + '</div></div>';

    if (p.paso === 'cats') {
      h += '<input class="nota" data-nota="' + m.id + '" placeholder="' + (p.tipoCat === 'INGRESO' ? '¿De quién? Luego toca la categoría' : '¿A quién? Luego toca la categoría') + '" value="' + esc(p.nota || '') + '">';
      h += '<div class="pregunta">' + (p.tipoCat === 'INGRESO' ? '¿Qué tipo de ingreso?' : '¿En qué se fue?') + '</div>';
      h += botonesCats(m, p.tipoCat);
      h += '<div class="pie-tarjeta"><button class="btn" data-acc="atras" data-id="' + m.id + '">← Atrás</button></div>';
    } else if (p.paso === 'terminus') {
      var t = catTerminus();
      h += '<div class="pregunta">¿Qué pagaste de Terminus?</div><div class="botones">' +
        hijos(t.id).map(function (c) { return botonCat(m, c, c.nombre, 'aTerminus'); }).join('') + botonCat(m, t, 'Otros', 'aTerminus') + '</div>';
      h += '<div class="pie-tarjeta"><button class="btn" data-acc="atras" data-id="' + m.id + '">← Atrás</button></div>';
    } else if (p.paso === 'bolsas') {
      h += '<div class="pregunta">' + (md === 'entra' ? '¿De cuál de tus cuentas vino?' : '¿A cuál de tus cuentas fue?') + '</div>';
      h += botonesBolsas(m, md === 'entra' ? m.bolsa_entra : m.bolsa_sale, md === 'entra' ? 'deBolsa' : 'aBolsa');
      h += '<div class="pie-tarjeta"><button class="btn" data-acc="atras" data-id="' + m.id + '">← Atrás</button></div>';
    } else if (md === 'compra') {
      h += '<div class="pregunta">¿Qué fue?</div>' + botonesCats(m, 'GASTO');
      h += '<div class="botones" style="margin-top:8px"><button class="btn amatista" data-acc="aTerminus" data-id="' + m.id + '">Es de Terminus</button></div>';
    } else if (md === 'cajero') {
      h += '<div class="pregunta">¿Sacaste efectivo o le pagaste a alguien?</div><div class="botones">' +
        '<button class="btn" data-acc="efectivo" data-id="' + m.id + '">A mi efectivo</button>' +
        '<button class="btn zafiro" data-acc="paso" data-paso="cats" data-tipocat="GASTO" data-id="' + m.id + '">Pago a alguien</button></div>';
    } else if (md === 'entra') {
      h += '<div class="pregunta">¿De dónde vino este dinero?</div><div class="botones">' +
        '<button class="btn amatista" data-acc="deTerminus" data-id="' + m.id + '">Me lo mandó Terminus</button>' +
        '<button class="btn" data-acc="paso" data-paso="cats" data-tipocat="INGRESO" data-id="' + m.id + '">Otro ingreso</button>' +
        '<button class="btn zafiro" data-acc="paso" data-paso="bolsas" data-id="' + m.id + '">De otra cuenta mía</button></div>';
    } else if (md === 'sale') {
      h += '<div class="pregunta">¿A dónde fue este dinero?</div><div class="botones">' +
        '<button class="btn amatista" data-acc="aTerminus" data-id="' + m.id + '">Pago de algo de Terminus</button>' +
        '<button class="btn" data-acc="paso" data-paso="cats" data-tipocat="GASTO" data-id="' + m.id + '">Gasto mío</button>' +
        '<button class="btn zafiro" data-acc="paso" data-paso="bolsas" data-id="' + m.id + '">A otra cuenta mía</button></div>';
    } else {
      h += '<div class="pregunta">No reconocí este movimiento.</div><div class="botones">' +
        '<button class="btn" data-acc="editar" data-id="' + m.id + '">Completar a mano</button></div>';
    }
    if (!p.paso) {
      h += '<div class="pie-tarjeta"><button class="btn" data-acc="editar" data-id="' + m.id + '">Editar</button>' +
        '<button class="btn" data-acc="descartar" data-id="' + m.id + '">Descartar</button></div>';
    }
    return h + '</div>';
  }

  function resaltar(id) {
    var el = document.getElementById('t-' + id);
    if (!el) return;
    el.classList.add('resaltada');
    setTimeout(function () { el.scrollIntoView({ block: 'center' }); }, 50);
  }

  function repintarTarjeta(id) {
    var el = document.getElementById('t-' + id);
    var m = mov(id);
    if (el && m) el.outerHTML = tarjeta(m); else pintar();
  }

  async function resolver(m, cambios, texto) {
    cambios.estado = 'CONFIRMADO';
    cambios.duda = null;
    var nota = (S.pasos[m.id] || {}).nota;
    if (nota) cambios.descripcion = nota;
    try {
      var r = await DB.actualizar(m.id, cambios);
      reemplazar(r);
      delete S.pasos[m.id];
      aviso(texto || 'Listo');
      pintar();
      return r;
    } catch (e) { fallo(e); }
  }

  async function elegirCategoria(m, catId) {
    var p = S.pasos[m.id] || {};
    var md = modo(m);
    var c = cat(catId);
    if (p.paso === 'cats') {
      // viene de "pago a alguien", "gasto mío" u "otro ingreso"
      var cambios = c.tipo === 'INGRESO'
        ? { tipo: 'INGRESO', bolsa_sale: null, bolsa_entra: m.bolsa_entra || m.bolsa_sale, categoria_id: catId }
        : { tipo: 'GASTO', bolsa_sale: m.bolsa_sale || m.bolsa_entra, bolsa_entra: null, categoria_id: catId };
      var hecho = await resolver(m, cambios, nombreCat(c));
      // ingreso de alguien conocido: la próxima vez se confirma solo
      if (hecho && c.tipo === 'INGRESO' && patronIngreso(m.comercio)) {
        try { await DB.guardarRegla(m.comercio, catId); } catch (e) { fallo(e); }
      }
      return hecho;
    }
    if (md === 'compra') {
      var r = await resolver(m, { categoria_id: catId }, nombreCat(c));
      if (!r || !m.comercio) return;
      // regla + las demás compras iguales pendientes
      try {
        await DB.guardarRegla(m.comercio, catId);
        var iguales = S.movs.filter(function (x) {
          return x.id !== m.id && x.estado === 'POR_REVISAR' && x.tipo === 'GASTO' && x.duda === 'CATEGORIA' && x.comercio === m.comercio;
        }).map(function (x) { return x.id; });
        if (iguales.length) {
          var hechos = await DB.actualizarVarios(iguales, { categoria_id: catId, estado: 'CONFIRMADO', duda: null });
          hechos.forEach(reemplazar);
          aviso(c.nombre + ' · y ' + hechos.length + ' más de ' + m.comercio);
          pintar();
        }
      } catch (e) { fallo(e); }
    }
  }

  document.addEventListener('click', async function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.ir) { ir(b.dataset.ir); return; }
    if (b.dataset.cuadrar) { abrirCuadre(b.dataset.cuadrar); return; }
    if (b.dataset.grupo) { S.abiertas[b.dataset.grupo] = !S.abiertas[b.dataset.grupo]; pintar(); return; }
    var acc = b.dataset.acc; if (!acc) return;
    var m = mov(b.dataset.id); if (!m) return;
    if (acc === 'cat') {
      var cc = cat(Number(b.dataset.cat));
      if (!b.dataset.final && cc && hijos(cc.id).length) { S.pasos[m.id] = Object.assign(S.pasos[m.id] || {}, { madre: cc.id }); return repintarTarjeta(m.id); }
      return elegirCategoria(m, Number(b.dataset.cat));
    }
    if (acc === 'sinMadre') { if (S.pasos[m.id]) delete S.pasos[m.id].madre; return repintarTarjeta(m.id); }
    if (acc === 'paso') { S.pasos[m.id] = { paso: b.dataset.paso, tipoCat: b.dataset.tipocat }; return repintarTarjeta(m.id); }
    if (acc === 'atras') { delete S.pasos[m.id]; return repintarTarjeta(m.id); }
    if (acc === 'efectivo') return resolver(m, {}, 'A tu efectivo');
    if (acc === 'aTerminus') {
      // primero pregunta el concepto (nóminas, material…); sin conceptos en Supabase, se carga directo
      if (!b.dataset.cat && catTerminus()) { S.pasos[m.id] = Object.assign(S.pasos[m.id] || {}, { paso: 'terminus' }); return repintarTarjeta(m.id); }
      var ct = cat(Number(b.dataset.cat));
      return resolver(m, { tipo: 'TRASPASO', bolsa_sale: m.bolsa_sale || m.bolsa_entra, bolsa_entra: 'TERMINUS', categoria_id: ct ? ct.id : null },
        ct ? nombreCat(ct) + ' · a la cuenta con Terminus' : 'Cargado a la cuenta con Terminus');
    }
    if (acc === 'deTerminus') return resolver(m, { tipo: 'TRASPASO', bolsa_sale: 'TERMINUS', bolsa_entra: m.bolsa_entra || m.bolsa_sale, categoria_id: null }, 'Registrado como dinero de Terminus');
    if (acc === 'aBolsa') return resolver(m, { tipo: 'TRASPASO', bolsa_sale: m.bolsa_sale, bolsa_entra: b.dataset.bolsa, categoria_id: null }, 'Traspaso registrado');
    if (acc === 'deBolsa') return resolver(m, { tipo: 'TRASPASO', bolsa_sale: b.dataset.bolsa, bolsa_entra: m.bolsa_entra, categoria_id: null }, 'Traspaso registrado');
    if (acc === 'editar') return abrirEditor(m);
    if (acc === 'descartar') {
      try { reemplazar(await DB.actualizar(m.id, { estado: 'DESCARTADO', duda: null })); aviso('Descartado'); pintar(); }
      catch (e) { fallo(e); }
    }
  });

  document.addEventListener('input', function (ev) {
    var id = ev.target.dataset && ev.target.dataset.nota;
    if (id) { S.pasos[id] = S.pasos[id] || {}; S.pasos[id].nota = ev.target.value; }
  });

  // ------------------------------------------------------------------
  // 6. MOVIMIENTOS
  // ------------------------------------------------------------------
  function pintarMovimientos() {
    $('#titulo').textContent = 'Movimientos';
    var lista = S.movs.filter(function (m) {
      if (mesDe(m.fecha) !== S.mes) return false;
      if (S.filtro === 'revisar') return m.estado === 'POR_REVISAR';
      if (S.filtro === 'gastos') return m.tipo === 'GASTO' && vivo(m);
      return true;
    });
    var h = '<div class="mes"><button class="btn chico" id="mAnt">‹</button><b>' + nombreMes(S.mes) + '</b><button class="btn chico" id="mSig">›</button></div>';
    h += '<div class="filtros">' + [['todos', 'Todos'], ['gastos', 'Gastos'], ['revisar', 'Por revisar']].map(function (f) {
      return '<button data-filtro="' + f[0] + '" class="' + (S.filtro === f[0] ? 'activo' : '') + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    if (!lista.length) h += '<div class="vacio">Nada en este mes.</div>';
    var dia = null;
    lista.forEach(function (m) {
      if (m.fecha !== dia) { dia = m.fecha; h += '<div class="dia">' + fechaCorta(dia) + '</div>'; }
      var l = lado(m), c = cat(m.categoria_id);
      h += '<button class="fila ' + (vivo(m) ? '' : 'descartado') + '" data-editar="' + m.id + '"><div class="txt">' +
        '<div class="comercio">' + esc(titulo(m)) + '</div><div class="meta">' +
        (m.estado === 'POR_REVISAR' ? '<span class="chip revisar">por revisar</span>' : '') +
        (c ? '<span class="chip">' + esc(nombreCat(c)) + '</span>' : '') + esc(descripcionBolsas(m)) + '</div></div>' +
        '<div class="num ' + l.clase + '">' + (m.tipo === 'GASTO' ? '−' : m.tipo === 'INGRESO' ? '+' : '') + dinero(m.monto) + '</div></button>';
    });
    $('#vista').innerHTML = h;
    $('#mAnt').onclick = function () { S.mes = moverMes(S.mes, -1); pintar(); };
    $('#mSig').onclick = function () { S.mes = moverMes(S.mes, 1); pintar(); };
  }
  function moverMes(ym, d) {
    var y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)) + d;
    if (mo < 1) { mo = 12; y--; } if (mo > 12) { mo = 1; y++; }
    return y + '-' + dos(mo);
  }
  document.addEventListener('click', function (ev) {
    var f = ev.target.closest('[data-filtro]'); if (f) { S.filtro = f.dataset.filtro; pintar(); return; }
    var e = ev.target.closest('[data-editar]'); if (e) abrirEditor(mov(e.dataset.editar));
  });

  // ------------------------------------------------------------------
  // 7. EDITOR (nuevo gasto y corrección)
  // ------------------------------------------------------------------
  function opcionesBolsa(sel, conVacio) {
    return (conVacio ? '<option value="">—</option>' : '') + S.bolsas.filter(function (b) { return b.activa; }).map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' + esc(b.nombre) + '</option>';
    }).join('');
  }
  // tipo: GASTO, INGRESO o TERMINUS (conceptos de lo que pagas por Terminus)
  function opcionesCat(tipo, sel) {
    function op(c, txt) { return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(txt) + '</option>'; }
    var raices = tipo === 'TERMINUS' ? [catTerminus()].filter(Boolean) : catsPorUso(tipo);
    return '<option value="">Sin categoría</option>' + raices.map(function (r) {
      var hs = hijos(r.id);
      if (!hs.length) return op(r, r.nombre);
      return '<optgroup label="' + esc(r.nombre) + '">' + hs.map(function (c) { return op(c, c.nombre); }).join('') + op(r, r.nombre + ' · otros') + '</optgroup>';
    }).join('');
  }

  function abrirEditor(m) {
    var nuevo = !m;
    var d = m || { tipo: 'GASTO', bolsa_sale: 'EFECTIVO', bolsa_entra: null, categoria_id: null, monto: '', fecha: hoy(), descripcion: '' };
    var hoja = $('#hoja');
    hoja.innerHTML = '<div class="panel"><h2>' + (nuevo ? 'Nuevo gasto' : 'Movimiento') + '</h2>' +
      (m && m.comercio ? '<div class="meta">' + esc(m.comercio) + '</div>' : '') +
      '<div class="fila2"><div class="campo"><label>Monto</label><input id="eMonto" type="number" inputmode="decimal" step="0.01" value="' + esc(d.monto) + '"></div>' +
      '<div class="campo"><label>Fecha</label><input id="eFecha" type="date" value="' + esc(d.fecha) + '"></div></div>' +
      '<div class="campo"><label>Tipo</label><select id="eTipo">' + ['GASTO', 'INGRESO', 'TRASPASO'].map(function (t) {
        return '<option' + (d.tipo === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select></div>' +
      '<div class="fila2"><div class="campo" id="cSale"><label>Sale de</label><select id="eSale">' + opcionesBolsa(d.bolsa_sale, true) + '</select></div>' +
      '<div class="campo" id="cEntra"><label>Entra a</label><select id="eEntra">' + opcionesBolsa(d.bolsa_entra, true) + '</select></div></div>' +
      '<div class="campo" id="cCat"><label>Categoría</label><select id="eCat"></select></div>' +
      '<div class="campo"><label>Descripción</label><input id="eDesc" value="' + esc(d.descripcion || '') + '" placeholder="Opcional"></div>' +
      '<div class="error" id="eErr"></div>' +
      '<div class="acciones"><button class="btn lleno" id="eGuardar">Guardar</button>' +
      (nuevo ? '' : (m.estado === 'DESCARTADO' ? '<button class="btn zafiro" id="eRevivir">Recuperar</button>' : '<button class="btn rubi" id="eDescartar">Descartar</button>')) +
      '<button class="btn" id="eCerrar">Cancelar</button></div></div>';
    hoja.hidden = false;

    // qué categorías aplican: las de gasto, las de ingreso, o los conceptos de Terminus en un traspaso a Terminus
    function modoEd() {
      var t = $('#eTipo').value;
      return t !== 'TRASPASO' ? t : ($('#eEntra').value === 'TERMINUS' && catTerminus() ? 'TERMINUS' : null);
    }
    function ajustar() {
      var t = $('#eTipo').value;
      $('#cSale').style.display = t === 'INGRESO' ? 'none' : '';
      $('#cEntra').style.display = t === 'GASTO' ? 'none' : '';
      if (t === 'INGRESO' && !$('#eEntra').value) $('#eEntra').value = d.bolsa_sale || 'ENLACE';
      if (t === 'GASTO' && !$('#eSale').value) $('#eSale').value = d.bolsa_entra || 'EFECTIVO';
      var mc = modoEd();
      $('#cCat').style.display = mc ? '' : 'none';
      var catSel = Number($('#eCat').value) || d.categoria_id;
      var c = cat(catSel);
      $('#eCat').innerHTML = mc ? opcionesCat(mc, c && modoCat(c) === mc ? catSel : null) : '';
    }
    $('#eTipo').onchange = ajustar;
    $('#eEntra').onchange = ajustar;
    ajustar();
    if (nuevo) setTimeout(function () { $('#eMonto').focus(); }, 50);

    $('#eCerrar').onclick = cerrarHoja;
    hoja.onclick = function (ev) { if (ev.target === hoja) cerrarHoja(); };
    if ($('#eDescartar')) $('#eDescartar').onclick = async function () {
      try { reemplazar(await DB.actualizar(m.id, { estado: 'DESCARTADO', duda: null })); cerrarHoja(); aviso('Descartado'); pintar(); } catch (e) { fallo(e); }
    };
    if ($('#eRevivir')) $('#eRevivir').onclick = async function () {
      try { reemplazar(await DB.actualizar(m.id, { estado: 'POR_REVISAR' })); cerrarHoja(); aviso('Recuperado a la bandeja'); pintar(); } catch (e) { fallo(e); }
    };
    $('#eGuardar').onclick = async function () {
      var t = $('#eTipo').value;
      var monto = Math.round(Number($('#eMonto').value) * 100) / 100;
      var sale = t === 'INGRESO' ? null : ($('#eSale').value || null);
      var entra = t === 'GASTO' ? null : ($('#eEntra').value || null);
      var catId = modoEd() ? (Number($('#eCat').value) || null) : null;
      var err = '';
      if (!(monto > 0)) err = 'Escribe un monto mayor a cero.';
      else if (!/^\d{4}-\d{2}-\d{2}$/.test($('#eFecha').value)) err = 'Falta la fecha.';
      else if (t !== 'INGRESO' && !sale) err = 'Elige de qué cuenta sale.';
      else if (t !== 'GASTO' && !entra) err = 'Elige a qué cuenta entra.';
      else if (t === 'TRASPASO' && sale === entra) err = 'Sale y entra no pueden ser la misma cuenta.';
      if (err) { $('#eErr').textContent = err; return; }
      var datos = { tipo: t, monto: monto, fecha: $('#eFecha').value, bolsa_sale: sale, bolsa_entra: entra,
        categoria_id: catId, descripcion: $('#eDesc').value.trim() || null, estado: 'CONFIRMADO', duda: null };
      try {
        var r;
        if (nuevo) { datos.fuente = 'APP'; r = await DB.insertar(datos); }
        else {
          r = await DB.actualizar(m.id, datos);
          if (m.fuente === 'CORREO' && t === 'GASTO' && catId && m.comercio && catId !== m.categoria_id) await DB.guardarRegla(m.comercio, catId);
          else if (t === 'INGRESO' && catId && patronIngreso(m.comercio) && catId !== m.categoria_id) await DB.guardarRegla(m.comercio, catId);
        }
        reemplazar(r);
        cerrarHoja(); aviso('Guardado'); pintar();
      } catch (e) { fallo(e); }
    };
  }

  function cerrarHoja() {
    var hoja = $('#hoja'); hoja.hidden = true; hoja.innerHTML = '';
    if (location.search) history.replaceState(null, '', location.pathname);
  }

  // ------------------------------------------------------------------
  // 8. CUADRAR SALDO
  // ------------------------------------------------------------------
  function abrirCuadre(id) {
    var b = bolsa(id), calc = saldos()[id], virtual = b.tipo === 'VIRTUAL';
    var hoja = $('#hoja');
    hoja.innerHTML = '<div class="panel"><h2>Cuadrar ' + esc(b.nombre) + '</h2>' +
      '<div class="meta">Según la app: <b class="num">' + dinero(calc) + '</b>' +
      (virtual ? ' (negativo = le debes a Terminus)' : '') + '</div>' +
      '<div class="campo"><label>' + (virtual ? 'Saldo real (negativo si le debes)' : (b.tipo === 'EFECTIVO' ? '¿Cuánto traes?' : '¿Qué saldo dice tu app de Banorte?')) + '</label>' +
      '<input id="cReal" type="number" inputmode="decimal" step="0.01"></div>' +
      '<div class="meta" id="cDif" style="margin-top:8px"></div><div class="error" id="cErr"></div>' +
      '<div class="acciones apiladas">' +
      '<button class="btn zafiro" id="cInicial">Corregir saldo de arranque</button>' +
      (virtual ? '' : '<button class="btn" id="cAjuste">Registrar diferencia hoy</button>') +
      '<button class="btn" id="cCerrar">Cancelar</button></div>' +
      '<div class="meta" style="margin-top:12px">«Saldo de arranque» cambia lo que tenías al ' + fechaCorta(b.fecha_saldo_inicial) +
      '. Úsalo la primera vez. «Registrar diferencia» crea un movimiento de ajuste con fecha de hoy (intereses, centavos, algo que no se registró).</div></div>';
    hoja.hidden = false;
    function dif() { return Math.round((Number($('#cReal').value) - calc) * 100) / 100; }
    $('#cReal').oninput = function () {
      var d = dif();
      $('#cDif').textContent = $('#cReal').value === '' ? '' : (d === 0 ? 'Cuadra exacto.' : 'Diferencia: ' + dinero(d));
    };
    setTimeout(function () { $('#cReal').focus(); }, 50);
    $('#cCerrar').onclick = cerrarHoja;
    hoja.onclick = function (ev) { if (ev.target === hoja) cerrarHoja(); };
    $('#cInicial').onclick = async function () {
      if ($('#cReal').value === '') { $('#cErr').textContent = 'Escribe el saldo real.'; return; }
      var d = dif();
      try {
        var nb = await DB.actualizarBolsa(id, { saldo_inicial: Math.round((Number(b.saldo_inicial) + d) * 100) / 100 });
        S.bolsas = S.bolsas.map(function (x) { return x.id === id ? nb : x; });
        cerrarHoja(); aviso('Saldo de arranque corregido'); pintar();
      } catch (e) { fallo(e); }
    };
    if ($('#cAjuste')) $('#cAjuste').onclick = async function () {
      if ($('#cReal').value === '') { $('#cErr').textContent = 'Escribe el saldo real.'; return; }
      var d = dif();
      if (d === 0) { cerrarHoja(); aviso('Ya cuadra'); return; }
      var nombreCat = d > 0 ? (id === 'INVERSION' ? 'Intereses' : 'Otros ingresos') : 'Varios';
      var c = S.cats.find(function (x) { return x.nombre === nombreCat; });
      var datos = d > 0
        ? { tipo: 'INGRESO', bolsa_entra: id, bolsa_sale: null }
        : { tipo: 'GASTO', bolsa_sale: id, bolsa_entra: null };
      datos.monto = Math.abs(d); datos.fecha = hoy(); datos.categoria_id = c ? c.id : null;
      datos.descripcion = 'Ajuste de saldo'; datos.estado = 'CONFIRMADO'; datos.fuente = 'APP';
      try { reemplazar(await DB.insertar(datos)); cerrarHoja(); aviso('Ajuste registrado'); pintar(); } catch (e) { fallo(e); }
    };
  }

  // ------------------------------------------------------------------
  // 9. EN MARCHA
  // ------------------------------------------------------------------
  $('#btnRecargar').onclick = async function () {
    try { await recargar(); pintar(); aviso('Actualizado'); } catch (e) { fallo(e); }
  };
  document.addEventListener('visibilitychange', async function () {
    if (document.visibilityState === 'visible' && !$('#nav').hidden && $('#hoja').hidden) {
      try { await recargar(); pintar(); } catch (e) { /* sin red: se queda lo que hay */ }
    }
  });
  window.FP_APP = { S: S, saldos: saldos };
  arrancar();
})();
