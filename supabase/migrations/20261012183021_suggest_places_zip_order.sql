-- ZIP suggestions in numeric order (area ranking applies to cities and counties only)
create or replace function public.suggest_places(q text)
returns table (
  layer text,
  geoid text,
  label text,
  state text,
  lat double precision,
  lng double precision,
  bbox double precision[]
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with term as (select lower(trim(q)) as t)
  select b.layer, b.geoid, b.label, b.state,
         st_y(b.centroid), st_x(b.centroid),
         array[st_xmin(b.geom_simplified), st_ymin(b.geom_simplified),
               st_xmax(b.geom_simplified), st_ymax(b.geom_simplified)]
  from boundaries b, term
  where length(term.t) >= 2
    and (
      (term.t ~ '^\d+$' and b.layer = 'zcta' and b.geoid like term.t || '%')
      or (term.t !~ '^\d+$' and b.layer <> 'zcta' and (
            lower(b.label) like term.t || '%'
         or lower(b.label) like '% ' || term.t || '%'
         or term.t <% lower(b.label)))
    )
  order by
    (lower(b.label) like term.t || '%') desc,
    (b.layer = 'county') desc,
    case when b.layer <> 'zcta' and lower(b.label) like term.t || '%' then b.area_sq_mi end desc nulls last,
    word_similarity(term.t, lower(b.label)) desc,
    b.geoid
  limit 10;
$$;
revoke execute on function public.suggest_places(text) from public, anon;
grant execute on function public.suggest_places(text) to authenticated;
