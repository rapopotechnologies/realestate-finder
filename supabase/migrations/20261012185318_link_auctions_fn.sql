-- Point auctions at their property row (matched on county + normalized parcel ID). Scraper only.
create or replace function public.link_auctions_to_properties(p_county_fips text default null)
returns integer
language sql
security invoker
set search_path = public
as $$
  with upd as (
    update auctions a
       set property_id = p.id
      from properties p
     where p.source_key = 'parcel:' || a.county_fips || ':' || a.parcel_id_norm
       and a.parcel_id_norm is not null
       and (p_county_fips is null or a.county_fips = p_county_fips)
       and a.property_id is distinct from p.id
    returning 1
  )
  select count(*)::int from upd;
$$;
revoke execute on function public.link_auctions_to_properties(text) from public, anon, authenticated;
grant execute on function public.link_auctions_to_properties(text) to service_role;
