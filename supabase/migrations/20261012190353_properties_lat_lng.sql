-- Plain lat/lng next to the PostGIS point, for clients that don't speak WKB
alter table public.properties
  add column lat double precision generated always as (extensions.st_y(location::extensions.geometry)) stored,
  add column lng double precision generated always as (extensions.st_x(location::extensions.geometry)) stored;
