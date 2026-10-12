-- Fields some auction sites show (appraiser link, assessed value) and Street View metadata
alter table public.auctions add column appraiser_url text;
alter table public.auctions add column assessed_value numeric(14, 2);
-- Street View: { pano_id, date, status } from the free metadata call; the image itself is never stored
alter table public.photos add column meta jsonb;
