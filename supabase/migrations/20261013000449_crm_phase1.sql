-- CRM, phase 1: My List becomes a deal pipeline.

-- Stages gain Under contract and Closed; each deal gets a strategy and a follow-up date
alter table public.saved_properties drop constraint saved_properties_status_check;
alter table public.saved_properties add constraint saved_properties_status_check
  check (status in ('interested', 'contacted', 'offer_made', 'under_contract', 'closed', 'passed'));
alter table public.saved_properties
  add column strategy text not null default 'undecided'
    check (strategy in ('undecided', 'wholesale', 'flip', 'brrrr', 'rental')),
  add column next_follow_up date;

-- Offers and contact attempts on a deal, one timeline (notes stay in public.notes)
create table public.deal_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('offer', 'call', 'text', 'email', 'letter', 'visit')),
  occurred_at timestamptz not null default now(),
  -- contact attempts
  outcome text check (outcome in ('reached', 'no_answer', 'voicemail', 'wrong_number', 'not_interested', 'interested', 'sent')),
  -- offers
  offer_amount numeric(14, 2) check (offer_amount is null or offer_amount >= 0),
  offer_to text check (offer_to in ('owner', 'agent', 'auction', 'other')),
  offer_terms text check (length(offer_terms) <= 2000),
  offer_response text check (offer_response in ('pending', 'countered', 'rejected', 'accepted', 'withdrawn')),
  counter_amount numeric(14, 2) check (counter_amount is null or counter_amount >= 0),
  body text check (length(body) <= 10000),
  created_at timestamptz not null default now(),
  check (kind <> 'offer' or offer_amount is not null)
);
create index deal_events_user_property_idx on public.deal_events (user_id, property_id, occurred_at desc);

alter table public.deal_events enable row level security;
create policy "own deal events" on public.deal_events for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.deal_events from anon;
