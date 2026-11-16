-- DASKIES in-app alerts (P2): one notification per thing a member needs to act on.
-- Alerts are written only by database triggers; members can read and mark their own, nothing else.
-- Run after 001_schema.sql and 002_deals.sql, in staging first, then production.

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('message','deal','listing','document','verification','review')),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 300),
  link text not null check (link ~ '^[a-z0-9_-]+\.html(\?[A-Za-z0-9=&_-]*)?(#[a-z]+)?$'),
  group_key text check (char_length(group_key) <= 80),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

-- Internal: write one alert. Repeated alerts on the same thread or deal replace the unread one,
-- so a busy conversation shows as one alert, not fifty. Keeps the newest 200 per member.
create or replace function public.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_group text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user is null then return; end if;
  if p_group is not null then
    delete from notifications where user_id = p_user and group_key = p_group and read_at is null;
  end if;
  insert into notifications (user_id, kind, title, body, link, group_key)
  values (p_user, p_kind, left(p_title, 200), left(p_body, 300), p_link, p_group);
  delete from notifications where user_id = p_user and id in (
    select id from notifications where user_id = p_user order by id desc offset 200);
end $$;
revoke all on function public.notify(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.notify_admins(p_kind text, p_title text, p_body text, p_link text, p_group text)
returns void language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  for a in select id from profiles where is_admin loop
    perform notify(a, p_kind, p_title, p_body, p_link, p_group);
  end loop;
end $$;
revoke all on function public.notify_admins(text, text, text, text, text) from public, anon, authenticated;

create or replace function public.biz_name(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from businesses where owner_id = p_user order by created_at limit 1), 'A member');
$$;
revoke all on function public.biz_name(uuid) from public, anon, authenticated;

-- Messages: tell the other side of the conversation.
create or replace function public.alert_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare c record; t text;
begin
  select cv.buyer_id, cv.seller_id, l.title into c
  from conversations cv join listings l on l.id = cv.listing_id where cv.id = new.conversation_id;
  if not found then return null; end if;
  t := biz_name(new.sender_id) || ' sent a message about ' || c.title;
  perform notify(case when new.sender_id = c.buyer_id then c.seller_id else c.buyer_id end,
    'message', t, left(new.body, 140), 'dashboard.html?c=' || new.conversation_id || '#messages', 'conv:' || new.conversation_id);
  return null;
end $$;
drop trigger if exists messages_alert on public.messages;
create trigger messages_alert after insert on public.messages for each row execute function public.alert_message();

-- Deals: tell every other party what just happened.
create or replace function public.alert_deal_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare d record; who text; t text; p uuid; stage_name text;
begin
  select id, title into d from deals where id = new.deal_id;
  who := biz_name(new.actor_id);
  stage_name := case new.detail->>'to'
    when 'discussion' then 'discussion' when 'due_diligence' then 'due diligence' when 'documentation' then 'documentation'
    when 'contract_signed' then 'contract signed' when 'settlement' then 'payment and settlement' when 'delivery' then 'delivery'
    else coalesce(new.detail->>'to', 'the next stage') end;
  t := case new.type
    when 'created' then who || ' opened a deal with you'
    when 'offer' then who || ' sent an offer'
    when 'counteroffer' then who || ' sent a counteroffer'
    when 'approved' then who || ' approved the terms'
    when 'rejected' then who || ' rejected the offer'
    when 'terms_agreed' then 'Every party approved. Terms agreed'
    when 'stage' then who || ' moved the deal to ' || stage_name
    when 'confirmed_completion' then who || ' confirmed completion'
    when 'completed' then 'Deal completed'
    when 'cancelled' then who || ' cancelled the deal'
    when 'note' then who || ' added a note'
    else who || ' updated the deal' end;
  for p in select user_id from deal_parties where deal_id = new.deal_id and user_id is distinct from new.actor_id loop
    perform notify(p, 'deal', t, d.title, 'deal.html?id=' || new.deal_id, 'deal:' || new.deal_id);
  end loop;
  return null;
end $$;
drop trigger if exists deal_events_alert on public.deal_events;
create trigger deal_events_alert after insert on public.deal_events for each row execute function public.alert_deal_event();

-- Listings: owners hear about review decisions; admins hear about the review queue.
create or replace function public.alert_listing() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'approved' then
      perform notify(new.owner_id, 'listing', 'Your listing is live: ' || new.title, null, 'listing.html?id=' || new.id, 'listing:' || new.id);
    elsif new.status = 'rejected' then
      perform notify(new.owner_id, 'listing', 'Your listing needs changes: ' || new.title, new.admin_note, 'post.html?id=' || new.id, 'listing:' || new.id);
    elsif new.status = 'closed' and old.status <> 'closed' and auth.uid() is distinct from new.owner_id then
      perform notify(new.owner_id, 'listing', 'DASKIES closed your listing: ' || new.title, new.admin_note, 'dashboard.html#listings', 'listing:' || new.id);
    end if;
  end if;
  if new.status = 'pending' and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
    select count(*) into n from listings where status = 'pending';
    perform notify_admins('review', n || case when n = 1 then ' listing is' else ' listings are' end || ' waiting for review',
      'Latest: ' || new.title, 'admin.html#queue', 'queue');
  end if;
  return null;
end $$;
drop trigger if exists listings_alert on public.listings;
create trigger listings_alert after insert or update on public.listings for each row execute function public.alert_listing();

-- Documents: owners hear the review result; admins hear about new uploads.
create or replace function public.alert_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if tg_op = 'INSERT' then
    select count(*) into n from documents where review_status = 'submitted';
    perform notify_admins('review', n || case when n = 1 then ' document is' else ' documents are' end || ' waiting for review',
      'Latest: ' || coalesce(new.file_name, replace(new.kind, '_', ' ')), 'admin.html#documents', 'docs');
  elsif new.review_status is distinct from old.review_status and new.review_status in ('reviewed','rejected') then
    perform notify(new.owner_id, 'document',
      case when new.review_status = 'reviewed' then 'Your document was reviewed: ' else 'Your document was not accepted: ' end || coalesce(new.file_name, replace(new.kind, '_', ' ')),
      case when new.review_status = 'rejected' then 'Upload a clearer or correct copy.' end, 'dashboard.html#documents', 'doc:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists documents_alert on public.documents;
create trigger documents_alert after insert or update on public.documents for each row execute function public.alert_document();

-- Verification level changes.
create or replace function public.alert_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verification_level is distinct from old.verification_level then
    perform notify(new.owner_id, 'verification', new.name || ' is now verification level ' || new.verification_level,
      'Levels show which checks DASKIES has done. They are not a guarantee.', 'dashboard.html#profile', 'verify:' || new.id);
  end if;
  return null;
end $$;
drop trigger if exists businesses_alert on public.businesses;
create trigger businesses_alert after update on public.businesses for each row execute function public.alert_verification();

-- Reports from members go to admins.
create or replace function public.alert_report() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from reports where status = 'open';
  perform notify_admins('review', n || case when n = 1 then ' open report' else ' open reports' end || ' on listings', left(new.reason, 140), 'admin.html#reports', 'reports');
  return null;
end $$;
drop trigger if exists reports_alert on public.reports;
create trigger reports_alert after insert on public.reports for each row execute function public.alert_report();

revoke all on function public.alert_message(), public.alert_deal_event(), public.alert_listing(), public.alert_document(),
  public.alert_verification(), public.alert_report() from public, anon, authenticated;

-- Members mark their own alerts read (all, or the ids given).
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
