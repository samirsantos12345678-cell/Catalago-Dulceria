/* ============================================================
   CONFIGURACIÓN DEL CATÁLOGO
   Cambia estos datos antes de publicar. No necesitas tocar app.js.
   ============================================================ */

window.CONFIG = {
  // Nombre del negocio y frase que aparece en la cabecera.
  nombreNegocio: 'Mi Negocio',
  eslogan: 'Catálogo de ventas',

  // Número de WhatsApp que recibe los pedidos (bodega o encargado).
  // Formato: código de país + número, SIN +, SIN espacios y SIN guiones.
  // Ejemplo para Perú: '51987654321'. Para México: '5215512345678'.
  numeroWhatsApp: '51999999999',

  // 'numero'  -> abre WhatsApp directo al número de arriba.
  // 'compartir' -> abre el menú de compartir para elegir contacto o grupo.
  // Si dejas el número de ejemplo, la app usará el menú de compartir.
  modoEnvio: 'numero',

  // Moneda y formato. Lempira hondureño (HNL).
  simboloMoneda: 'L',
  locale: 'es-HN',

  // Vendedor que aparece por defecto en el formulario.
  vendedorPorDefecto: '',

  // Prefijo del número de pedido. Ejemplo: PED-20261111-001
  prefijoPedido: 'PED',

  // Cuántos productos se muestran antes de pulsar "Mostrar más".
  productosPorPagina: 30,

  // Muestra el botón "Restaurar catálogo de ejemplo".
  // En esta versión en blanco se deja en false.
  mostrarCatalogoEjemplo: false,

  // ---------- SINCRONIZACIÓN EN LA NUBE (OPCIONAL) ----------
  // Con estos datos, los productos que cree el administrador aparecen
  // automáticamente en los teléfonos de todos los vendedores.
  //
  // Cómo obtenerlos: crea un proyecto gratis en https://supabase.com
  // y copia la URL y la clave "anon public" desde Project Settings > API.
  // Las instrucciones completas están en README.md.
  //
  // Si dejas estos campos vacíos, la app funciona como antes:
  // el catálogo se guarda solamente en cada teléfono.
  supabaseUrl: 'https://ccafjibpvemjiqfivqrt.supabase.co',
  supabaseAnonKey: 'sb_publishable_EqFX91WZgNAEbfBf6rjslQ_2aWRtrIH',

  // Nombre de la tabla donde se guardan los productos.
  tablaProductos: 'productos',

  // Cada cuántos segundos los vendedores buscan cambios en la nube.
  // Mínimo recomendado: 30 segundos.
  sincronizacionSegundos: 30,

  // Versión visible en la app (opcional).
  version: '1.0.0',
};
