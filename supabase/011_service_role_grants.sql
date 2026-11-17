-- DASKIES 011: table access for the server-side functions (pay-order, pay-verify, pay-webhook, send-invoice).
-- Newer Supabase projects no longer give the service role table access by default, so the
-- Edge Functions could not record a payment ("permission denied for table payments").
-- Only the server holds the service role key; browsers (anon, authenticated) are unchanged.
-- Safe to run more than once.

grant select, insert, update on public.payments to service_role;
grant select, update on public.invoices to service_role;
grant select on public.profiles to service_role;
grant select on public.businesses to service_role;
grant select on public.deal_fees to service_role;
grant select on public.invoice_settings to service_role;
