-- DASKIES error-reporting test: anyone can add a report, only admins can read, flood cap holds. Cleans up after itself.
create temp table if not exists rt (n serial, step text, result text);
truncate rt;
grant all on rt to authenticated, anon;
grant usage on sequence rt_n_seq to authenticated, anon;

do $$
declare
  a uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); n int; u uuid; before int;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at) values
   (a,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','err-a@test.invalid','{"full_name":"Err A"}',now(),now()),
   (adm,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','err-adm@test.invalid','{"full_name":"Err Admin"}',now(),now());
  update public.profiles set is_admin = true where id = adm;
  select count(*) into before from public.client_errors;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  insert into public.client_errors (page, message, ref) values ('/explore.html', 'errtest visitor', 'TESTV1');
  begin
    select count(*) into n from public.client_errors;
    insert into rt(step, result) values ('visitors cannot read reports', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  exception when others then insert into rt(step, result) values ('visitors cannot read reports', 'PASS');
  end;
  perform set_config('role', 'none', true);
  select count(*) into n from public.client_errors where message = 'errtest visitor' and user_id is null;
  insert into rt(step, result) values ('a visitor can add a report', case when n = 1 then 'PASS' else 'FAIL ' || n end);

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  insert into public.client_errors (page, message, ref) values ('/dashboard.html', 'errtest member', 'TESTM1');
  select count(*) into n from public.client_errors;
  insert into rt(step, result) values ('members cannot read reports', case when n = 0 then 'PASS' else 'FAIL ' || n end);
  begin
    insert into public.client_errors (page, message, user_id) values ('/x', 'errtest spoof', adm);
    insert into rt(step, result) values ('reporter cannot be set by the browser', 'FAIL');
  exception when others then insert into rt(step, result) values ('reporter cannot be set by the browser', 'PASS');
  end;
  begin
    delete from public.client_errors;
    insert into rt(step, result) values ('members cannot delete reports', 'FAIL');
  exception when others then insert into rt(step, result) values ('members cannot delete reports', 'PASS');
  end;
  perform set_config('role', 'none', true);
  select user_id into u from public.client_errors where message = 'errtest member';
  insert into rt(step, result) values ('member reports are stamped with who saw them', case when u = a then 'PASS' else 'FAIL' end);

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.client_errors where message like 'errtest %';
  insert into rt(step, result) values ('admins can read reports', case when n = 2 then 'PASS' else 'FAIL ' || n end);
  perform set_config('role', 'none', true);

  -- flood cap: at most 300 reports in 10 minutes
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  for n in 1..320 loop insert into public.client_errors (page, message) values ('/flood', 'errtest flood'); end loop;
  perform set_config('role', 'none', true);
  select count(*) into n from public.client_errors where created_at > now() - interval '10 minutes';
  insert into rt(step, result) values ('flood is capped at 300 per 10 minutes', case when n <= 300 then 'PASS' else 'FAIL ' || n end);

  delete from public.client_errors where message like 'errtest %';
  delete from auth.users where id in (a, adm);
  select count(*) into n from public.client_errors where message like 'errtest %';
  insert into rt(step, result) values ('test data cleaned up', case when n = 0 then 'PASS' else 'FAIL ' || n end);
end $$;

select count(*) filter (where result like 'PASS%') as passed, count(*) as total, string_agg(case when result not like 'PASS%' then step || ': ' || result end, ' | ') as failures from rt;
