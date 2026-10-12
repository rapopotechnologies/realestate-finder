-- Resolve a search area for the map: by layer + geoid, or (cities) by label like "Clermont, FL".
-- Returns label, bbox, centroid and the simplified outline to draw.
create or replace function public.get_area(p_layer text, p_geoid text default null, p_label text default null)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'layer', b.layer, 'geoid', b.geoid, 'name', b.name, 'label', b.label, 'state', b.state,
    'bbox', jsonb_build_array(st_xmin(b.geom_simplified), st_ymin(b.geom_simplified),
                              st_xmax(b.geom_simplified), st_ymax(b.geom_simplified)),
    'center', jsonb_build_array(st_x(b.centroid), st_y(b.centroid)),
    'geometry', st_asgeojson(b.geom_simplified, 5)::jsonb
  )
  from boundaries b
  where b.layer = p_layer
    and ((p_geoid is not null and b.geoid = p_geoid)
      or (p_geoid is null and p_label is not null
          and lower(regexp_replace(b.label, '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_label), '\s*,\s*', ', ', 'g'))))
  order by b.area_sq_mi desc nulls last
  limit 1;
$$;
revoke execute on function public.get_area(text, text, text) from public, anon;
grant execute on function public.get_area(text, text, text) to authenticated;
