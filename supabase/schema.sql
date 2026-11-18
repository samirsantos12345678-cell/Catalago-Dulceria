-- ============================================================
-- CATÁLOGO DE VENTAS · TABLA DE PRODUCTOS EN SUPABASE
-- Ejecuta todo este archivo en Supabase > SQL Editor > New query.
-- ============================================================

create table if not exists public.productos (
  id text primary key,
  nombre text not null,
  categoria text not null default 'Sin categoría',
  precio numeric(12, 2) not null default 0,
  unidad text not null default 'unidad',
  imagen text not null default '',
  descripcion text not null default '',
  destacado boolean not null default false,
  activo boolean not null default true,
  orden bigint not null default 0,
  actualizado_en timestamptz not null default now()
);

create index if not exists productos_categoria_idx
  on public.productos (categoria);

-- Seguridad a nivel de fila (RLS)
alter table public.productos enable row level security;

-- Todos pueden LEER el catálogo (vendedores y clientes).
drop policy if exists "productos_lectura_publica" on public.productos;
create policy "productos_lectura_publica"
  on public.productos
  for select
  using (true);

-- Solamente un usuario autenticado puede CREAR, EDITAR o BORRAR.
-- El administrador entra con correo y contraseña desde la app.
drop policy if exists "productos_escritura_admin" on public.productos;
create policy "productos_escritura_admin"
  on public.productos
  for all
  to authenticated
  using (true)
  with check (true);

-- Permisos para los roles de la API de Supabase.
grant select on public.productos to anon;
grant select, insert, update, delete on public.productos to authenticated;
