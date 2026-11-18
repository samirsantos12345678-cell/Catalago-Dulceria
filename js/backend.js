/* ============================================================
   SINCRONIZACIÓN EN LA NUBE (SUPABASE)
   Este archivo es opcional. Si js/config.js no tiene configurada
   una URL y una clave de Supabase, la app funciona como antes:
   todo se guarda solamente en este teléfono.

   No necesitas editar este archivo. Los datos de conexión van en
   js/config.js. Las instrucciones completas están en README.md.
   ============================================================ */

window.Backend = (() => {
  'use strict';

  const CONFIG = window.CONFIG || {};
  const urlBase = String(CONFIG.supabaseUrl || '')
    .trim()
    .replace(/\/+$/, '');
  const claveAnon = String(CONFIG.supabaseAnonKey || '').trim();
  const tabla = String(CONFIG.tablaProductos || 'productos').trim() || 'productos';
  const CLAVE_SESION = 'catalogo_sesion_v1';
  const configurado = Boolean(urlBase && claveAnon);

  let sesion = leerSesion();
  let refrescando = null;

  function leerSesion() {
    try {
      const crudo = localStorage.getItem(CLAVE_SESION);
      if (!crudo) return null;
      const datos = JSON.parse(crudo);
      if (!datos || !datos.access_token || !datos.refresh_token) return null;
      return datos;
    } catch (error) {
      return null;
    }
  }

  function guardarSesion(datos) {
    sesion = datos || null;
    try {
      if (sesion) {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
      } else {
        localStorage.removeItem(CLAVE_SESION);
      }
    } catch (error) {
      console.warn('No se pudo guardar la sesión en este teléfono', error);
    }
  }

  function normalizarSesion(datos, email) {
    const expiraEn = Number(datos && datos.expires_in) || 3600;
    return {
      access_token: datos.access_token,
      refresh_token: datos.refresh_token,
      expires_at: Date.now() + expiraEn * 1000,
      email:
        (datos.user && datos.user.email) ||
        String(email || '').trim() ||
        (sesion && sesion.email) ||
        '',
    };
  }

  function sesionActiva() {
    return Boolean(sesion && sesion.access_token && sesion.refresh_token);
  }

  function emailSesion() {
    return (sesion && sesion.email) || '';
  }

  function errorSesion() {
    const error = new Error('Tu sesión expiró. Vuelve a entrar como administrador.');
    error.codigo = 'sesion';
    return error;
  }

  function errorRed() {
    const error = new Error('No hay conexión con la nube. Revisa tu internet.');
    error.codigo = 'red';
    return error;
  }

  async function leerRespuesta(respuesta) {
    const texto = await respuesta.text();
    let datos = null;

    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch (error) {
        datos = texto;
      }
    }

    if (!respuesta.ok) {
      const mensaje =
        (datos &&
          (datos.message ||
            datos.error_description ||
            datos.msg ||
            datos.error ||
            datos.hint)) ||
        `Error ${respuesta.status}`;
      const error = new Error(String(mensaje));
      error.status = respuesta.status;
      error.datos = datos;
      if (respuesta.status === 401 || respuesta.status === 403) error.codigo = 'sesion';
      throw error;
    }

    return datos;
  }

  async function refrescarSesion() {
    if (!sesion || !sesion.refresh_token) throw errorSesion();
    if (refrescando) return refrescando;

    refrescando = (async () => {
      let respuesta;
      try {
        respuesta = await fetch(`${urlBase}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            apikey: claveAnon,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: sesion.refresh_token }),
        });
      } catch (error) {
        throw errorRed();
      }

      const datos = await leerRespuesta(respuesta);
      guardarSesion(normalizarSesion(datos));
      return sesion;
    })();

    try {
      return await refrescando;
    } finally {
      refrescando = null;
    }
  }

  async function tokenParaPeticion(requiereSesion) {
    if (requiereSesion) {
      if (!sesionActiva()) throw errorSesion();
      const margen = 60 * 1000;
      if (sesion.expires_at && Date.now() >= sesion.expires_at - margen) {
        await refrescarSesion();
      }
      if (!sesion || !sesion.access_token) throw errorSesion();
      return sesion.access_token;
    }

    if (!sesion) return claveAnon;

    const margen = 60 * 1000;
    if (sesion.expires_at && Date.now() >= sesion.expires_at - margen) {
      try {
        await refrescarSesion();
      } catch (error) {
        guardarSesion(null);
        return claveAnon;
      }
    }

    return (sesion && sesion.access_token) || claveAnon;
  }

  async function peticion(ruta, opciones = {}) {
    if (!configurado) throw new Error('La nube no está configurada.');

    const {
      metodo = 'GET',
      cuerpo = null,
      prefer = '',
      requiereSesion = false,
      reintentar = true,
    } = opciones;

    const token = await tokenParaPeticion(requiereSesion);
    const cabeceras = {
      apikey: claveAnon,
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };

    if (cuerpo != null) cabeceras['Content-Type'] = 'application/json';
    if (prefer) cabeceras.Prefer = prefer;

    let respuesta;
    try {
      respuesta = await fetch(`${urlBase}${ruta}`, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo == null ? undefined : JSON.stringify(cuerpo),
      });
    } catch (error) {
      throw errorRed();
    }

    if (respuesta.status === 401 && requiereSesion && reintentar) {
      try {
        await refrescarSesion();
      } catch (error) {
        guardarSesion(null);
        throw errorSesion();
      }
      return peticion(ruta, { ...opciones, reintentar: false });
    }

    return leerRespuesta(respuesta);
  }

  async function iniciarSesion(email, contrasena) {
    if (!configurado) throw new Error('La nube no está configurada.');

    let respuesta;
    try {
      respuesta = await fetch(`${urlBase}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: claveAnon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: String(email || '').trim(),
          password: String(contrasena || ''),
        }),
      });
    } catch (error) {
      throw errorRed();
    }

    let datos;
    try {
      datos = await leerRespuesta(respuesta);
    } catch (error) {
      const fallo = new Error('Correo o contraseña incorrectos.');
      fallo.codigo = 'credenciales';
      throw fallo;
    }

    guardarSesion(normalizarSesion(datos, email));
    return sesion;
  }

  async function cerrarSesion() {
    const token = sesion && sesion.access_token;
    guardarSesion(null);

    if (!configurado || !token) return;

    try {
      await fetch(`${urlBase}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: claveAnon,
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      // Si no hay internet, la sesión local ya quedó cerrada.
    }
  }

  function mapearProducto(producto) {
    return {
      id: String(producto.id || ''),
      nombre: String(producto.nombre || ''),
      categoria: String(producto.categoria || 'Sin categoría'),
      precio: Number(producto.precio) || 0,
      unidad: String(producto.unidad || 'unidad'),
      imagen: String(producto.imagen || ''),
      descripcion: String(producto.descripcion || ''),
      destacado: Boolean(producto.destacado),
      activo: producto.activo !== false,
      orden: Number(producto.orden) || 0,
      actualizado_en: new Date().toISOString(),
    };
  }

  async function listarProductos() {
    const datos = await peticion(`/rest/v1/${tabla}?select=*&order=id.asc`, {
      requiereSesion: false,
    });
    return Array.isArray(datos) ? datos : [];
  }

  async function guardarProducto(producto) {
    const datos = await peticion(`/rest/v1/${tabla}?on_conflict=id`, {
      metodo: 'POST',
      cuerpo: mapearProducto(producto),
      prefer: 'resolution=merge-duplicates,return=representation',
      requiereSesion: true,
    });
    return Array.isArray(datos) ? datos[0] : datos;
  }

  async function eliminarProducto(id) {
    await peticion(`/rest/v1/${tabla}?id=eq.${encodeURIComponent(id)}`, {
      metodo: 'DELETE',
      prefer: 'return=minimal',
      requiereSesion: true,
    });
  }

  async function reemplazarProductos(lista) {
    if (!Array.isArray(lista)) throw new Error('La lista de productos no es válida.');

    const productos = lista.map(mapearProducto);
    const existentes = await listarProductos();
    const idsNuevos = new Set(productos.map((producto) => producto.id));
    const sobran = existentes
      .filter((producto) => !idsNuevos.has(String(producto.id)))
      .map((producto) => String(producto.id));

    for (let i = 0; i < productos.length; i += 20) {
      const lote = productos.slice(i, i + 20);
      await peticion(`/rest/v1/${tabla}?on_conflict=id`, {
        metodo: 'POST',
        cuerpo: lote,
        prefer: 'resolution=merge-duplicates,return=minimal',
        requiereSesion: true,
      });
    }

    for (let i = 0; i < sobran.length; i += 50) {
      const lote = sobran.slice(i, i + 50);
      await peticion(
        `/rest/v1/${tabla}?id=in.(${lote.map((id) => encodeURIComponent(id)).join(',')})`,
        {
          metodo: 'DELETE',
          prefer: 'return=minimal',
          requiereSesion: true,
        }
      );
    }

    return productos.length;
  }

  return {
    configurado,
    iniciarSesion,
    cerrarSesion,
    sesionActiva,
    emailSesion,
    listarProductos,
    guardarProducto,
    eliminarProducto,
    reemplazarProductos,
  };
})();
