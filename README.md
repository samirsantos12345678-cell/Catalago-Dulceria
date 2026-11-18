# Catálogo de ventas con pedidos por WhatsApp

Catálogo web para que un vendedor muestre productos con fotos desde su teléfono, arme un pedido y lo envíe por WhatsApp a la bodega. Funciona sin servidor propio y se puede instalar como app (PWA). Opcionalmente usa **Supabase** (gratis) para que los productos creados por el administrador aparezcan en todos los teléfonos.

Cada producto puede venderse por **unidad, media docena, docena o caja**, con un precio distinto para cada presentación.

---

## 1. Inicio rápido en Windows

1. Abre la carpeta `catalogo-ventas`.
2. Haz doble clic en `iniciar.bat`.
3. Se abrirá el navegador en `http://localhost:8080`.

También puedes ejecutar manualmente:

```bash
node servidor.js
```

> No abras `index.html` con doble clic si quieres probar la instalación como app y el modo sin conexión. Para eso necesitas el servidor local o un hosting con HTTPS.

---

## 2. Configurar el negocio y WhatsApp

Edita `js/config.js`:

```js
window.CONFIG = {
  nombreNegocio: 'Mi Negocio',
  eslogan: 'Catálogo de ventas',

  // Código de país + número, sin +, sin espacios y sin guiones.
  // Perú: 51987654321 / México: 5215512345678
  numeroWhatsApp: '51987654321',

  // 'numero'    -> abre WhatsApp directo al número de bodega.
  // 'compartir' -> abre el menú para elegir contacto o grupo.
  modoEnvio: 'numero',

  simboloMoneda: 'L',
  locale: 'es-HN',
  vendedorPorDefecto: 'Juan Pérez',
  prefijoPedido: 'PED',
  productosPorPagina: 24,
};
```

### Número de WhatsApp

- Debe llevar **código de país**. Ejemplo Perú: `51` + `987654321` = `51987654321`.
- Si usas un **grupo** de WhatsApp, `wa.me` no puede apuntar a grupos. Cambia a `modoEnvio: 'compartir'`; el vendedor elegirá el grupo desde el menú de compartir.
- Si dejas el número de ejemplo `51999999999`, la app mostrará un aviso y usará el menú de compartir.

---

## 3. Crear y editar productos

Puedes hacerlo de dos formas: desde la app o editando el archivo.

### Desde la app (recomendado para el día a día)

1. Abre la pestaña **Productos** (en el teléfono es el icono de caja).
2. Pulsa **Nuevo producto**.
3. Completa nombre y categoría. En **Se vende por** elige la presentación principal (unidad, media docena, docena o caja) y escribe su precio.
4. Si también vendes el producto en otras presentaciones, escribe sus precios en la misma sección. Las que dejes vacías no aparecen en el catálogo.
5. Pulsa **Tomar o elegir foto** para usar la cámara o la galería. La app reduce la foto automáticamente para que no ocupe demasiado.
6. Pulsa **Guardar producto**.

Cada producto tiene botones para **editar** y **eliminar**. Si configuraste la nube, la app pide entrar como administrador y los cambios se comparten con todos los teléfonos. Sin nube, se guardan solo en el navegador de ese teléfono.

En la parte inferior de **Mis productos** tienes:

- **Exportar productos**: descarga un respaldo `.json` con todos tus productos y fotos.
- **Importar productos**: carga ese respaldo en otro teléfono o después de borrar datos.

> Sin nube, los productos creados desde la app viven solo en ese teléfono. El catálogo publicado muestra los productos del archivo `js/productos.js`. Para compartirlos entre varios teléfonos, activa la nube en la sección 4. También puedes usar **Exportar productos** para conservar una copia.

### Editando el archivo (para el catálogo publicado)

Esta versión **no trae productos de ejemplo**: `js/productos.js` está vacío a propósito. El catálogo se llena desde la app, en la pestaña **Productos**.

Edita `js/productos.js`. Cada producto es una línea:

```js
{
  id: 'P001',
  nombre: 'Chocolate en barra 100 g',
  categoria: 'Chocolates y bombones',
  precio: 6.90,
  unidad: 'unidad',
  precios: { unidad: 6.90, 'media-docena': 38.00, docena: 72.00, caja: 260.00 },
  imagen: '',
  destacado: true
}
```

- `id`: debe ser único. No lo repitas.
- `categoria`: si escribes una categoría nueva, aparece automáticamente en los filtros.
- `precio`: solo número, sin símbolo de moneda. Es el precio de la presentación principal.
- `unidad`: presentación principal. Solo estos valores: `unidad`, `media-docena`, `docena` o `caja`.
- `precios`: opcional. Precio de cada presentación que vendes. Si falta una, esa presentación no se ofrece. Debe incluir el precio de la presentación principal.
- `destacado`: `true` para que aparezca primero.
- `activo`: pon `false` para ocultar un producto sin borrarlo.
- `descripcion`: opcional. Si no la pones, la app usa una descripción por categoría.

Si un producto solo se vende de una forma, puedes omitir `precios`:

```js
{ id: 'P002', nombre: 'Paleta de coco', categoria: 'Paletas', precio: 5.00, unidad: 'unidad' }
```

Para ocultar un producto:

```js
{ id: 'P001', nombre: 'Chocolate en barra 100 g', categoria: 'Chocolates y bombones', precio: 6.90, unidad: 'unidad', imagen: '', activo: false }
```

---

## 4. Compartir productos entre teléfonos (nube opcional)

Esta es la forma de que el administrador cree o cambie un producto desde su teléfono o PC y **todos los vendedores vean los mismos productos**. Se usa Supabase, que tiene un plan gratis y no pide tarjeta.

### 4.1 Crear el proyecto en Supabase

1. Entra a `https://supabase.com` y crea una cuenta.
2. Pulsa **New project**. Elige un nombre, una contraseña para la base de datos y la región más cercana (por ejemplo, East US).
3. Espera a que el proyecto termine de crearse.

### 4.2 Crear la tabla y la seguridad

1. En Supabase, abre **SQL Editor**.
2. Pulsa **New query**.
3. Copia todo el contenido del archivo `supabase/schema.sql` y pégalo.
4. Pulsa **Run**.
5. Debe aparecer "Success". Eso crea la tabla `productos` y las reglas de seguridad: todos pueden leer, pero solo un administrador con sesión puede crear, editar o borrar.

> **¿Ya tenías la tabla creada?** El archivo `supabase/schema.sql` incluye al final la línea que agrega la columna de precios por presentación. Ejecuta solo esto en **SQL Editor** y pulsa **Run**:
>
> ```sql
> alter table public.productos
>   add column if not exists precios jsonb not null default '{}'::jsonb;
> ```
>
> Sin esa columna la app sigue guardando los productos, pero los precios de las presentaciones no se sincronizan con los demás teléfonos.

### 4.3 Crear el usuario administrador

1. En Supabase, abre **Authentication > Users**.
2. Pulsa **Add user > Create new user**.
3. Escribe el correo y la contraseña del administrador. Marca **Auto Confirm User**.
4. Guarda esos datos. No los compartas con los vendedores.

> **Importante:** en **Authentication > Providers > Email**, desactiva **Enable sign ups** (o **Allow new users to sign up**). Así nadie puede crearse una cuenta y modificar el catálogo. El administrador se crea manualmente desde el panel de Supabase.

### 4.4 Conectar la app

1. En Supabase, abre **Project Settings > API**.
2. Copia **Project URL** y la clave **anon public**.
3. Edita `js/config.js`:

```js
supabaseUrl: 'https://TU-PROYECTO.supabase.co',
supabaseAnonKey: 'TU-CLAVE-ANON-PUBLIC',
tablaProductos: 'productos',
sincronizacionSegundos: 30,
```

4. Vuelve a publicar la carpeta en Netlify o recarga el servidor local.

> La clave `anon public` es pública y se puede usar en el navegador. La seguridad la dan las reglas RLS y el inicio de sesión. **Nunca** pongas la clave `service_role` en el proyecto.

### 4.5 Subir el catálogo la primera vez

1. Abre la app y entra a **Mis productos**.
2. Pulsa **Entrar** y usa el correo y la contraseña del administrador.
3. Si la nube está vacía, pulsa **Subir catálogo a la nube**.
4. Confirma. Se suben los productos que tengas en ese teléfono.
5. Abre la app en otro teléfono con el mismo enlace. En unos segundos aparecerán los productos.

Desde ese momento:

- Los cambios del administrador se guardan en la nube.
- Los vendedores reciben los cambios automáticamente cada 30 segundos, o al volver a abrir la app.
- Si un vendedor está sin internet, sigue viendo el último catálogo guardado en su teléfono.
- El botón **Sincronizar** fuerza una actualización inmediata.
- **Salir** cierra la sesión de administrador en ese teléfono.

### 4.6 Cosas importantes

- Solo el administrador necesita correo y contraseña. Los vendedores no.
- Si olvidas la contraseña, se cambia desde Supabase > Authentication > Users.
- El plan gratis de Supabase incluye 500 MB de base de datos. Las fotos se guardan comprimidas; para 100–200 productos suele ser suficiente.
- Supabase pausa los proyectos gratis después de varios días sin uso. Si la app deja de sincronizar, entra al panel de Supabase y reactívalo.
- Sin nube, la app sigue funcionando como antes, solo en cada teléfono.

---

## 5. Fotos de productos

### Fotos tomadas desde la app

Al crear o editar un producto, pulsa **Tomar o elegir foto**. La app:

- Abre la cámara o la galería del teléfono.
- Recorta y reduce la imagen a un máximo de 700 px.
- La guarda comprimida dentro del mismo teléfono.

No necesitas copiar archivos ni cambiar rutas. Si el teléfono se queda sin espacio, la app te avisa: elimina productos o usa fotos más pequeñas.

### Fotos desde archivos

1. Guarda las fotos en `img/productos/`.
2. Usa nombres cortos y sin espacios: `chocolate-barra.jpg`.
3. En el producto cambia:

```js
imagen: 'img/productos/chocolate-barra.jpg'
```

Recomendaciones:

- Formato WebP o JPG.
- Unos 800 x 800 px.
- Entre 80 y 200 KB por foto.
- Fondo limpio y foto cuadrada.

Si una foto no existe o falla, la app muestra un diseño con las iniciales del producto. El catálogo no se rompe.

---

## 6. Cómo se envía el pedido

1. El vendedor abre un producto, elige la presentación (unidad, media docena, docena o caja) y la cantidad.
2. Pulsa **Agregar al carrito**. Puede repetir el mismo producto en otra presentación; aparecerán como líneas separadas.
3. Pulsa **Continuar con el pedido**.
4. Completa cliente, teléfono, dirección, fecha de entrega, pago y observaciones.
5. Pulsa **Generar pedido y enviar por WhatsApp**.
6. Se guarda una copia en el teléfono y se abre WhatsApp con el mensaje listo.
7. El vendedor revisa y pulsa **Enviar** en WhatsApp.

El pedido se guarda con un número como `PED-20261111-001`. El contador es por teléfono; si usas varios vendedores, cada uno tendrá su propia numeración.

### Guardar el pedido en PDF

En la pantalla de éxito, en el historial o dentro del detalle del pedido, pulsa **PDF** / **Guardar PDF**. Se abrirá el menú de impresión del teléfono o la computadora:

- Elige **Guardar como PDF** (o **Imprimir → Guardar como PDF**).
- El PDF incluye el nombre del negocio, los datos del cliente, la foto de cada producto, cantidades, precios y total.
- No necesita internet ni librerías externas: usa el generador de PDF del propio navegador.

### Si el pedido es muy largo

WhatsApp y el navegador tienen límites para los enlaces. Si el pedido tiene muchos productos:

- Usa **Compartir** para enviar el texto desde el menú del teléfono.
- Usa **Guardar PDF** y envía el archivo adjunto.
- Usa **Descargar .txt** y comparte el archivo.

---

## 7. Historial y respaldos

En la pestaña **Pedidos**:

- **Ver**: detalle completo del pedido.
- **Reenviar**: vuelve a abrir WhatsApp con el mensaje.
- **Copiar**: copia el pedido al portapapeles.
- **.txt**: descarga el pedido como archivo de texto.
- **PDF**: abre el menú para guardar el pedido con fotos y detalles.
- **Respaldo**: descarga un JSON con todos los pedidos.
- **CSV**: descarga una planilla para Excel o Google Sheets.

Los pedidos viven en el `localStorage` del teléfono. Si borras los datos del navegador, pierdes el historial. Descarga un respaldo cada cierto tiempo.

---

## 8. Probar en el teléfono

### Opción A: mismo Wi-Fi

1. En la computadora ejecuta `node servidor.js`.
2. Averigua la IP local de la computadora:

```bash
ipconfig
```

3. En el teléfono abre `http://IP-DE-LA-COMPUTADORA:8080`.
4. El teléfono y la computadora deben estar en la misma red.

### Opción B: publicarlo gratis

La opción más fácil es **Netlify Drop**:

1. Entra a `https://app.netlify.com/drop`.
2. Arrastra la carpeta `catalogo-ventas` completa.
3. Netlify te da un enlace `https://algo.netlify.app`.
4. Comparte ese enlace con el vendedor.
5. Para actualizar, vuelve a arrastrar la carpeta.

También funciona con GitHub Pages, Vercel o Cloudflare Pages.

> Todo lo que está en la carpeta será público. No pongas precios de costo, claves ni datos privados en `productos.js` o `config.js`.

---

## 9. Instalar como app en el teléfono

- **Android (Chrome):** abre el enlace, menú de tres puntos → **Instalar aplicación** o **Agregar a pantalla de inicio**.
- **iPhone (Safari):** abre el enlace, botón Compartir → **Agregar a pantalla de inicio**.

La app necesita HTTPS para instalarse y funcionar sin conexión. Netlify, GitHub Pages y Vercel lo dan gratis.

Los iconos actuales (`icons/icon-192.png` y `icons/icon-512.png`) son genéricos. Para usar el logo del negocio, reemplázalos por dos PNG cuadrados de 192 x 192 px y 512 x 512 px con el mismo nombre.

---

## 10. Actualizar el catálogo publicado

Si cambias productos, precios o diseño:

1. Vuelve a subir la carpeta a Netlify Drop, o haz el cambio en tu hosting.
2. Si no ves los cambios, abre `sw.js` y sube el número:

```js
const CACHE_VERSION = 'catalogo-v2';
```

3. Recarga la página. En el teléfono puede tardar un poco por el modo sin conexión.

---

## 11. Límites de esta versión

- El pedido **no se envía solo**: el vendedor revisa y pulsa enviar en WhatsApp. Esto es intencional.
- No hay stock compartido ni pedidos centralizados. Cada teléfono guarda su historial.
- Sin nube, los productos creados desde la app se guardan solo en ese teléfono. Con la nube activa, se comparten con todos los vendedores.
- El catálogo y los precios son visibles para cualquiera que tenga el enlace. Solo el administrador puede modificarlos con correo y contraseña.
- El número de pedido es por teléfono, no global.
- Para stock en tiempo real o envío automático de WhatsApp se necesita más desarrollo (inventario y la API de WhatsApp Business).

---

## 12. Estructura de archivos

```text
catalogo-ventas/
├── index.html          Pantalla principal
├── css/styles.css      Diseño
├── js/config.js        Datos del negocio, WhatsApp y Supabase
├── js/productos.js     Catálogo de productos inicial
├── js/backend.js       Conexión opcional con Supabase
├── js/app.js           Lógica del carrito y pedidos
├── supabase/schema.sql Tabla y reglas de seguridad para Supabase
├── sw.js               Modo sin conexión
├── manifest.json       Configuración de la app instalable
├── icons/              Iconos de la app
├── img/productos/      Fotos de productos
├── servidor.js         Servidor local para probar
├── iniciar.bat         Atajo para Windows
└── README.md           Esta guía
```

---

## 13. Problemas comunes

**No se ve el número de WhatsApp de bodega**
Revisa `js/config.js` y que el número tenga código de país, sin `+`, sin espacios y sin guiones.

**WhatsApp no abre**
Prueba con `modoEnvio: 'compartir'`. En iPhone, el menú de compartir es la forma más confiable para elegir contacto o grupo.

**No cambian los productos**
Sube `CACHE_VERSION` en `sw.js` y recarga. También prueba en una pestaña privada.

**Las fotos no cargan**
Revisa que la ruta sea exacta: `img/productos/nombre.jpg`. Respeta mayúsculas y minúsculas. Si la foto la tomaste desde la app, edita el producto y vuelve a seleccionarla.

**No aparecen los productos que creé en otro teléfono**
Si la nube está configurada, espera 30 segundos o pulsa **Sincronizar**. Revisa que los dos teléfonos abran el mismo enlace y que `js/config.js` tenga la misma `supabaseUrl`. Si no usas nube, exporta el respaldo `.json` en un teléfono e impórtalo en el otro.

**No puedo entrar como administrador**
Revisa el correo y la contraseña creados en Supabase > Authentication > Users. Si la cuenta no está confirmada, edítala y marca **Auto Confirm User**. Si olvidaste la contraseña, cámbiala desde el panel de Supabase.

**La nube está vacía o no sube el catálogo**
Entra como administrador y pulsa **Subir catálogo a la nube**. Si sigue fallando, revisa que hayas ejecutado `supabase/schema.sql` completo y que la clave sea la **anon public**, no la `service_role`.

**La sincronización dejó de funcionar después de unos días**
El plan gratis de Supabase pausa los proyectos inactivos. Entra a `supabase.com`, abre el proyecto y reactívalo.

**No aparecen los cambios del administrador**
Pulsa **Sincronizar** en el teléfono del vendedor. Si acabas de publicar una versión nueva, sube `CACHE_VERSION` en `sw.js` y recarga.

**Se perdieron los pedidos**
El historial está en el navegador del teléfono. Si se borraron los datos del navegador o se cambió de teléfono, no se pueden recuperar salvo que tengas un respaldo JSON/CSV.

**El formulario no deja continuar**
Completa los campos marcados con `*` y usa una fecha de entrega de hoy en adelante.

---

## 14. Siguiente paso recomendado

Prueba el catálogo con el administrador y con al menos un vendedor. Verifica que un producto creado en el teléfono del administrador aparezca en el teléfono del vendedor. Después anota qué falta: stock, pedidos centralizados, varios administradores, etc.
