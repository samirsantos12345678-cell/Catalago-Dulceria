/* ============================================================
   LÓGICA DEL CATÁLOGO
   No necesitas editar este archivo para cambiar productos o el
   número de WhatsApp. Usa js/config.js y js/productos.js.
   ============================================================ */

(() => {
  'use strict';

  const CONFIG = window.CONFIG || {};
  const PRODUCTOS = Array.isArray(window.PRODUCTOS) ? window.PRODUCTOS : [];

  const config = {
    nombreNegocio: CONFIG.nombreNegocio || 'Mi Negocio',
    eslogan: CONFIG.eslogan || 'Catálogo de ventas',
    numeroWhatsApp: CONFIG.numeroWhatsApp || '',
    modoEnvio: CONFIG.modoEnvio === 'numero' ? 'numero' : 'compartir',
    simboloMoneda: CONFIG.simboloMoneda || '$',
    locale: CONFIG.locale || 'es-419',
    vendedorPorDefecto: CONFIG.vendedorPorDefecto || '',
    prefijoPedido: CONFIG.prefijoPedido || 'PED',
    productosPorPagina: Number(CONFIG.productosPorPagina) || 24,
    sincronizacionSegundos: Math.max(15, Number(CONFIG.sincronizacionSegundos) || 30),
    mostrarCatalogoEjemplo: CONFIG.mostrarCatalogoEjemplo !== false,
  };

  const PRESENTACIONES = [
    { clave: 'unidad', nombre: 'Unidad', campo: 'precio_unidad' },
    { clave: 'media-docena', nombre: 'Media docena', campo: 'precio_media_docena' },
    { clave: 'docena', nombre: 'Docena', campo: 'precio_docena' },
    { clave: 'caja', nombre: 'Caja', campo: 'precio_caja' },
  ];

  const nube = window.Backend || null;
  const usaNube = Boolean(nube && nube.configurado);

  const CLAVES = {
    carrito: 'catalogo_carrito_v1',
    pedidos: 'catalogo_pedidos_v1',
    vendedor: 'catalogo_vendedor_v1',
    borrador: 'catalogo_borrador_v1',
    secuencia: 'catalogo_secuencia_v1',
    productos: 'catalogo_productos_v1',
    nubeInicializada: 'catalogo_nube_inicializada_v1',
    modoVendedor: 'catalogo_modo_vendedor_v1',
  };

  const el = {};
  const productosBase = PRODUCTOS.filter((p) => p && p.activo !== false).map(normalizarProducto);
  let productosActivos = [];

  const state = {
    carrito: [],
    pedidos: [],
    vendedor: '',
    filtros: { texto: '', categoria: 'Todas', orden: 'destacados' },
    admin: { texto: '' },
    visibles: config.productosPorPagina,
    productoModal: null,
    productoEditando: null,
    fotoTemporal: '',
    modalCantidad: 1,
    modalPresentacion: 'unidad',
    pedidoExito: null,
    pedidoModal: null,
    vista: 'catalogo',
    nube: {
      sincronizando: false,
      ultima: 0,
      error: '',
      email: '',
      vacia: false,
    },
    loginPendiente: null,
    guardandoProducto: false,
    modoVendedor: false,
  };

  let toastTimer = null;
  let cartCloseTimer = null;
  let modalCloseTimer = null;
  let searchTimer = null;
  let ultimoFoco = null;
  let nubeTimer = null;

  /* ---------- Utilidades ---------- */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizar(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /* ---------- Presentaciones y precios ---------- */

  function normalizarPresentacion(valor) {
    const texto = normalizar(valor);
    if (texto.includes('media')) return 'media-docena';
    if (texto.includes('docena')) return 'docena';
    if (texto.includes('caja')) return 'caja';
    return 'unidad';
  }

  function presentacionInfo(clave) {
    const normalizada = normalizarPresentacion(clave);
    return PRESENTACIONES.find((presentacion) => presentacion.clave === normalizada) || PRESENTACIONES[0];
  }

  function nombrePresentacion(clave) {
    return presentacionInfo(clave).nombre;
  }

  function normalizarPrecios(precios) {
    const salida = {};
    if (!precios || typeof precios !== 'object' || Array.isArray(precios)) return salida;

    PRESENTACIONES.forEach(({ clave }) => {
      const valor = Number(precios[clave]);
      if (Number.isFinite(valor) && valor > 0) {
        salida[clave] = Math.round(valor * 100) / 100;
      }
    });

    return salida;
  }

  function presentacionesDisponibles(producto) {
    if (!producto) return [];

    return PRESENTACIONES.map(({ clave, nombre }) => ({
      clave,
      nombre,
      precio: Number(producto.precios && producto.precios[clave]) || 0,
    })).filter((presentacion) => presentacion.precio > 0);
  }

  function precioPresentacion(producto, clave) {
    if (!producto) return 0;

    const presentacion = normalizarPresentacion(clave);
    const precios = producto.precios || {};
    const precio = Number(precios[presentacion]) || 0;

    if (precio > 0) return precio;
    if (presentacion === normalizarPresentacion(producto.unidad)) return Number(producto.precio) || 0;
    return 0;
  }

  function claveCarrito(id, presentacion) {
    return `${id}|${normalizarPresentacion(presentacion)}`;
  }

  function icon(nombre, clase = '') {
    return `<svg class="icon ${clase}" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;
  }

  function formatearMoneda(valor) {
    const numero = Number(valor) || 0;
    return `${config.simboloMoneda} ${numero.toLocaleString(config.locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatearFecha(valor) {
    if (!valor) return '';
    const partes = String(valor).split('-').map(Number);
    if (partes.length !== 3 || partes.some((n) => !n)) return valor;
    const [anio, mes, dia] = partes;
    return new Date(anio, mes - 1, dia).toLocaleDateString(config.locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function formatearFechaHora(valor) {
    if (!valor) return '';
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return valor;
    return fecha.toLocaleString(config.locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function toISODate(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  function fechaManana() {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + 1);
    return toISODate(fecha);
  }

  function normalizarNumero(valor) {
    return String(valor || '').replace(/\D/g, '');
  }

  function esNumeroPlaceholder(valor) {
    const numero = normalizarNumero(valor);
    return !numero || numero === '51999999999' || numero === '000000000';
  }

  function leerJSON(clave, respaldo) {
    try {
      const crudo = localStorage.getItem(clave);
      return crudo ? JSON.parse(crudo) : respaldo;
    } catch (error) {
      console.warn('No se pudo leer', clave, error);
      return respaldo;
    }
  }

  function guardarJSON(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (error) {
      console.warn('No se pudo guardar', clave, error);
      mostrarToast('No se pudo guardar. Revisa el espacio del teléfono.');
    }
  }

  function guardarTexto(clave, valor) {
    try {
      localStorage.setItem(clave, valor);
    } catch (error) {
      console.warn('No se pudo guardar', clave, error);
    }
  }

  function mostrarToast(mensaje) {
    if (!el.toast) return;
    el.toast.textContent = mensaje;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    requestAnimationFrame(() => el.toast.classList.add('is-visible'));
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('is-visible');
      setTimeout(() => {
        el.toast.hidden = true;
      }, 220);
    }, 3200);
  }

  function actualizarBloqueoScroll() {
    const bloqueado =
      !el.cartDrawer?.hidden ||
      !el.productModal?.hidden ||
      !el.orderModal?.hidden ||
      !el.productFormModal?.hidden ||
      !el.loginModal?.hidden;
    document.body.classList.toggle('no-scroll', Boolean(bloqueado));
  }

  /* ---------- Imágenes de respaldo ---------- */

  const PALETAS = {
    'Chocolates y bombones': ['#7c2d12', '#c2410c'],
    'Caramelos y chicles': ['#be123c', '#fb7185'],
    'Gomitas y marshmallows': ['#a21caf', '#f0abfc'],
    'Galletas y waffers': ['#a16207', '#facc15'],
    'Pasteles y postres': ['#9d174d', '#f9a8d4'],
    'Helados y bebidas': ['#0e7490', '#67e8f9'],
  };

  const DESCRIPCIONES = {
    'Chocolates y bombones':
      'Chocolate o bombón. Consulta presentaciones y disponibilidad antes de confirmar.',
    'Caramelos y chicles':
      'Caramelo o chicle. Ideal para compartir o para la venta al paso.',
    'Gomitas y marshmallows':
      'Gomitas o marshmallows. Consulta sabores y presentaciones disponibles.',
    'Galletas y waffers':
      'Galleta o waffer. Perfecto para la lonchera o para acompañar el café.',
    'Pasteles y postres':
      'Pastel o postre. Consulta disponibilidad y fecha de preparación.',
    'Helados y bebidas':
      'Helado o bebida dulce. Mantener refrigerado cuando corresponda.',
  };

  const placeholderCache = new Map();

  function escapeXml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function placeholderDataUri(producto, sinCache = false) {
    if (!sinCache && placeholderCache.has(producto.id)) return placeholderCache.get(producto.id);

    const [color1, color2] = PALETAS[producto.categoria] || ['#0f766e', '#14b8a6'];
    const iniciales = String(producto.nombre || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((palabra) => palabra[0])
      .join('')
      .toUpperCase();
    const categoria = String(producto.categoria || '').toUpperCase();

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${color1}"/>
          <stop offset="1" stop-color="${color2}"/>
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#g)"/>
      <circle cx="500" cy="100" r="180" fill="rgba(255,255,255,.08)"/>
      <circle cx="100" cy="520" r="220" fill="rgba(255,255,255,.06)"/>
      <text x="300" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="180" font-weight="700" fill="rgba(255,255,255,.92)">${escapeXml(iniciales)}</text>
      <text x="300" y="400" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="3" fill="rgba(255,255,255,.8)">${escapeXml(categoria)}</text>
    </svg>`;

    const uri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
    if (!sinCache) placeholderCache.set(producto.id, uri);
    return uri;
  }

  function imagenProducto(producto) {
    return producto.imagen && String(producto.imagen).trim() ? producto.imagen : placeholderDataUri(producto);
  }

  function descripcionProducto(producto) {
    return producto.descripcion || DESCRIPCIONES[producto.categoria] || 'Consulta disponibilidad y presentaciones.';
  }

  /* ---------- Productos y carrito ---------- */

  function normalizarProducto(producto) {
    const datos = producto || {};
    const unidad = normalizarPresentacion(datos.unidad);
    const precios = normalizarPrecios(datos.precios);
    let precio = Math.max(0, Number(datos.precio) || 0);

    if (!(precio > 0) && precios[unidad] > 0) precio = precios[unidad];
    if (precio > 0) precios[unidad] = precio;

    return {
      id: String(datos.id || '').trim(),
      nombre: String(datos.nombre || '').trim(),
      categoria: String(datos.categoria || 'Sin categoría').trim() || 'Sin categoría',
      precio,
      unidad,
      precios,
      imagen: String(datos.imagen || '').trim(),
      descripcion: String(datos.descripcion || '').trim(),
      destacado: Boolean(datos.destacado),
      activo: datos.activo !== false,
      orden: Number(datos.orden) || 0,
    };
  }

  function cargarProductos() {
    const guardados = leerJSON(CLAVES.productos, null);
    const lista = Array.isArray(guardados) ? guardados : productosBase;

    productosActivos = lista
      .filter((producto) => producto && producto.nombre)
      .map(normalizarProducto)
      .filter((producto) => producto.activo);
  }

  function guardarProductos() {
    try {
      localStorage.setItem(CLAVES.productos, JSON.stringify(productosActivos));
      return true;
    } catch (error) {
      console.warn('No se pudieron guardar los productos', error);
      mostrarToast('No hay espacio para guardar. Usa fotos más pequeñas o elimina productos.');
      return false;
    }
  }

  function guardarCacheProductos() {
    try {
      localStorage.setItem(CLAVES.productos, JSON.stringify(productosActivos));
    } catch (error) {
      try {
        const sinFotos = productosActivos.map((producto) => ({
          ...producto,
          imagen: /^data:/i.test(producto.imagen) ? '' : producto.imagen,
        }));
        localStorage.setItem(CLAVES.productos, JSON.stringify(sinFotos));
      } catch (error2) {
        console.warn('No se pudo guardar el catálogo en este teléfono', error2);
      }
    }
  }

  function generarIdProducto() {
    let mayor = 0;

    productosActivos.forEach((producto) => {
      const coincidencia = /^P(\d+)$/.exec(producto.id);
      if (coincidencia) mayor = Math.max(mayor, Number(coincidencia[1]));
    });

    let siguiente = mayor + 1;
    let id = `P${String(siguiente).padStart(3, '0')}`;
    while (productosActivos.some((producto) => producto.id === id)) {
      siguiente += 1;
      id = `P${String(siguiente).padStart(3, '0')}`;
    }
    return id;
  }

  function generarIdProductoNube() {
    const base = `P${Date.now().toString(36).toUpperCase()}`;
    let id = base;
    let extra = 1;

    while (productosActivos.some((producto) => producto.id === id)) {
      id = `${base}${extra}`;
      extra += 1;
    }

    return id;
  }

  function productoPorId(id) {
    return productosActivos.find((producto) => producto.id === id) || null;
  }

  function categoriasDisponibles() {
    const conteo = new Map();
    productosActivos.forEach((producto) => {
      conteo.set(producto.categoria, (conteo.get(producto.categoria) || 0) + 1);
    });
    return Array.from(conteo.entries()).sort((a, b) => a[0].localeCompare(b[0], 'es'));
  }

  function carritoDetallado() {
    return state.carrito
      .map((item) => {
        const producto = productoPorId(item.id);
        if (!producto) return null;

        const presentacion = normalizarPresentacion(item.presentacion || producto.unidad);
        const precio = precioPresentacion(producto, presentacion);
        if (!(precio > 0)) return null;

        const cantidad = Math.max(1, Number(item.cantidad) || 1);
        return {
          clave: claveCarrito(item.id, presentacion),
          id: item.id,
          presentacion,
          presentacionNombre: nombrePresentacion(presentacion),
          precio,
          cantidad,
          producto,
          subtotal: precio * cantidad,
        };
      })
      .filter(Boolean);
  }

  function totalCarrito() {
    return carritoDetallado().reduce((total, item) => total + item.subtotal, 0);
  }

  function cantidadCarrito() {
    return carritoDetallado().reduce((total, item) => total + item.cantidad, 0);
  }

  function guardarCarrito() {
    guardarJSON(CLAVES.carrito, state.carrito);
  }

  function guardarPedidos() {
    guardarJSON(CLAVES.pedidos, state.pedidos);
  }

  function agregarAlCarrito(id, cantidad = 1, presentacion = '') {
    const producto = productoPorId(id);
    if (!producto) return;

    const clavePresentacion = normalizarPresentacion(presentacion || producto.unidad);
    const precio = precioPresentacion(producto, clavePresentacion);

    if (!(precio > 0)) {
      mostrarToast(`No hay precio por ${nombrePresentacion(clavePresentacion).toLowerCase()}`);
      return;
    }

    const existente = state.carrito.find((item) => {
      const actual = normalizarPresentacion(item.presentacion || producto.unidad);
      return item.id === id && actual === clavePresentacion;
    });

    if (existente) {
      existente.cantidad = Math.min(999, (Number(existente.cantidad) || 0) + cantidad);
      existente.presentacion = clavePresentacion;
    } else {
      state.carrito.push({
        id,
        presentacion: clavePresentacion,
        cantidad: Math.min(999, Math.max(1, cantidad)),
      });
    }

    guardarCarrito();
    renderCarrito();
    mostrarToast(`${producto.nombre} · ${nombrePresentacion(clavePresentacion)} agregado al carrito`);
  }

  function cambiarCantidad(clave, delta) {
    const item = state.carrito.find((entrada) => claveCarrito(entrada.id, entrada.presentacion) === clave);
    if (!item) return;

    item.cantidad = (Number(item.cantidad) || 0) + delta;
    if (item.cantidad <= 0) {
      state.carrito = state.carrito.filter(
        (entrada) => claveCarrito(entrada.id, entrada.presentacion) !== clave
      );
    } else {
      item.cantidad = Math.min(999, item.cantidad);
    }

    guardarCarrito();
    renderCarrito();
  }

  function eliminarDelCarrito(clave) {
    state.carrito = state.carrito.filter(
      (item) => claveCarrito(item.id, item.presentacion) !== clave
    );
    guardarCarrito();
    renderCarrito();
    mostrarToast('Producto eliminado del carrito');
  }

  function vaciarCarrito() {
    if (!state.carrito.length) return;
    if (!window.confirm('¿Vaciar todos los productos del carrito?')) return;
    state.carrito = [];
    guardarCarrito();
    renderCarrito();
    mostrarToast('Carrito vacío');
  }

  function generarNumeroPedido() {
    const hoy = toISODate(new Date()).replace(/-/g, '');
    const secuencia = leerJSON(CLAVES.secuencia, { fecha: '', ultimo: 0 });

    if (secuencia.fecha !== hoy) {
      secuencia.fecha = hoy;
      secuencia.ultimo = 0;
    }

    secuencia.ultimo = (Number(secuencia.ultimo) || 0) + 1;
    guardarJSON(CLAVES.secuencia, secuencia);

    return `${config.prefijoPedido}-${hoy}-${String(secuencia.ultimo).padStart(3, '0')}`;
  }

  /* ============================================================
     PARTE 2: renderizado de la interfaz
     ============================================================ */

  function renderCategorias() {
    const categorias = categoriasDisponibles();
    const items = [{ nombre: 'Todas', cantidad: productosActivos.length }].concat(
      categorias.map(([nombre, cantidad]) => ({ nombre, cantidad }))
    );

    el.categorias.innerHTML = items
      .map(
        ({ nombre, cantidad }) => `
        <button type="button" class="chip ${state.filtros.categoria === nombre ? 'is-active' : ''}" data-categoria="${escapeHtml(nombre)}">
          ${escapeHtml(nombre)} <span class="chip__count">${cantidad}</span>
        </button>`
      )
      .join('');
  }

  function productosFiltrados() {
    const texto = normalizar(state.filtros.texto);
    const terminos = texto ? texto.split(/\s+/).filter(Boolean) : [];

    const lista = productosActivos.filter((producto) => {
      if (state.filtros.categoria !== 'Todas' && producto.categoria !== state.filtros.categoria) {
        return false;
      }
      if (!terminos.length) return true;

      const contenido = normalizar(
        `${producto.nombre} ${producto.categoria} ${producto.descripcion || ''} ${presentacionesDisponibles(producto)
          .map((presentacion) => presentacion.nombre)
          .join(' ')}`
      );
      return terminos.every((termino) => contenido.includes(termino));
    });

    switch (state.filtros.orden) {
      case 'precio-asc':
        lista.sort((a, b) => a.precio - b.precio);
        break;
      case 'precio-desc':
        lista.sort((a, b) => b.precio - a.precio);
        break;
      case 'nombre':
        lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        break;
      default:
        lista.sort(
          (a, b) =>
            Number(Boolean(b.destacado)) - Number(Boolean(a.destacado)) ||
            a.nombre.localeCompare(b.nombre, 'es')
        );
    }

    return lista;
  }

  function productoCardHTML(producto) {
    const imagen = imagenProducto(producto);
    const respaldo = placeholderDataUri(producto);
    const presentaciones = presentacionesDisponibles(producto);
    const etiquetaPresentacion = nombrePresentacion(producto.unidad);
    const extra = presentaciones.length > 1 ? ` · ${presentaciones.length} presentaciones` : '';

    return `
      <article class="producto-card" data-id="${escapeHtml(producto.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${escapeHtml(producto.nombre)}">
        <div class="producto-card__media">
          <img src="${escapeHtml(imagen)}" alt="${escapeHtml(producto.nombre)}" loading="lazy" decoding="async" data-fallback="${escapeHtml(respaldo)}">
          ${producto.destacado ? '<span class="producto-card__badge">Destacado</span>' : ''}
        </div>
        <div class="producto-card__body">
          <span class="producto-card__cat">${escapeHtml(producto.categoria)}</span>
          <h3 class="producto-card__name">${escapeHtml(producto.nombre)}</h3>
          <span class="producto-card__unit">${escapeHtml(etiquetaPresentacion)}${escapeHtml(extra)}</span>
          <div class="producto-card__foot">
            <span class="producto-card__price">${formatearMoneda(producto.precio)}</span>
            <button type="button" class="producto-card__add" data-add="${escapeHtml(producto.id)}" aria-label="Agregar ${escapeHtml(producto.nombre)} al carrito">
              ${icon('plus')}
            </button>
          </div>
        </div>
      </article>`;
  }

  function renderProductos() {
    const lista = productosFiltrados();
    const visibles = lista.slice(0, state.visibles);

    el.productosGrid.innerHTML = visibles.map(productoCardHTML).join('');
    el.resultadosTexto.textContent = lista.length
      ? `Mostrando ${visibles.length} de ${lista.length} productos`
      : '';
    el.sinResultados.hidden = !(lista.length === 0 && productosActivos.length > 0);
    el.sinProductos.hidden = !(lista.length === 0 && productosActivos.length === 0);
    el.productosGrid.hidden = lista.length === 0;
    el.btnMas.hidden = lista.length <= state.visibles;
    el.btnLimpiarFiltros.hidden = !hayFiltros();
    el.btnLimpiarBusqueda.hidden = !el.buscador.value;
    el.statProductos.textContent = productosActivos.length;
    el.statCategorias.textContent = categoriasDisponibles().length;
  }

  function hayFiltros() {
    return state.filtros.texto.trim() !== '' || state.filtros.categoria !== 'Todas';
  }

  function limpiarFiltros() {
    state.filtros = { texto: '', categoria: 'Todas', orden: 'destacados' };
    state.visibles = config.productosPorPagina;
    el.buscador.value = '';
    el.orden.value = 'destacados';
    renderCategorias();
    renderProductos();
  }

  function renderCarrito() {
    const detalle = carritoDetallado();
    const cantidad = detalle.reduce((total, item) => total + item.cantidad, 0);
    const total = detalle.reduce((suma, item) => suma + item.subtotal, 0);

    el.cartBadge.hidden = cantidad === 0;
    el.cartBadge.textContent = cantidad;
    if (el.tabCartBadge) {
      el.tabCartBadge.hidden = cantidad === 0;
      el.tabCartBadge.textContent = cantidad;
    }
    el.cartCountLabel.textContent = cantidad ? `(${cantidad})` : '';
    el.cartTotal.textContent = formatearMoneda(total);
    el.btnCheckout.disabled = detalle.length === 0;
    el.btnVaciarCarrito.hidden = detalle.length === 0;
    el.cartItems.hidden = detalle.length === 0;
    el.cartEmpty.hidden = detalle.length > 0;

    el.cartItems.innerHTML = detalle
      .map(
        ({ clave, cantidad: unidades, producto, precio, presentacionNombre, subtotal }) => `
        <div class="cart-item" data-key="${escapeHtml(clave)}">
          <img src="${escapeHtml(imagenProducto(producto))}" alt="" loading="lazy" data-fallback="${escapeHtml(placeholderDataUri(producto))}">
          <div>
            <div class="cart-item__name">${escapeHtml(producto.nombre)}</div>
            <div class="cart-item__price">${escapeHtml(presentacionNombre)} · ${formatearMoneda(precio)}</div>
            <div class="cart-item__price">Subtotal: <strong>${formatearMoneda(subtotal)}</strong></div>
          </div>
          <div class="cart-item__side">
            <div class="qty">
              <button type="button" data-cart-action="menos" data-cart-key="${escapeHtml(clave)}" aria-label="Quitar una unidad">${icon('minus')}</button>
              <span>${unidades}</span>
              <button type="button" data-cart-action="mas" data-cart-key="${escapeHtml(clave)}" aria-label="Agregar una unidad">${icon('plus')}</button>
            </div>
            <button type="button" class="cart-item__remove" data-cart-action="eliminar" data-cart-key="${escapeHtml(clave)}" aria-label="Eliminar ${escapeHtml(producto.nombre)}">${icon('trash')}</button>
          </div>
        </div>`
      )
      .join('');

    actualizarBarraCarrito(detalle, cantidad, total);

    if (state.vista === 'checkout') {
      renderCheckoutResumen();
    }
  }

  function actualizarBarraCarrito(detalle, cantidad, total) {
    const esMovil = window.matchMedia('(max-width: 640px)').matches;
    const visible = detalle.length > 0 && state.vista === 'catalogo' && esMovil;
    el.mobileCartBar.hidden = !visible;
    document.body.classList.toggle('has-cart-bar', visible);

    if (visible) {
      el.mobileCartCount.textContent = `${cantidad} ${cantidad === 1 ? 'producto' : 'productos'}`;
      el.mobileCartTotal.textContent = formatearMoneda(total);
    }
  }

  function renderCheckoutResumen() {
    const detalle = carritoDetallado();
    const total = detalle.reduce((suma, item) => suma + item.subtotal, 0);
    const cantidad = detalle.reduce((suma, item) => suma + item.cantidad, 0);

    el.checkoutCount.textContent = detalle.length
      ? `${cantidad} ${cantidad === 1 ? 'producto' : 'productos'} en el pedido`
      : 'No hay productos en el carrito.';

    el.checkoutItems.innerHTML = detalle
      .map(
        ({ producto, cantidad: unidades, precio, presentacionNombre, subtotal }) => `
        <div class="summary-item">
          <div>
            <div class="summary-item__name">${escapeHtml(producto.nombre)}</div>
            <div class="summary-item__qty">${unidades} x ${formatearMoneda(precio)} · ${escapeHtml(presentacionNombre)}</div>
          </div>
          <div class="summary-item__price">${formatearMoneda(subtotal)}</div>
        </div>`
      )
      .join('');

    el.checkoutTotal.textContent = formatearMoneda(total);
  }

  function resumenPedidoHTML(pedido) {
    const cliente = pedido.cliente || {};
    const items = Array.isArray(pedido.items) ? pedido.items : [];

    return `
      <div class="order-detail">
        <div class="order-detail__row"><span>Pedido</span><strong>${escapeHtml(pedido.numero)}</strong></div>
        <div class="order-detail__row"><span>Fecha</span><strong>${escapeHtml(formatearFechaHora(pedido.fecha))}</strong></div>
        <div class="order-detail__row"><span>Vendedor</span><strong>${escapeHtml(pedido.vendedor || '')}</strong></div>
        <div class="order-detail__row"><span>Cliente</span><strong>${escapeHtml(cliente.nombre || '')}</strong></div>
        <div class="order-detail__row"><span>Teléfono</span><strong>${escapeHtml(cliente.telefono || '')}</strong></div>
        <div class="order-detail__row"><span>Dirección</span><strong>${escapeHtml(cliente.direccion || '')}</strong></div>
        <div class="order-detail__row"><span>Entrega</span><strong>${escapeHtml(formatearFecha(cliente.entrega))}</strong></div>
        <div class="order-detail__row"><span>Pago</span><strong>${escapeHtml(cliente.pago || '')}</strong></div>
        ${
          cliente.notas
            ? `<div class="order-detail__row"><span>Observaciones</span><strong>${escapeHtml(cliente.notas)}</strong></div>`
            : ''
        }
        <div class="order-detail__items">
          ${items
            .map(
              (item) => `
            <div class="summary-item">
              <div>
                <div class="summary-item__name">${escapeHtml(item.nombre)}</div>
                <div class="summary-item__qty">${Number(item.cantidad) || 0} x ${formatearMoneda(item.precio)}</div>
              </div>
              <div class="summary-item__price">${formatearMoneda(item.subtotal)}</div>
            </div>`
            )
            .join('')}
        </div>
        <div class="summary-total"><span>Total</span><strong>${formatearMoneda(pedido.total)}</strong></div>
      </div>`;
  }

  function pedidoImpresionHTML(pedido) {
    const cliente = pedido.cliente || {};
    const items = Array.isArray(pedido.items) ? pedido.items : [];

    const filas = items
      .map((item) => {
        const producto = productoPorId(item.id) || {
          id: item.id || normalizar(item.nombre),
          nombre: item.nombre,
          categoria: item.categoria,
        };

        return `
          <tr>
            <td><img src="${escapeHtml(imagenProducto(producto))}" alt="" data-fallback="${escapeHtml(placeholderDataUri(producto))}"></td>
            <td class="print-tabla__prod">
              <strong>${escapeHtml(item.nombre)}</strong>
              <small>${escapeHtml(item.categoria || '')} · ${escapeHtml(item.unidad || 'unidad')}</small>
            </td>
            <td class="print-num">${Number(item.cantidad) || 0}</td>
            <td class="print-num">${formatearMoneda(item.precio)}</td>
            <td class="print-num">${formatearMoneda(item.subtotal)}</td>
          </tr>`;
      })
      .join('');

    const datos = [
      ['Cliente', cliente.nombre],
      ['Teléfono', cliente.telefono],
      ['Dirección', cliente.direccion],
      ['Entrega', formatearFecha(cliente.entrega)],
      ['Pago', cliente.pago],
      ['Vendedor', pedido.vendedor],
    ].filter(([, valor]) => valor);

    return `
      <div class="print-hoja">
        <header class="print-cabecera">
          <div>
            <h1>${escapeHtml(config.nombreNegocio)}</h1>
            <p>${escapeHtml(config.eslogan)}</p>
          </div>
          <div class="print-cabecera__pedido">
            <strong>${escapeHtml(pedido.numero)}</strong>
            <span>${escapeHtml(formatearFechaHora(pedido.fecha))}</span>
          </div>
        </header>

        <section class="print-datos">
          ${datos
            .map(
              ([etiqueta, valor]) =>
                `<div><span>${escapeHtml(etiqueta)}</span><strong>${escapeHtml(valor)}</strong></div>`
            )
            .join('')}
        </section>

        <table class="print-tabla">
          <thead>
            <tr>
              <th>Imagen</th>
              <th>Producto</th>
              <th class="print-num">Cant.</th>
              <th class="print-num">Precio</th>
              <th class="print-num">Subtotal</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <div class="print-total"><span>Total</span><strong>${formatearMoneda(pedido.total)}</strong></div>

        ${
          cliente.notas
            ? `<div class="print-notas"><span>Observaciones</span>${escapeHtml(cliente.notas)}</div>`
            : ''
        }

        <footer class="print-pie">
          <span>${escapeHtml(config.nombreNegocio)} · Pedido ${escapeHtml(pedido.numero)}</span>
          <span>Generado el ${escapeHtml(formatearFechaHora(pedido.fecha))}</span>
        </footer>
      </div>`;
  }

  function imprimirPedido(pedido) {
    if (!pedido || !el.printArea) return;

    el.printArea.innerHTML = pedidoImpresionHTML(pedido);
    el.printArea.setAttribute('aria-hidden', 'false');

    const imagenes = Array.from(el.printArea.querySelectorAll('img'));
    const esperas = imagenes.map((imagen) => {
      if (imagen.complete) return Promise.resolve();
      return new Promise((resolver) => {
        imagen.addEventListener('load', resolver, { once: true });
        imagen.addEventListener('error', resolver, { once: true });
      });
    });

    const limpiar = () => {
      el.printArea.innerHTML = '';
      el.printArea.setAttribute('aria-hidden', 'true');
      window.removeEventListener('afterprint', limpiar);
    };

    window.addEventListener('afterprint', limpiar);
    mostrarToast('En el menú de impresión elige "Guardar como PDF".');

    Promise.all(esperas).then(() => {
      setTimeout(() => window.print(), 150);
    });
  }

  function pedidoCardHTML(pedido) {
    const cliente = pedido.cliente || {};
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    const numero = escapeHtml(pedido.numero);

    return `
      <article class="pedido-card" data-numero="${numero}">
        <div class="pedido-card__head">
          <div>
            <div class="pedido-card__num">${numero}</div>
            <div class="pedido-card__meta">${escapeHtml(formatearFechaHora(pedido.fecha))} · ${escapeHtml(cliente.nombre || 'Cliente')}</div>
          </div>
          <div class="pedido-card__total">${formatearMoneda(pedido.total)}</div>
        </div>
        <div class="pedido-card__meta">
          ${items.length} ${items.length === 1 ? 'producto' : 'productos'} · ${escapeHtml(pedido.vendedor || 'Sin vendedor')} · <span class="status-pill">Guardado</span>
        </div>
        <div class="pedido-card__actions">
          <button type="button" class="btn btn-secondary" data-pedido-ver="${numero}">Ver</button>
          <button type="button" class="btn btn-whatsapp" data-pedido-enviar="${numero}">${icon('chat')} Reenviar</button>
          <button type="button" class="btn btn-ghost" data-pedido-copiar="${numero}">${icon('copy')} Copiar</button>
          <button type="button" class="btn btn-ghost" data-pedido-descargar="${numero}">${icon('download')} .txt</button>
          <button type="button" class="btn btn-ghost" data-pedido-pdf="${numero}">${icon('print')} PDF</button>
          <button type="button" class="btn btn-danger" data-pedido-eliminar="${numero}">${icon('trash')} Eliminar</button>
        </div>
      </article>`;
  }

  function renderPedidos() {
    const pedidos = [...state.pedidos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    el.pedidosLista.innerHTML = pedidos.map(pedidoCardHTML).join('');
    el.pedidosLista.hidden = pedidos.length === 0;
    el.pedidosVacio.hidden = pedidos.length > 0;
    el.btnExportarJson.disabled = pedidos.length === 0;
    el.btnExportarCsv.disabled = pedidos.length === 0;
    el.btnBorrarHistorial.disabled = pedidos.length === 0;
  }

  function renderExito(pedido) {
    if (!pedido) return;
    el.exitoTexto.textContent = `Pedido ${pedido.numero} guardado en este teléfono. Revisa el mensaje en WhatsApp y pulsa enviar.`;
    el.exitoResumen.innerHTML = resumenPedidoHTML(pedido);
  }

  /* ---------- Administración de productos ---------- */

  function adminItemHTML(producto) {
    const otras = presentacionesDisponibles(producto).filter(
      (presentacion) => presentacion.clave !== normalizarPresentacion(producto.unidad)
    );
    const detallePrecios = otras.length
      ? `<span class="admin-item__presentaciones">${otras
          .map((presentacion) => `${escapeHtml(presentacion.nombre)}: ${formatearMoneda(presentacion.precio)}`)
          .join(' · ')}</span>`
      : '';

    return `
      <article class="admin-item" data-id="${escapeHtml(producto.id)}">
        <img src="${escapeHtml(imagenProducto(producto))}" alt="" loading="lazy" decoding="async" data-fallback="${escapeHtml(placeholderDataUri(producto))}">
        <div class="admin-item__info">
          <strong>${escapeHtml(producto.nombre)}</strong>
          <span class="muted small">${escapeHtml(producto.categoria)} · ${escapeHtml(nombrePresentacion(producto.unidad))}</span>
          <span class="admin-item__price">${formatearMoneda(producto.precio)}</span>
          ${detallePrecios}
        </div>
        <div class="admin-item__actions">
          <button type="button" class="icon-btn" data-admin-editar="${escapeHtml(producto.id)}" title="Editar" aria-label="Editar ${escapeHtml(producto.nombre)}">
            ${icon('edit')}
          </button>
          <button type="button" class="icon-btn" data-admin-eliminar="${escapeHtml(producto.id)}" title="Eliminar" aria-label="Eliminar ${escapeHtml(producto.nombre)}">
            ${icon('trash')}
          </button>
        </div>
      </article>`;
  }

  function renderAdmin() {
    if (!el.adminLista) return;

    const texto = normalizar(state.admin.texto);
    const lista = productosActivos.filter((producto) => {
      if (!texto) return true;
      const contenido = `${producto.nombre} ${producto.categoria} ${presentacionesDisponibles(producto)
        .map((presentacion) => presentacion.nombre)
        .join(' ')}`;
      return normalizar(contenido).includes(texto);
    });

    el.adminLista.innerHTML = lista.map(adminItemHTML).join('');
    el.adminLista.hidden = lista.length === 0;
    el.adminVacio.hidden = lista.length > 0;
    el.adminContador.textContent = `${lista.length} de ${productosActivos.length} productos`;
    if (el.adminAlmacenamiento) {
      el.adminAlmacenamiento.textContent = usaNube ? '' : textoAlmacenamiento();
    }

    if (!productosActivos.length) {
      el.adminVacioTitulo.textContent = usaNube ? 'La nube no tiene productos' : 'Todavía no hay productos';
      el.adminVacioTexto.textContent = usaNube
        ? 'Crea un producto o sube el catálogo de este teléfono.'
        : 'Crea tu primer producto para empezar a vender.';
    } else {
      el.adminVacioTitulo.textContent = 'No encontramos productos';
      el.adminVacioTexto.textContent = 'Prueba con otra palabra en el buscador.';
    }

    actualizarEstadoNube();
  }

  function textoAlmacenamiento() {
    try {
      const crudo = localStorage.getItem(CLAVES.productos) || '';
      const mb = (crudo.length * 2) / (1024 * 1024);
      if (!crudo) return 'Aún no hay cambios guardados.';
      return `Usas aproximadamente ${mb.toFixed(1)} MB de los 5 MB disponibles.`;
    } catch (error) {
      return '';
    }
  }

  /* ---------- Sincronización con la nube ---------- */

  function actualizarEstadoNube() {
    if (!el.adminNube) return;

    el.adminNube.hidden = false;
    if (el.btnSubirNube) el.btnSubirNube.hidden = !usaNube || !state.nube.email;

    const titulo = el.adminNubeTitulo;
    const texto = el.adminNubeTexto;
    const botonSesion = el.btnSesionNube;
    const botonSync = el.btnSincronizarProductos;

    el.adminNube.classList.remove('is-ok', 'is-error', 'is-local', 'is-busy');

    if (!usaNube) {
      el.adminNube.classList.add('is-local');
      titulo.textContent = 'Solo este teléfono';
      texto.textContent = 'Los cambios no se comparten. Configura la nube en js/config.js (ver README).';
      if (botonSesion) botonSesion.hidden = true;
      if (botonSync) botonSync.hidden = true;
      if (el.adminPieTexto) {
        el.adminPieTexto.textContent =
          'Los productos se guardan en este teléfono. Exporta un respaldo para pasarlos a otro dispositivo.';
      }
      return;
    }

    if (botonSesion) {
      botonSesion.hidden = false;
      botonSesion.textContent = state.nube.email ? 'Salir' : 'Entrar';
    }
    if (botonSync) {
      botonSync.hidden = false;
      botonSync.disabled = state.nube.sincronizando;
    }

    if (el.adminPieTexto) {
      el.adminPieTexto.textContent =
        'Los cambios se guardan en la nube y aparecen en los teléfonos de los vendedores. Exporta un respaldo de vez en cuando.';
    }

    if (state.nube.sincronizando) {
      el.adminNube.classList.add('is-busy');
      titulo.textContent = 'Sincronizando…';
      texto.textContent = 'Buscando cambios en la nube.';
      return;
    }

    if (state.nube.error) {
      el.adminNube.classList.add('is-error');
      titulo.textContent = state.nube.error === 'sesion' ? 'Sesión vencida' : 'Sin conexión con la nube';
      texto.textContent =
        state.nube.error === 'sesion'
          ? 'Vuelve a entrar como administrador para guardar cambios.'
          : 'Se muestra el último catálogo guardado en este teléfono.';
      return;
    }

    if (state.nube.vacia) {
      el.adminNube.classList.add('is-busy');
      titulo.textContent = 'La nube está vacía';
      texto.textContent = productosActivos.length
        ? 'Entra como administrador y pulsa «Subir catálogo a la nube» para publicarlo.'
        : 'Entra como administrador y crea el primer producto. Se guardará en la nube.';
      return;
    }

    el.adminNube.classList.add('is-ok');
    titulo.textContent = state.nube.email ? `Conectado como ${state.nube.email}` : 'Nube conectada';
    texto.textContent = state.nube.ultima
      ? `Última actualización: ${new Date(state.nube.ultima).toLocaleTimeString(config.locale, {
          hour: '2-digit',
          minute: '2-digit',
        })} · Los cambios se comparten con todos los vendedores.`
      : 'Los cambios se comparten con todos los vendedores.';
  }

  function aplicarProductosNube(lista, opciones = {}) {
    const { silencioso = true } = opciones;
    const normalizados = (Array.isArray(lista) ? lista : [])
      .filter((producto) => producto && producto.nombre)
      .map(normalizarProducto)
      .filter((producto) => producto.activo);

    const yaInicializada = localStorage.getItem(CLAVES.nubeInicializada) === '1';

    if (!normalizados.length && !yaInicializada) {
      state.nube.vacia = true;
      state.nube.ultima = Date.now();
      actualizarEstadoNube();
      return false;
    }

    const antes = JSON.stringify(productosActivos);
    const despues = JSON.stringify(normalizados);

    state.nube.vacia = false;
    state.nube.error = '';
    state.nube.ultima = Date.now();

    if (antes === despues) {
      actualizarEstadoNube();
      return false;
    }

    productosActivos = normalizados;
    guardarCacheProductos();
    placeholderCache.clear();

    if (normalizados.length) {
      guardarTexto(CLAVES.nubeInicializada, '1');
    }

    const ids = new Set(productosActivos.map((producto) => producto.id));
    const carritoAnterior = state.carrito.length;
    state.carrito = state.carrito.filter((item) => ids.has(item.id));
    if (state.carrito.length !== carritoAnterior) guardarCarrito();

    if (
      state.filtros.categoria !== 'Todas' &&
      !productosActivos.some((entrada) => entrada.categoria === state.filtros.categoria)
    ) {
      state.filtros.categoria = 'Todas';
    }

    renderCategorias();
    renderProductos();
    renderAdmin();
    renderCarrito();

    if (!silencioso) mostrarToast('Catálogo actualizado desde la nube');
    actualizarEstadoNube();
    return true;
  }

  async function sincronizarProductos(opciones = {}) {
    const { silencioso = true, forzar = false } = opciones;

    if (!usaNube || state.nube.sincronizando) return false;
    if (!forzar && state.nube.ultima && Date.now() - state.nube.ultima < 5000) return false;

    state.nube.sincronizando = true;
    actualizarEstadoNube();

    try {
      const lista = await nube.listarProductos();
      state.nube.error = '';
      const cambio = aplicarProductosNube(lista, { silencioso });
      if (!silencioso && !cambio) mostrarToast('El catálogo ya está actualizado');
      return true;
    } catch (error) {
      console.warn('No se pudo sincronizar el catálogo', error);
      state.nube.error = error.codigo === 'sesion' ? 'sesion' : 'red';
      if (error.codigo === 'sesion') state.nube.email = '';
      if (!silencioso) mostrarToast(error.message || 'No se pudo conectar con la nube');
      return false;
    } finally {
      state.nube.sincronizando = false;
      actualizarEstadoNube();
    }
  }

  function iniciarNube() {
    if (!usaNube) {
      actualizarEstadoNube();
      return;
    }

    state.nube.email = nube.emailSesion();
    actualizarEstadoNube();
    sincronizarProductos({ silencioso: true, forzar: true });

    clearInterval(nubeTimer);
    nubeTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        sincronizarProductos({ silencioso: true });
      }
    }, config.sincronizacionSegundos * 1000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) sincronizarProductos({ silencioso: true });
    });

    window.addEventListener('online', () => {
      state.nube.error = '';
      sincronizarProductos({ silencioso: true, forzar: true });
    });

    window.addEventListener('focus', () => sincronizarProductos({ silencioso: true }));
  }

  function requiereSesion(accionPendiente) {
    if (!usaNube) return true;
    if (nube.sesionActiva()) return true;

    state.loginPendiente = typeof accionPendiente === 'function' ? accionPendiente : null;
    abrirLogin();
    return false;
  }

  function abrirLogin() {
    if (!usaNube || !el.loginModal) return;

    if (state.modoVendedor) {
      mostrarToast('Este teléfono está en modo vendedor');
      return;
    }

    if (el.loginError) {
      el.loginError.hidden = true;
      el.loginError.textContent = '';
    }
    if (el.formLogin) el.formLogin.reset();

    abrirModal(el.loginModal);

    setTimeout(() => {
      const correo = el.formLogin && el.formLogin.elements.namedItem('email');
      if (correo) correo.focus();
    }, 180);
  }

  async function manejarLogin(evento) {
    evento.preventDefault();
    if (!usaNube || !el.formLogin) return;

    const datos = new FormData(el.formLogin);
    const email = String(datos.get('email') || '').trim();
    const contrasena = String(datos.get('password') || '');

    if (!email || !contrasena) {
      if (el.loginError) {
        el.loginError.textContent = 'Escribe tu correo y contraseña.';
        el.loginError.hidden = false;
      }
      return;
    }

    const boton = el.btnLogin;
    if (boton) {
      boton.disabled = true;
      boton.textContent = 'Entrando…';
    }
    if (el.loginError) el.loginError.hidden = true;

    try {
      const sesion = await nube.iniciarSesion(email, contrasena);
      state.nube.email = (sesion && sesion.email) || email;
      state.nube.error = '';
      cerrarModal();
      mostrarToast('Sesión iniciada');
      actualizarEstadoNube();

      const pendiente = state.loginPendiente;
      state.loginPendiente = null;

      await sincronizarProductos({ silencioso: true, forzar: true });

      if (state.nube.vacia) {
        mostrarToast('La nube está vacía. Pulsa «Subir catálogo a la nube».');
      }

      if (typeof pendiente === 'function') {
        setTimeout(pendiente, 260);
      }
    } catch (error) {
      console.warn(error);
      if (el.loginError) {
        el.loginError.textContent = error.message || 'No se pudo iniciar sesión.';
        el.loginError.hidden = false;
      }
      const campo = el.formLogin.elements.namedItem('password');
      if (campo) campo.focus();
    } finally {
      if (boton) {
        boton.disabled = false;
        boton.textContent = 'Entrar';
      }
    }
  }

  async function alternarSesionNube() {
    if (!usaNube) return;

    if (!nube.sesionActiva()) {
      abrirLogin();
      return;
    }

    if (!window.confirm('¿Cerrar la sesión de administrador en este teléfono?')) return;

    await nube.cerrarSesion();
    state.nube.email = '';
    mostrarToast('Sesión cerrada');
    actualizarEstadoNube();
  }

  function manejarErrorNube(error, prefijo) {
    console.warn(prefijo, error);

    if (error && error.codigo === 'sesion') {
      state.nube.email = '';
      state.nube.error = 'sesion';
      actualizarEstadoNube();
      mostrarToast('Tu sesión expiró. Vuelve a entrar.');
      abrirLogin();
      return;
    }

    mostrarToast(`${prefijo}: ${(error && error.message) || 'revisa tu conexión'}`);
  }

  async function subirCatalogoNube() {
    if (!usaNube) return;
    if (!requiereSesion(subirCatalogoNube)) return;

    if (!productosActivos.length) {
      mostrarToast('No hay productos para subir');
      return;
    }

    const confirmado = window.confirm(
      `¿Subir ${productosActivos.length} productos de este teléfono a la nube?\n\nEsto reemplaza el catálogo que ven todos los vendedores.`
    );
    if (!confirmado) return;

    state.nube.sincronizando = true;
    actualizarEstadoNube();

    try {
      await nube.reemplazarProductos(productosActivos);
      guardarTexto(CLAVES.nubeInicializada, '1');
      state.nube.vacia = false;
      state.nube.error = '';
      state.nube.ultima = Date.now();
      mostrarToast('Catálogo subido. Los vendedores lo verán en unos segundos.');
    } catch (error) {
      manejarErrorNube(error, 'No se pudo subir el catálogo');
      return;
    } finally {
      state.nube.sincronizando = false;
      actualizarEstadoNube();
    }

    await sincronizarProductos({ silencioso: true, forzar: true });
  }

  function capturarFormularioProducto() {
    if (!el.formProducto) return null;

    const datos = {};
    new FormData(el.formProducto).forEach((valor, nombre) => {
      datos[nombre] = valor;
    });

    return {
      datos,
      foto: state.fotoTemporal,
      editando: state.productoEditando ? state.productoEditando.id : '',
    };
  }

  function restaurarFormularioProducto(borrador) {
    if (!borrador) return;

    abrirFormularioProducto(borrador.editando || null);

    Object.entries(borrador.datos || {}).forEach(([nombre, valor]) => {
      const campo = el.formProducto.elements.namedItem(nombre);
      if (campo && 'value' in campo) campo.value = valor;
    });

    actualizarCamposPrecios();
    state.fotoTemporal = borrador.foto || '';
    actualizarPreviewFoto();
  }

  function llenarCategoriasDatalist() {
    if (!el.listaCategorias) return;
    el.listaCategorias.innerHTML = categoriasDisponibles()
      .map(([nombre]) => `<option value="${escapeHtml(nombre)}"></option>`)
      .join('');
  }

  function actualizarPreviewFoto() {
    if (!el.productoPreview) return;

    if (state.fotoTemporal) {
      el.productoPreview.src = state.fotoTemporal;
    } else {
      const nombre = el.formProducto.elements.namedItem('nombre').value || 'Producto';
      const categoria = el.formProducto.elements.namedItem('categoria').value || 'Sin categoría';
      el.productoPreview.src = placeholderDataUri(
        {
          id: 'preview',
          nombre,
          categoria,
        },
        true
      );
    }

    el.btnQuitarFoto.hidden = !state.fotoTemporal;
  }

  function actualizarCamposPrecios() {
    if (!el.formProducto) return;

    const unidad = normalizarPresentacion(el.formProducto.elements.namedItem('unidad').value);

    $$('[data-precio]', el.formProducto).forEach((campo) => {
      const esPrincipal = campo.dataset.precio === unidad;
      const input = campo.querySelector('input');
      const marca = campo.querySelector('[data-req]');

      campo.classList.toggle('is-principal', esPrincipal);
      if (input) input.required = esPrincipal;
      if (marca) marca.hidden = !esPrincipal;
    });
  }

  function abrirFormularioProducto(id) {
    if (state.modoVendedor) {
      mostrarToast('Este teléfono está en modo vendedor');
      return;
    }

    if (usaNube && !nube.sesionActiva()) {
      state.loginPendiente = () => abrirFormularioProducto(id);
      abrirLogin();
      return;
    }

    const producto = id ? productoPorId(id) : null;

    state.productoEditando = producto;
    state.fotoTemporal = producto ? producto.imagen : '';

    el.formProducto.reset();
    el.formProducto.elements.namedItem('id').value = producto ? producto.id : '';
    el.formProducto.elements.namedItem('nombre').value = producto ? producto.nombre : '';
    el.formProducto.elements.namedItem('categoria').value = producto ? producto.categoria : '';
    el.formProducto.elements.namedItem('unidad').value = producto ? producto.unidad : 'unidad';

    PRESENTACIONES.forEach(({ clave, campo }) => {
      const input = el.formProducto.elements.namedItem(campo);
      if (!input) return;
      const valor = producto && producto.precios ? Number(producto.precios[clave]) || 0 : 0;
      input.value = valor > 0 ? valor : '';
    });

    el.formProducto.elements.namedItem('descripcion').value = producto ? producto.descripcion : '';
    el.formProducto.elements.namedItem('destacado').value = producto && producto.destacado ? '1' : '';
    el.productoImagen.value = '';
    el.productFormTitle.textContent = producto ? 'Editar producto' : 'Nuevo producto';

    llenarCategoriasDatalist();
    actualizarCamposPrecios();
    actualizarPreviewFoto();
    abrirModal(el.productFormModal);
  }

  function comprimirImagen(archivo) {
    return new Promise((resolver, rechazar) => {
      if (!archivo || !String(archivo.type || '').startsWith('image/')) {
        rechazar(new Error('El archivo no es una imagen'));
        return;
      }

      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer la imagen'));
      lector.onload = () => {
        const imagen = new Image();
        imagen.onerror = () => rechazar(new Error('No se pudo procesar la imagen'));
        imagen.onload = () => {
          const lado = 700;
          const escala = Math.min(1, lado / Math.max(imagen.width, imagen.height));
          const ancho = Math.max(1, Math.round(imagen.width * escala));
          const alto = Math.max(1, Math.round(imagen.height * escala));
          const lienzo = document.createElement('canvas');
          lienzo.width = ancho;
          lienzo.height = alto;
          const contexto = lienzo.getContext('2d');
          contexto.fillStyle = '#ffffff';
          contexto.fillRect(0, 0, ancho, alto);
          contexto.drawImage(imagen, 0, 0, ancho, alto);
          resolver(lienzo.toDataURL('image/jpeg', 0.72));
        };
        imagen.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  function setGuardandoProducto(activo) {
    state.guardandoProducto = Boolean(activo);
    if (!el.btnGuardarProducto) return;

    if (!el.btnGuardarProducto.dataset.htmlOriginal) {
      el.btnGuardarProducto.dataset.htmlOriginal = el.btnGuardarProducto.innerHTML;
    }

    el.btnGuardarProducto.disabled = Boolean(activo);
    el.btnGuardarProducto.innerHTML = activo
      ? 'Guardando…'
      : el.btnGuardarProducto.dataset.htmlOriginal;
  }

  async function manejarSubmitProducto(evento) {
    evento.preventDefault();
    if (state.guardandoProducto) return;
    if (!el.formProducto.reportValidity()) return;

    const datos = {};
    new FormData(el.formProducto).forEach((valor, nombre) => {
      datos[nombre] = valor;
    });

    const nombre = String(datos.nombre || '').trim();
    const categoria = String(datos.categoria || '').trim();
    const unidad = normalizarPresentacion(datos.unidad);
    const precios = {};

    PRESENTACIONES.forEach(({ clave, campo }) => {
      const valor = Number(String(datos[campo] || '').replace(',', '.'));
      if (Number.isFinite(valor) && valor > 0) {
        precios[clave] = Math.round(valor * 100) / 100;
      }
    });

    const precio = precios[unidad] || 0;

    if (!nombre || !categoria) {
      mostrarToast('Escribe el nombre y la categoría');
      return;
    }

    if (!(precio > 0)) {
      mostrarToast(`Escribe el precio por ${nombrePresentacion(unidad).toLowerCase()}`);
      return;
    }

    if (usaNube && !nube.sesionActiva()) {
      const borrador = capturarFormularioProducto();
      state.loginPendiente = () => restaurarFormularioProducto(borrador);
      abrirLogin();
      mostrarToast('Entra como administrador para guardar en la nube');
      return;
    }

    const existente = datos.id ? productoPorId(datos.id) : null;
    const producto = normalizarProducto({
      id: existente ? existente.id : usaNube ? generarIdProductoNube() : generarIdProducto(),
      nombre,
      categoria,
      precio,
      unidad,
      precios,
      descripcion: datos.descripcion || '',
      imagen: state.fotoTemporal || '',
      destacado: datos.destacado === '1',
      orden: existente ? existente.orden : Math.floor(Date.now() / 1000),
    });

    const anterior = productosActivos;
    productosActivos = existente
      ? productosActivos.map((entrada) => (entrada.id === producto.id ? producto : entrada))
      : productosActivos.concat(producto);

    if (usaNube) {
      setGuardandoProducto(true);
      try {
        await nube.guardarProducto(producto);
      } catch (error) {
        productosActivos = anterior;
        manejarErrorNube(error, 'No se pudo guardar el producto');
        return;
      } finally {
        setGuardandoProducto(false);
      }
      guardarCacheProductos();
      guardarTexto(CLAVES.nubeInicializada, '1');
      state.nube.vacia = false;
      state.nube.error = '';
      state.nube.ultima = Date.now();
    } else if (!guardarProductos()) {
      productosActivos = anterior;
      return;
    }

    placeholderCache.delete(producto.id);

    if (
      state.filtros.categoria !== 'Todas' &&
      !productosActivos.some((entrada) => entrada.categoria === state.filtros.categoria)
    ) {
      state.filtros.categoria = 'Todas';
    }

    cerrarModal();
    renderCategorias();
    renderProductos();
    renderAdmin();
    renderCarrito();

    if (usaNube && nube.preciosNoSoportados) {
      mostrarToast(
        'Producto guardado. Falta agregar la columna "precios" en Supabase para que las presentaciones se sincronicen.'
      );
    } else {
      mostrarToast(existente ? 'Producto actualizado' : 'Producto creado');
    }
  }

  async function eliminarProducto(id) {
    const producto = productoPorId(id);
    if (!producto) return;

    if (!requiereSesion(() => eliminarProducto(id))) return;
    if (!window.confirm(`¿Eliminar "${producto.nombre}" del catálogo?`)) return;

    const anterior = productosActivos;
    productosActivos = productosActivos.filter((entrada) => entrada.id !== id);

    if (usaNube) {
      try {
        await nube.eliminarProducto(id);
      } catch (error) {
        productosActivos = anterior;
        manejarErrorNube(error, 'No se pudo eliminar el producto');
        return;
      }
      guardarCacheProductos();
    } else if (!guardarProductos()) {
      productosActivos = anterior;
      return;
    }

    placeholderCache.delete(id);

    const carritoAnterior = state.carrito;
    state.carrito = state.carrito.filter((item) => item.id !== id);
    if (state.carrito.length !== carritoAnterior.length) guardarCarrito();

    if (
      state.filtros.categoria !== 'Todas' &&
      !productosActivos.some((entrada) => entrada.categoria === state.filtros.categoria)
    ) {
      state.filtros.categoria = 'Todas';
    }

    renderCategorias();
    renderProductos();
    renderAdmin();
    renderCarrito();
    mostrarToast('Producto eliminado');
  }

  async function restaurarProductos() {
    if (!config.mostrarCatalogoEjemplo) return;
    if (!requiereSesion(restaurarProductos)) return;

    const cantidad = productosBase.length;
    const mensaje = usaNube
      ? `¿Restaurar los ${cantidad} productos de ejemplo? Se reemplazará el catálogo de la nube y todos los vendedores verán estos productos.`
      : `¿Restaurar los ${cantidad} productos de ejemplo? Se perderán los productos y cambios guardados en este teléfono.`;

    if (!window.confirm(mensaje)) return;

    const anterior = productosActivos;
    const lista = productosBase.map((producto) => normalizarProducto(producto));

    if (usaNube) {
      state.nube.sincronizando = true;
      actualizarEstadoNube();

      try {
        await nube.reemplazarProductos(lista);
        guardarTexto(CLAVES.nubeInicializada, '1');
        state.nube.vacia = false;
        state.nube.error = '';
        state.nube.ultima = Date.now();
      } catch (error) {
        productosActivos = anterior;
        manejarErrorNube(error, 'No se pudo restaurar en la nube');
        return;
      } finally {
        state.nube.sincronizando = false;
      }
    } else {
      try {
        localStorage.removeItem(CLAVES.productos);
      } catch (error) {
        console.warn(error);
      }
    }

    productosActivos = lista;
    if (usaNube) guardarCacheProductos();
    placeholderCache.clear();

    const ids = new Set(productosActivos.map((producto) => producto.id));
    state.carrito = state.carrito.filter((item) => ids.has(item.id));
    guardarCarrito();
    state.filtros.categoria = 'Todas';
    state.admin.texto = '';
    el.adminBuscador.value = '';

    renderCategorias();
    renderProductos();
    renderAdmin();
    renderCarrito();
    mostrarToast('Catálogo de ejemplo restaurado');
  }

  function exportarProductos() {
    const contenido = {
      negocio: config.nombreNegocio,
      exportado: new Date().toISOString(),
      productos: productosActivos,
    };

    descargarBlob(
      new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json;charset=utf-8' }),
      `productos-${toISODate(new Date())}.json`
    );
    mostrarToast('Respaldo de productos descargado');
  }

  async function importarProductos(archivo) {
    if (!archivo) return;
    if (!requiereSesion(() => importarProductos(archivo))) return;

    try {
      const texto = await archivo.text();
      const datos = JSON.parse(texto);
      const lista = Array.isArray(datos) ? datos : datos && datos.productos;

      if (!Array.isArray(lista) || !lista.length) {
        throw new Error('El archivo no contiene productos');
      }

      const productos = lista
        .map(normalizarProducto)
        .filter((producto) => producto.nombre && producto.precio > 0);

      if (!productos.length) throw new Error('Los productos no tienen nombre o precio');

      const usados = new Set();
      let siguiente = 1;
      productos.forEach((producto) => {
        if (!producto.id || usados.has(producto.id)) {
          let id = `P${String(siguiente).padStart(3, '0')}`;
          while (usados.has(id)) {
            siguiente += 1;
            id = `P${String(siguiente).padStart(3, '0')}`;
          }
          producto.id = id;
        }
        usados.add(producto.id);
        siguiente += 1;
      });

      const mensaje = usaNube
        ? `¿Reemplazar el catálogo de la nube por los ${productos.length} productos del respaldo? Todos los vendedores verán el cambio.`
        : `¿Reemplazar tus ${productosActivos.length} productos actuales por los ${productos.length} del respaldo?`;

      if (!window.confirm(mensaje)) return;

      const anterior = productosActivos;
      productosActivos = productos;

      if (usaNube) {
        state.nube.sincronizando = true;
        actualizarEstadoNube();

        try {
          await nube.reemplazarProductos(productos);
          guardarTexto(CLAVES.nubeInicializada, '1');
          state.nube.vacia = false;
          state.nube.error = '';
          state.nube.ultima = Date.now();
        } catch (error) {
          productosActivos = anterior;
          manejarErrorNube(error, 'No se pudo importar en la nube');
          return;
        } finally {
          state.nube.sincronizando = false;
        }

        guardarCacheProductos();
      } else if (!guardarProductos()) {
        productosActivos = anterior;
        return;
      }

      placeholderCache.clear();

      const ids = new Set(productosActivos.map((producto) => producto.id));
      state.carrito = state.carrito.filter((item) => ids.has(item.id));
      guardarCarrito();
      state.filtros.categoria = 'Todas';
      state.filtros.texto = '';
      state.admin.texto = '';
      el.buscador.value = '';
      el.adminBuscador.value = '';

      renderCategorias();
      renderProductos();
      renderAdmin();
      renderCarrito();
      mostrarToast('Productos importados correctamente');
    } catch (error) {
      console.warn(error);
      mostrarToast('El archivo no es un respaldo válido de productos.');
    }
  }

  function renderTodo() {
    renderCategorias();
    renderProductos();
    renderCarrito();
    renderPedidos();
    renderAdmin();
    if (state.pedidoExito) renderExito(state.pedidoExito);
  }

  /* ============================================================
     PARTE 3: pedidos, WhatsApp, navegación y eventos
     ============================================================ */

  function mensajePedido(pedido) {
    const cliente = pedido.cliente || {};
    const lineas = [];

    lineas.push(`*PEDIDO ${pedido.numero}*`);
    lineas.push(`*${config.nombreNegocio}*`);
    lineas.push('');
    lineas.push(`👤 *Cliente:* ${cliente.nombre || ''}`);
    lineas.push(`📞 *Teléfono:* ${cliente.telefono || ''}`);
    lineas.push(`📍 *Dirección:* ${cliente.direccion || ''}`);
    lineas.push(`📅 *Entrega:* ${formatearFecha(cliente.entrega)}`);
    lineas.push(`💳 *Pago:* ${cliente.pago || ''}`);
    lineas.push(`🧑‍💼 *Vendedor:* ${pedido.vendedor || ''}`);
    lineas.push('');
    lineas.push('*DETALLE DEL PEDIDO*');

    (pedido.items || []).forEach((item) => {
      lineas.push(`• ${item.cantidad} x ${item.nombre} (${item.unidad || 'unidad'})`);
      lineas.push(`  ${formatearMoneda(item.precio)} c/u = ${formatearMoneda(item.subtotal)}`);
    });

    lineas.push('');
    lineas.push(`*TOTAL: ${formatearMoneda(pedido.total)}*`);

    if (cliente.notas) {
      lineas.push('');
      lineas.push(`📝 *Observaciones:* ${cliente.notas}`);
    }

    lineas.push('');
    lineas.push(`Pedido generado: ${formatearFechaHora(pedido.fecha)}`);

    return lineas.join('\n');
  }

  function crearPedido(datos, detalle) {
    const items = detalle.map(({ producto, cantidad, subtotal, precio, presentacion, presentacionNombre }) => ({
      id: producto.id,
      nombre: producto.nombre,
      categoria: producto.categoria,
      precio,
      presentacion,
      unidad: presentacionNombre,
      cantidad,
      subtotal,
    }));

    return {
      numero: generarNumeroPedido(),
      fecha: new Date().toISOString(),
      vendedor: String(datos.vendedor || '').trim() || state.vendedor || 'Vendedor',
      cliente: {
        nombre: String(datos.clienteNombre || '').trim(),
        telefono: String(datos.clienteTelefono || '').trim(),
        direccion: String(datos.clienteDireccion || '').trim(),
        entrega: datos.fechaEntrega || '',
        pago: datos.formaPago || '',
        notas: String(datos.notas || '').trim(),
      },
      items,
      total: items.reduce((suma, item) => suma + item.subtotal, 0),
      estado: 'guardado',
    };
  }

  function guardarPedido(pedido) {
    state.pedidos.unshift(pedido);
    guardarPedidos();
    state.vendedor = pedido.vendedor;
    guardarTexto(CLAVES.vendedor, state.vendedor);
    renderPedidos();
  }

  function abrirWhatsApp(url) {
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
  }

  function enviarPedido(pedido) {
    if (!pedido) return;

    const mensaje = mensajePedido(pedido);
    const numero = normalizarNumero(config.numeroWhatsApp);
    const usarNumero = config.modoEnvio === 'numero' && !esNumeroPlaceholder(numero);
    const largo = mensaje.length > 3000;

    if (usarNumero) {
      abrirWhatsApp(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`);
      mostrarToast(
        largo
          ? 'WhatsApp abierto. Pedido largo: si falta texto, usa Compartir o Descargar .txt.'
          : 'WhatsApp abierto. Revisa el pedido y pulsa enviar.'
      );
      return;
    }

    if (navigator.share) {
      navigator
        .share({ title: `Pedido ${pedido.numero}`, text: mensaje })
        .catch((error) => {
          if (error && error.name === 'AbortError') return;
          abrirWhatsApp(`https://wa.me/?text=${encodeURIComponent(mensaje)}`);
        });
      return;
    }

    abrirWhatsApp(`https://wa.me/?text=${encodeURIComponent(mensaje)}`);
    if (largo) {
      mostrarToast('WhatsApp abierto. Si el pedido se corta, descarga el .txt y envíalo como archivo.');
    }
  }

  function compartirPedido(pedido) {
    if (!pedido) return;

    const mensaje = mensajePedido(pedido);
    if (navigator.share) {
      navigator
        .share({ title: `Pedido ${pedido.numero}`, text: mensaje })
        .catch((error) => {
          if (error && error.name === 'AbortError') return;
          copiarTexto(mensaje);
        });
    } else {
      copiarTexto(mensaje);
    }
  }

  function copiarConSeleccion(texto) {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, area.value.length);
    const copiado = document.execCommand('copy');
    area.remove();
    if (!copiado) throw new Error('No se pudo copiar con selección');
  }

  async function copiarTexto(texto) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        try {
          await navigator.clipboard.writeText(texto);
        } catch (error) {
          copiarConSeleccion(texto);
        }
      } else {
        copiarConSeleccion(texto);
      }
      mostrarToast('Pedido copiado. Pégalo en WhatsApp.');
    } catch (error) {
      console.warn(error);
      mostrarToast('No se pudo copiar. Descarga el .txt y compártelo.');
    }
  }

  function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = nombre;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function descargarPedido(pedido) {
    if (!pedido) return;
    descargarBlob(
      new Blob([mensajePedido(pedido)], { type: 'text/plain;charset=utf-8' }),
      `${pedido.numero}.txt`
    );
    mostrarToast('Pedido descargado');
  }

  function exportarJSON() {
    if (!state.pedidos.length) return;

    const contenido = {
      negocio: config.nombreNegocio,
      exportado: new Date().toISOString(),
      pedidos: state.pedidos,
    };

    descargarBlob(
      new Blob([JSON.stringify(contenido, null, 2)], { type: 'application/json;charset=utf-8' }),
      `pedidos-${toISODate(new Date())}.json`
    );
    mostrarToast('Respaldo descargado');
  }

  function csvEscapar(valor) {
    const texto = String(valor == null ? '' : valor);
    return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  }

  function exportarCSV() {
    if (!state.pedidos.length) return;

    const filas = [
      ['Pedido', 'Fecha', 'Vendedor', 'Cliente', 'Telefono', 'Direccion', 'Entrega', 'Pago', 'Producto', 'Cantidad', 'Precio', 'Subtotal', 'Total'],
    ];

    state.pedidos.forEach((pedido) => {
      const cliente = pedido.cliente || {};
      (pedido.items || []).forEach((item) => {
        filas.push([
          pedido.numero,
          formatearFechaHora(pedido.fecha),
          pedido.vendedor || '',
          cliente.nombre || '',
          cliente.telefono || '',
          cliente.direccion || '',
          formatearFecha(cliente.entrega),
          cliente.pago || '',
          item.nombre,
          item.cantidad,
          item.precio,
          item.subtotal,
          pedido.total,
        ]);
      });
    });

    const csv = filas.map((fila) => fila.map(csvEscapar).join(',')).join('\r\n');
    descargarBlob(
      new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }),
      `pedidos-${toISODate(new Date())}.csv`
    );
    mostrarToast('CSV descargado');
  }

  function borrarHistorial() {
    if (!state.pedidos.length) return;
    if (
      !window.confirm(
        '¿Borrar todos los pedidos guardados? Esta acción no se puede deshacer. Descarga un respaldo antes si lo necesitas.'
      )
    ) {
      return;
    }

    state.pedidos = [];
    guardarPedidos();
    renderPedidos();
    mostrarToast('Historial borrado');
  }

  function eliminarPedido(numero) {
    const pedido = state.pedidos.find((entrada) => entrada.numero === numero);
    if (!pedido) return;
    if (!window.confirm(`¿Eliminar el pedido ${numero}?`)) return;

    state.pedidos = state.pedidos.filter((entrada) => entrada.numero !== numero);
    guardarPedidos();
    renderPedidos();
    mostrarToast('Pedido eliminado');
  }

  function verPedido(numero) {
    const pedido = state.pedidos.find((entrada) => entrada.numero === numero);
    if (!pedido) return;

    state.pedidoModal = pedido;
    el.orderModalTitle.textContent = pedido.numero;
    el.orderModalBody.innerHTML = resumenPedidoHTML(pedido);
    abrirModal(el.orderModal);
  }

  /* ---------- Navegación ---------- */

  function parseHash() {
    return (location.hash || '').replace(/^#\/?/, '').trim() || 'catalogo';
  }

  /* ---------- Modo vendedor: teléfono sin acceso de administrador ---------- */

  let modoVendedorNuevo = false;

  function limpiarParametroVendedor() {
    try {
      const params = new URLSearchParams(location.search);
      params.delete('vendedor');
      const consulta = params.toString();
      history.replaceState(
        null,
        '',
        `${location.pathname}${consulta ? `?${consulta}` : ''}${location.hash}`
      );
    } catch (error) {
      /* sin historial disponible */
    }
  }

  function detectarModoVendedor() {
    try {
      const valor = new URLSearchParams(location.search).get('vendedor');

      if (valor === '1' || valor === 'true') {
        localStorage.setItem(CLAVES.modoVendedor, '1');
        modoVendedorNuevo = true;
        limpiarParametroVendedor();
        return true;
      }

      if (valor === '0' || valor === 'false') {
        localStorage.removeItem(CLAVES.modoVendedor);
        limpiarParametroVendedor();
        return false;
      }

      return localStorage.getItem(CLAVES.modoVendedor) === '1';
    } catch (error) {
      return false;
    }
  }

  function aplicarModoVendedor() {
    if (!state.modoVendedor) return;

    document.body.classList.add('modo-vendedor');

    $$('[data-nav="productos"]').forEach((enlace) => {
      enlace.hidden = true;
    });

    const botonProductos = $('#btn-productos-movil');
    if (botonProductos) botonProductos.hidden = true;

    if (usaNube && nube.sesionActiva()) {
      nube.cerrarSesion();
      state.nube.email = '';
    }

    if (typeof actualizarEstadoNube === 'function') actualizarEstadoNube();
  }

  function navegar(vista) {
    const destino = ['catalogo', 'productos', 'checkout', 'pedidos', 'exito'].includes(vista)
      ? vista
      : 'catalogo';
    const hash = `#/${destino}`;

    if (location.hash === hash) {
      aplicarVista(destino);
    } else {
      location.hash = hash;
    }
  }

  function aplicarVista(vista, opciones = {}) {
    let destino = ['catalogo', 'productos', 'checkout', 'pedidos', 'exito'].includes(vista)
      ? vista
      : 'catalogo';

    if (destino === 'productos' && state.modoVendedor) {
      destino = 'catalogo';
      if (location.hash !== '#/catalogo') history.replaceState(null, '', '#/catalogo');
    }

    if (destino === 'checkout' && carritoDetallado().length === 0 && !opciones.forzar) {
      mostrarToast('Agrega productos al carrito para continuar');
      destino = 'catalogo';
      if (location.hash !== '#/catalogo') history.replaceState(null, '', '#/catalogo');
    }

    if (destino === 'exito' && !state.pedidoExito) {
      destino = 'catalogo';
      if (location.hash !== '#/catalogo') history.replaceState(null, '', '#/catalogo');
    }

    state.vista = destino;

    $$('.view').forEach((seccion) => {
      seccion.hidden = seccion.dataset.view !== destino;
    });

    const navActivo = destino === 'checkout' ? 'carrito' : destino;

    $$('.nav-link').forEach((enlace) => {
      enlace.classList.toggle('is-active', enlace.dataset.nav === navActivo);
    });

    if (destino === 'checkout') {
      renderCheckoutResumen();
      cargarBorrador();
    }

    if (destino === 'pedidos') renderPedidos();
    if (destino === 'productos') renderAdmin();
    if (destino === 'exito') renderExito(state.pedidoExito);

    renderCarrito();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cargarBorrador() {
    const formulario = el.formPedido;
    if (!formulario) return;

    const borrador = leerJSON(CLAVES.borrador, null);
    formulario.reset();

    if (borrador && typeof borrador === 'object') {
      Object.entries(borrador).forEach(([nombre, valor]) => {
        const campo = formulario.elements.namedItem(nombre);
        if (campo && 'value' in campo) campo.value = valor;
      });
    }

    const vendedor = formulario.elements.namedItem('vendedor');
    const fecha = formulario.elements.namedItem('fechaEntrega');

    if (vendedor) vendedor.value = state.vendedor || config.vendedorPorDefecto || '';
    if (fecha) {
      if (!fecha.value) fecha.value = fechaManana();
      fecha.min = toISODate(new Date());
    }

    actualizarAvisoConfig();
  }

  function guardarBorrador() {
    if (!el.formPedido) return;
    const datos = {};
    new FormData(el.formPedido).forEach((valor, nombre) => {
      datos[nombre] = valor;
    });
    guardarJSON(CLAVES.borrador, datos);
  }

  function limpiarFormularioPedido() {
    if (!el.formPedido) return;
    el.formPedido.reset();
    const vendedor = el.formPedido.elements.namedItem('vendedor');
    const fecha = el.formPedido.elements.namedItem('fechaEntrega');
    if (vendedor) vendedor.value = state.vendedor || '';
    if (fecha) fecha.value = fechaManana();
    try {
      localStorage.removeItem(CLAVES.borrador);
    } catch (error) {
      console.warn(error);
    }
  }

  function actualizarAvisoConfig() {
    if (!el.avisoConfig) return;

    const numero = normalizarNumero(config.numeroWhatsApp);
    const placeholder = config.modoEnvio === 'numero' && esNumeroPlaceholder(numero);

    el.avisoConfig.hidden = !placeholder;
    if (placeholder) {
      el.avisoConfig.innerHTML =
        'El número de WhatsApp de bodega aún no está configurado. Abre <strong>js/config.js</strong> y cambia <strong>numeroWhatsApp</strong>. Mientras tanto, el botón abrirá el menú de compartir de WhatsApp.';
    }
  }

  function manejarSubmitPedido(evento) {
    evento.preventDefault();

    const detalle = carritoDetallado();
    if (!detalle.length) {
      mostrarToast('Tu carrito está vacío');
      navegar('catalogo');
      return;
    }

    if (!el.formPedido.reportValidity()) return;

    const datos = {};
    new FormData(el.formPedido).forEach((valor, nombre) => {
      datos[nombre] = valor;
    });

    const pedido = crearPedido(datos, detalle);
    guardarPedido(pedido);

    state.pedidoExito = pedido;
    state.carrito = [];
    guardarCarrito();

    try {
      localStorage.removeItem(CLAVES.borrador);
    } catch (error) {
      console.warn(error);
    }

    renderCarrito();
    renderPedidos();
    renderExito(pedido);
    navegar('exito');
    enviarPedido(pedido);
  }

  /* ---------- Modales y carrito ---------- */

  function listaModales() {
    return [el.productModal, el.orderModal, el.productFormModal, el.loginModal].filter(Boolean);
  }

  function obtenerModalAbierto() {
    return listaModales().find((modal) => !modal.hidden) || null;
  }

  function abrirModal(modal) {
    if (!modal) return;

    if (!el.cartDrawer.hidden) cerrarCarrito();
    clearTimeout(modalCloseTimer);
    ultimoFoco = document.activeElement;

    listaModales().forEach((otro) => {
      if (otro !== modal) {
        otro.hidden = true;
        otro.classList.remove('is-open');
      }
    });

    el.modalOverlay.hidden = false;
    modal.hidden = false;

    requestAnimationFrame(() => {
      el.modalOverlay.classList.add('is-visible');
      modal.classList.add('is-open');
    });

    actualizarBloqueoScroll();

    const enfocable = modal.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (enfocable) setTimeout(() => enfocable.focus(), 80);
  }

  function cerrarModal() {
    const modal = obtenerModalAbierto();
    if (!modal) return;

    modal.classList.remove('is-open');
    el.modalOverlay.classList.remove('is-visible');
    clearTimeout(modalCloseTimer);

    modalCloseTimer = setTimeout(() => {
      listaModales().forEach((otro) => {
        otro.hidden = true;
      });
      el.modalOverlay.hidden = true;
      actualizarBloqueoScroll();
      if (ultimoFoco && typeof ultimoFoco.focus === 'function') ultimoFoco.focus();
    }, 220);
  }

  function abrirCarrito() {
    if (!el.cartDrawer.hidden) return;
    if (obtenerModalAbierto()) cerrarModal();

    clearTimeout(cartCloseTimer);
    renderCarrito();

    el.cartOverlay.hidden = false;
    el.cartDrawer.hidden = false;
    el.cartDrawer.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => {
      el.cartOverlay.classList.add('is-visible');
      el.cartDrawer.classList.add('is-open');
    });

    actualizarBloqueoScroll();

    const cerrar = el.cartDrawer.querySelector('[data-action="cerrar-carrito"]');
    if (cerrar) setTimeout(() => cerrar.focus(), 80);
  }

  function cerrarCarrito() {
    if (el.cartDrawer.hidden) return;

    el.cartDrawer.classList.remove('is-open');
    el.cartOverlay.classList.remove('is-visible');
    clearTimeout(cartCloseTimer);

    cartCloseTimer = setTimeout(() => {
      el.cartDrawer.hidden = true;
      el.cartDrawer.setAttribute('aria-hidden', 'true');
      el.cartOverlay.hidden = true;
      actualizarBloqueoScroll();
    }, 220);
  }

  function irCheckout() {
    if (!carritoDetallado().length) {
      mostrarToast('Agrega productos al carrito');
      return;
    }
    cerrarCarrito();
    navegar('checkout');
  }

  /* ============================================================
     PARTE 4: inicialización y eventos
     ============================================================ */

  function cacheElementos() {
    el.brandNombre = $('#brand-nombre');
    el.brandEslogan = $('#brand-eslogan');
    el.footerNombre = $('#footer-nombre');
    el.statProductos = $('#stat-productos');
    el.statCategorias = $('#stat-categorias');
    el.buscador = $('#buscador');
    el.btnLimpiarBusqueda = $('#btn-limpiar-busqueda');
    el.categorias = $('#categorias');
    el.orden = $('#orden');
    el.resultadosTexto = $('#resultados-texto');
    el.btnLimpiarFiltros = $('#btn-limpiar-filtros');
    el.productosGrid = $('#productos');
    el.sinResultados = $('#sin-resultados');
    el.sinProductos = $('#sin-productos');
    el.btnMas = $('#btn-mas');
    el.btnCarrito = $('#btn-carrito');
    el.cartBadge = $('#cart-badge');
    el.cartCountLabel = $('#cart-count-label');
    el.cartItems = $('#cart-items');
    el.cartEmpty = $('#cart-empty');
    el.cartTotal = $('#cart-total');
    el.btnCheckout = $('#btn-checkout');
    el.btnVaciarCarrito = $('#btn-vaciar-carrito');
    el.cartDrawer = $('#cart-drawer');
    el.cartOverlay = $('#cart-overlay');
    el.mobileCartBar = $('#mobile-cart-bar');
    el.mobileCartCount = $('#mobile-cart-count');
    el.mobileCartTotal = $('#mobile-cart-total');
    el.checkoutCount = $('#checkout-count');
    el.checkoutItems = $('#checkout-items');
    el.checkoutTotal = $('#checkout-total');
    el.formPedido = $('#form-pedido');
    el.avisoConfig = $('#aviso-config');
    el.pedidosLista = $('#pedidos-lista');
    el.pedidosVacio = $('#pedidos-vacio');
    el.btnExportarJson = $('#btn-exportar-json');
    el.btnExportarCsv = $('#btn-exportar-csv');
    el.btnBorrarHistorial = $('#btn-borrar-historial');
    el.exitoTexto = $('#exito-texto');
    el.exitoResumen = $('#exito-resumen');
    el.btnReenviarExito = $('#btn-reenviar-exito');
    el.btnCompartirExito = $('#btn-compartir-exito');
    el.btnCopiarExito = $('#btn-copiar-exito');
    el.btnDescargarExito = $('#btn-descargar-exito');
    el.btnPdfExito = $('#btn-pdf-exito');
    el.btnNuevoPedido = $('#btn-nuevo-pedido');
    el.productModal = $('#product-modal');
    el.modalOverlay = $('#modal-overlay');
    el.modalImg = $('#modal-img');
    el.modalCategoria = $('#modal-categoria');
    el.modalTitle = $('#modal-title');
    el.modalDesc = $('#modal-desc');
    el.modalPrecio = $('#modal-precio');
    el.modalUnidad = $('#modal-unidad');
    el.modalPresentacion = $('#modal-presentacion');
    el.modalPresentacionCampo = $('#modal-presentacion-campo');
    el.modalQty = $('#modal-qty');
    el.btnModalAdd = $('#btn-modal-add');
    el.orderModal = $('#order-modal');
    el.orderModalTitle = $('#order-modal-title');
    el.orderModalBody = $('#order-modal-body');
    el.toast = $('#toast');
    el.printArea = $('#print-area');
    el.btnInstalar = $('#btn-instalar');
    el.tabCarrito = $('#tab-carrito');
    el.tabCartBadge = $('#tab-cart-badge');
    el.adminBuscador = $('#admin-buscador');
    el.adminContador = $('#admin-contador');
    el.adminLista = $('#admin-lista');
    el.adminVacio = $('#admin-vacio');
    el.adminVacioTitulo = $('#admin-vacio-titulo');
    el.adminVacioTexto = $('#admin-vacio-texto');
    el.adminAlmacenamiento = $('#admin-almacenamiento');
    el.adminNube = $('#admin-nube');
    el.adminNubeTitulo = $('#admin-nube-titulo');
    el.adminNubeTexto = $('#admin-nube-texto');
    el.btnSincronizarProductos = $('#btn-sincronizar-productos');
    el.btnSesionNube = $('#btn-sesion-nube');
    el.btnSubirNube = $('#btn-subir-nube');
    el.adminPieTexto = $('#admin-pie-texto');
    el.btnNuevoProducto = $('#btn-nuevo-producto');
    el.btnRestaurarProductos = $('#btn-restaurar-productos');
    el.btnExportarProductos = $('#btn-exportar-productos');
    el.archivoProductos = $('#archivo-productos');
    el.productFormModal = $('#product-form-modal');
    el.formProducto = $('#form-producto');
    el.productFormTitle = $('#product-form-title');
    el.productoPreview = $('#producto-preview');
    el.productoImagen = $('#producto-imagen');
    el.btnQuitarFoto = $('#btn-quitar-foto');
    el.listaCategorias = $('#lista-categorias');
    el.btnGuardarProducto = $('#btn-guardar-producto');
    el.loginModal = $('#login-modal');
    el.formLogin = $('#form-login');
    el.loginError = $('#login-error');
    el.btnLogin = $('#btn-login');
  }

  function cambiarCantidadModal(delta) {
    state.modalCantidad = Math.min(999, Math.max(1, state.modalCantidad + delta));
    el.modalQty.textContent = state.modalCantidad;
  }

  function actualizarPrecioModal() {
    const producto = state.productoModal;
    if (!producto) return;

    const presentacion = normalizarPresentacion(state.modalPresentacion);
    const precio = precioPresentacion(producto, presentacion);

    el.modalPrecio.textContent = formatearMoneda(precio);
    el.modalUnidad.textContent = `por ${nombrePresentacion(presentacion).toLowerCase()}`;
  }

  function abrirProducto(id) {
    const producto = productoPorId(id);
    if (!producto) return;

    const presentaciones = presentacionesDisponibles(producto);
    const porDefecto = presentaciones.some((presentacion) => presentacion.clave === producto.unidad)
      ? producto.unidad
      : presentaciones[0]
        ? presentaciones[0].clave
        : producto.unidad;

    state.productoModal = producto;
    state.modalCantidad = 1;
    state.modalPresentacion = porDefecto;

    el.modalImg.src = imagenProducto(producto);
    el.modalImg.alt = producto.nombre;
    el.modalImg.dataset.fallback = placeholderDataUri(producto);
    el.modalCategoria.textContent = producto.categoria;
    el.modalTitle.textContent = producto.nombre;
    el.modalDesc.textContent = descripcionProducto(producto);

    el.modalPresentacion.innerHTML = presentaciones
      .map(
        (presentacion) =>
          `<option value="${escapeHtml(presentacion.clave)}">${escapeHtml(presentacion.nombre)} · ${formatearMoneda(
            presentacion.precio
          )}</option>`
      )
      .join('');
    el.modalPresentacion.value = porDefecto;
    if (el.modalPresentacionCampo) {
      el.modalPresentacionCampo.hidden = presentaciones.length < 2;
    }

    el.modalQty.textContent = '1';
    el.btnModalAdd.dataset.id = producto.id;

    actualizarPrecioModal();
    abrirModal(el.productModal);
  }

  function buscarPedido(numero) {
    return state.pedidos.find((pedido) => pedido.numero === numero) || null;
  }

  function configurarEventos() {
    el.buscador.addEventListener('input', () => {
      state.filtros.texto = el.buscador.value;
      state.visibles = config.productosPorPagina;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderProductos, 180);
    });

    el.btnLimpiarBusqueda.addEventListener('click', () => {
      clearTimeout(searchTimer);
      el.buscador.value = '';
      state.filtros.texto = '';
      state.visibles = config.productosPorPagina;
      renderProductos();
      el.buscador.focus();
    });

    el.categorias.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-categoria]');
      if (!boton) return;
      state.filtros.categoria = boton.dataset.categoria;
      state.visibles = config.productosPorPagina;
      renderCategorias();
      renderProductos();
    });

    el.orden.addEventListener('change', () => {
      state.filtros.orden = el.orden.value;
      state.visibles = config.productosPorPagina;
      renderProductos();
    });

    el.btnMas.addEventListener('click', () => {
      state.visibles += config.productosPorPagina;
      renderProductos();
    });

    el.btnLimpiarFiltros.addEventListener('click', limpiarFiltros);

    el.productosGrid.addEventListener('click', (evento) => {
      const agregar = evento.target.closest('[data-add]');
      if (agregar) {
        evento.stopPropagation();
        agregarAlCarrito(agregar.dataset.add, 1);
        return;
      }

      const tarjeta = evento.target.closest('.producto-card');
      if (tarjeta) abrirProducto(tarjeta.dataset.id);
    });

    el.productosGrid.addEventListener('keydown', (evento) => {
      if (evento.key !== 'Enter' && evento.key !== ' ') return;
      if (!evento.target.classList.contains('producto-card')) return;
      evento.preventDefault();
      abrirProducto(evento.target.dataset.id);
    });

    el.cartItems.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-cart-action]');
      if (!boton) return;

      const accion = boton.dataset.cartAction;
      const clave = boton.dataset.cartKey;

      if (accion === 'mas') cambiarCantidad(clave, 1);
      if (accion === 'menos') cambiarCantidad(clave, -1);
      if (accion === 'eliminar') eliminarDelCarrito(clave);
    });

    el.btnCarrito.addEventListener('click', abrirCarrito);
    el.cartOverlay.addEventListener('click', cerrarCarrito);
    el.btnCheckout.addEventListener('click', irCheckout);
    el.btnVaciarCarrito.addEventListener('click', vaciarCarrito);
    el.modalOverlay.addEventListener('click', cerrarModal);

    el.btnModalAdd.addEventListener('click', () => {
      if (!state.productoModal) return;
      agregarAlCarrito(state.productoModal.id, state.modalCantidad, state.modalPresentacion);
      cerrarModal();
    });

    el.modalPresentacion.addEventListener('change', () => {
      state.modalPresentacion = el.modalPresentacion.value;
      actualizarPrecioModal();
    });

    el.formPedido.addEventListener('submit', manejarSubmitPedido);
    el.formPedido.addEventListener('input', guardarBorrador);
    el.formPedido.addEventListener('change', guardarBorrador);

    el.pedidosLista.addEventListener('click', (evento) => {
      const ver = evento.target.closest('[data-pedido-ver]');
      if (ver) {
        verPedido(ver.dataset.pedidoVer);
        return;
      }

      const enviar = evento.target.closest('[data-pedido-enviar]');
      if (enviar) {
        const pedido = buscarPedido(enviar.dataset.pedidoEnviar);
        if (pedido) enviarPedido(pedido);
        return;
      }

      const copiar = evento.target.closest('[data-pedido-copiar]');
      if (copiar) {
        const pedido = buscarPedido(copiar.dataset.pedidoCopiar);
        if (pedido) copiarTexto(mensajePedido(pedido));
        return;
      }

      const descargar = evento.target.closest('[data-pedido-descargar]');
      if (descargar) {
        const pedido = buscarPedido(descargar.dataset.pedidoDescargar);
        if (pedido) descargarPedido(pedido);
        return;
      }

      const pdf = evento.target.closest('[data-pedido-pdf]');
      if (pdf) {
        const pedido = buscarPedido(pdf.dataset.pedidoPdf);
        if (pedido) imprimirPedido(pedido);
        return;
      }

      const eliminar = evento.target.closest('[data-pedido-eliminar]');
      if (eliminar) eliminarPedido(eliminar.dataset.pedidoEliminar);
    });

    el.btnExportarJson.addEventListener('click', exportarJSON);
    el.btnExportarCsv.addEventListener('click', exportarCSV);
    el.btnBorrarHistorial.addEventListener('click', borrarHistorial);

    el.btnReenviarExito.addEventListener('click', () => enviarPedido(state.pedidoExito));
    el.btnCompartirExito.addEventListener('click', () => compartirPedido(state.pedidoExito));
    el.btnCopiarExito.addEventListener('click', () => {
      if (state.pedidoExito) copiarTexto(mensajePedido(state.pedidoExito));
    });
    el.btnDescargarExito.addEventListener('click', () => descargarPedido(state.pedidoExito));
    el.btnPdfExito.addEventListener('click', () => imprimirPedido(state.pedidoExito));
    el.btnNuevoPedido.addEventListener('click', () => {
      state.pedidoExito = null;
      limpiarFormularioPedido();
      navegar('catalogo');
    });

    if (el.tabCarrito) el.tabCarrito.addEventListener('click', abrirCarrito);

    el.btnNuevoProducto.addEventListener('click', () => abrirFormularioProducto());
    el.btnRestaurarProductos.addEventListener('click', restaurarProductos);
    el.btnExportarProductos.addEventListener('click', exportarProductos);
    el.btnSincronizarProductos.addEventListener('click', () =>
      sincronizarProductos({ silencioso: false, forzar: true })
    );
    el.btnSesionNube.addEventListener('click', alternarSesionNube);
    el.btnSubirNube.addEventListener('click', subirCatalogoNube);
    el.formLogin.addEventListener('submit', manejarLogin);
    el.archivoProductos.addEventListener('change', async () => {
      const archivo = el.archivoProductos.files && el.archivoProductos.files[0];
      el.archivoProductos.value = '';
      if (archivo) await importarProductos(archivo);
    });

    el.adminBuscador.addEventListener('input', () => {
      state.admin.texto = el.adminBuscador.value;
      renderAdmin();
    });

    el.adminLista.addEventListener('click', (evento) => {
      const editar = evento.target.closest('[data-admin-editar]');
      if (editar) {
        abrirFormularioProducto(editar.dataset.adminEditar);
        return;
      }

      const eliminar = evento.target.closest('[data-admin-eliminar]');
      if (eliminar) eliminarProducto(eliminar.dataset.adminEliminar);
    });

    el.formProducto.addEventListener('submit', manejarSubmitProducto);

    el.formProducto.addEventListener('input', (evento) => {
      if (evento.target.name === 'nombre' || evento.target.name === 'categoria') {
        actualizarPreviewFoto();
      }
    });

    el.formProducto.addEventListener('change', (evento) => {
      if (evento.target.name === 'unidad') actualizarCamposPrecios();
    });

    el.productoImagen.addEventListener('change', async () => {
      const archivo = el.productoImagen.files && el.productoImagen.files[0];
      if (!archivo) return;

      mostrarToast('Procesando foto...');
      try {
        state.fotoTemporal = await comprimirImagen(archivo);
        actualizarPreviewFoto();
        mostrarToast('Foto lista. Pulsa Guardar producto.');
      } catch (error) {
        console.warn(error);
        el.productoImagen.value = '';
        mostrarToast('No se pudo procesar la foto. Prueba con JPG o PNG.');
      }
    });

    el.btnQuitarFoto.addEventListener('click', () => {
      state.fotoTemporal = '';
      el.productoImagen.value = '';
      actualizarPreviewFoto();
    });

    document.addEventListener('click', (evento) => {
      const accion = evento.target.closest('[data-action]');
      if (!accion) return;

      switch (accion.dataset.action) {
        case 'limpiar-filtros':
          limpiarFiltros();
          break;
        case 'volver-catalogo':
          navegar('catalogo');
          break;
        case 'cerrar-carrito':
          cerrarCarrito();
          break;
        case 'abrir-carrito':
          abrirCarrito();
          break;
        case 'cerrar-modal':
          cerrarModal();
          break;
        case 'modal-menos':
          cambiarCantidadModal(-1);
          break;
        case 'modal-mas':
          cambiarCantidadModal(1);
          break;
        case 'order-enviar':
          enviarPedido(state.pedidoModal);
          break;
        case 'order-copiar':
          if (state.pedidoModal) copiarTexto(mensajePedido(state.pedidoModal));
          break;
        case 'order-descargar':
          descargarPedido(state.pedidoModal);
          break;
        case 'order-pdf':
          imprimirPedido(state.pedidoModal);
          break;
        case 'nuevo-producto':
          abrirFormularioProducto();
          break;
        default:
          break;
      }
    });

    window.addEventListener('hashchange', () => aplicarVista(parseHash()));

    window.addEventListener('resize', () => {
      if (state.vista === 'catalogo') renderCarrito();
    });

    document.addEventListener('keydown', (evento) => {
      if (evento.key === 'Escape') {
        if (obtenerModalAbierto()) {
          cerrarModal();
          return;
        }
        if (!el.cartDrawer.hidden) {
          cerrarCarrito();
          return;
        }
      }

      if (evento.key === 'Tab') {
        const modal = obtenerModalAbierto();
        if (!modal) return;

        const enfocables = Array.from(
          modal.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((nodo) => nodo.offsetParent !== null);

        if (!enfocables.length) return;

        const primero = enfocables[0];
        const ultimo = enfocables[enfocables.length - 1];

        if (evento.shiftKey && document.activeElement === primero) {
          evento.preventDefault();
          ultimo.focus();
        } else if (!evento.shiftKey && document.activeElement === ultimo) {
          evento.preventDefault();
          primero.focus();
        }
      }

      if (evento.key === '/' && state.vista === 'catalogo') {
        const activo = document.activeElement;
        const escribiendo =
          activo &&
          (activo.tagName === 'INPUT' ||
            activo.tagName === 'TEXTAREA' ||
            activo.tagName === 'SELECT' ||
            activo.isContentEditable);
        if (!escribiendo) {
          evento.preventDefault();
          el.buscador.focus();
        }
      }
    });

    document.addEventListener(
      'error',
      (evento) => {
        const imagen = evento.target;
        if (!(imagen instanceof HTMLImageElement)) return;
        if (imagen.dataset.fallback && !imagen.dataset.fallbackAplicado) {
          imagen.dataset.fallbackAplicado = '1';
          imagen.src = imagen.dataset.fallback;
        }
      },
      true
    );

    window.addEventListener('offline', () => mostrarToast('Sin conexión. El catálogo sigue disponible.'));
    window.addEventListener('online', () => mostrarToast('Conexión restaurada.'));
  }

  function configurarInstalacion() {
    let promptDiferido = null;

    window.addEventListener('beforeinstallprompt', (evento) => {
      evento.preventDefault();
      promptDiferido = evento;
      if (el.btnInstalar) el.btnInstalar.hidden = false;
    });

    if (el.btnInstalar) {
      el.btnInstalar.addEventListener('click', async () => {
        if (!promptDiferido) {
          mostrarToast('Para instalar: abre el menú del navegador y elige "Agregar a pantalla de inicio".');
          return;
        }

        promptDiferido.prompt();
        await promptDiferido.userChoice;
        promptDiferido = null;
        el.btnInstalar.hidden = true;
      });
    }

    window.addEventListener('appinstalled', () => {
      if (el.btnInstalar) el.btnInstalar.hidden = true;
      mostrarToast('App instalada en el teléfono');
    });
  }

  function registrarServiceWorker() {
    const contextoPermitido =
      location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';

    if (!('serviceWorker' in navigator) || !contextoPermitido) return;

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((error) => {
        console.warn('Service worker no registrado:', error);
      });
    });
  }

  function inicializar() {
    cacheElementos();
    cargarProductos();

    state.modoVendedor = detectarModoVendedor();

    const carritoGuardado = leerJSON(CLAVES.carrito, []);
    const productosPorId = new Map(productosActivos.map((producto) => [producto.id, producto]));
    state.carrito = (Array.isArray(carritoGuardado) ? carritoGuardado : [])
      .filter((item) => item && item.id && Number(item.cantidad) > 0 && productosPorId.has(item.id))
      .map((item) => {
        const producto = productosPorId.get(item.id);
        const presentacion = normalizarPresentacion(item.presentacion || producto.unidad);
        return {
          id: item.id,
          presentacion,
          cantidad: Math.min(999, Math.max(1, Number(item.cantidad) || 1)),
        };
      })
      .filter((item) => precioPresentacion(productosPorId.get(item.id), item.presentacion) > 0);

    const pedidosGuardados = leerJSON(CLAVES.pedidos, []);
    state.pedidos = (Array.isArray(pedidosGuardados) ? pedidosGuardados : []).filter(
      (pedido) => pedido && pedido.numero
    );

    state.vendedor = localStorage.getItem(CLAVES.vendedor) || config.vendedorPorDefecto || '';

    document.title = `${config.nombreNegocio} · Catálogo de ventas`;
    el.brandNombre.textContent = config.nombreNegocio;
    el.brandEslogan.textContent = config.eslogan;
    el.footerNombre.textContent = config.nombreNegocio;
    el.orden.value = state.filtros.orden;
    if (el.btnRestaurarProductos) el.btnRestaurarProductos.hidden = !config.mostrarCatalogoEjemplo;

    renderTodo();
    configurarEventos();
    configurarInstalacion();
    registrarServiceWorker();
    iniciarNube();
    aplicarModoVendedor();
    aplicarVista(parseHash());

    if (modoVendedorNuevo) {
      mostrarToast('Este teléfono quedó en modo vendedor');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializar, { once: true });
  } else {
    inicializar();
  }
})();
