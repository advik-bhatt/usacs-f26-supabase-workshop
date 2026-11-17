-- Quotes for every stock in one call: the best price someone is waiting to
-- buy at (bid) and the best price someone is waiting to sell at (ask).
--
-- The phone's simple mode uses this to say "costs about $42.10 right now"
-- (the ask: what a Buy 1 would pay) and "sells for about $41.80" (the bid).
-- Like order_book(), it reads everyone's orders but only returns prices.

create or replace function public.quotes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(s.symbol, jsonb_build_object(
    'bid', (select max(o.limit_cents) from public.orders o
            where o.symbol = s.symbol and o.side = 'buy' and o.status = 'open'),
    'ask', (select min(o.limit_cents) from public.orders o
            where o.symbol = s.symbol and o.side = 'sell' and o.status = 'open')
  )), '{}')
  from public.stocks s;
$$;

revoke execute on function public.quotes() from anon, public;
grant execute on function public.quotes() to authenticated;
