-- Trigger-only functions should never be callable over the API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.properties_spatial_join() from public, anon, authenticated;
revoke execute on function public.log_auction_status() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
