-- Sales history for the detail page (NAL carries the last two sales; appraiser pages may carry more)
create table public.property_sales (
  id bigint generated always as identity primary key,
  property_id uuid not null references public.properties (id) on delete cascade,
  sale_date date,
  price numeric(14, 2),
  instrument text,
  qualified boolean,
  book_page text,
  source text not null,
  unique (property_id, sale_date, price)
);
create index property_sales_property_idx on public.property_sales (property_id, sale_date desc);
alter table public.property_sales enable row level security;
create policy "signed-in read" on public.property_sales for select to authenticated using (true);
revoke all on public.property_sales from anon;
