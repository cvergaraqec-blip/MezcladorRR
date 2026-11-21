create table public.repositorio (
  id text primary key,
  tipo text not null check (tipo in ('rutina', 'cancion')),
  nombre text not null,
  estilo text,
  bpm integer,
  duracion_seg integer,
  datos jsonb not null,
  creditos jsonb not null default '[]'::jsonb,
  creado_at timestamptz not null default now(),
  exportado_at timestamptz not null default now()
);
comment on table public.repositorio is 'Rutinas y canciones libres exportadas desde el Mezclador RadioRun. La app solo lee; se escribe con la función repositorio (clave de exportación).';
create index repositorio_tipo_idx on public.repositorio (tipo, exportado_at desc);
alter table public.repositorio enable row level security;
create policy "La app puede leer el repositorio" on public.repositorio for select to anon, authenticated using (true);
