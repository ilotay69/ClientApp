-- Personal workbench state. Planning never changes a task/ticket deadline.
create table if not exists public.my_todo_workspaces (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(preferences) = 'object' and octet_length(preferences::text) <= 32768)
);
create table if not exists public.my_todo_item_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_key text not null check (length(item_key) between 1 and 1200),
  planned_on date,
  position integer not null default 0 check (position between -1000000 and 1000000),
  snoozed_until date,
  primary key (user_id, item_key)
);
create table if not exists public.my_todo_mail_tasks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id text not null,
  task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (user_id, conversation_id)
);
alter table public.my_todo_workspaces enable row level security;
alter table public.my_todo_item_state enable row level security;
alter table public.my_todo_mail_tasks enable row level security;
grant select,insert,update,delete on public.my_todo_workspaces,public.my_todo_item_state to authenticated;
grant select on public.my_todo_mail_tasks to authenticated;
create policy "my_todo_workspaces own staff" on public.my_todo_workspaces for all to authenticated using (auth.uid()=user_id and public.is_staff()) with check (auth.uid()=user_id and public.is_staff());
create policy "my_todo_item_state own staff" on public.my_todo_item_state for all to authenticated using (auth.uid()=user_id and public.is_staff()) with check (auth.uid()=user_id and public.is_staff());
create policy "my_todo_mail_tasks own staff" on public.my_todo_mail_tasks for select to authenticated using (auth.uid()=user_id and public.is_staff());
create trigger my_todo_workspaces_updated before update on public.my_todo_workspaces for each row execute procedure public.set_updated_at();

-- Transactional deduplication: concurrent clicks from two tabs produce one
-- private task. Never copies message content into a shared task. The auth id
-- is taken from the session, not from a function argument.
create or replace function public.create_my_todo_mail_task(p_conversation text, p_message text, p_title text, p_detail text, p_priority text, p_due date, p_client uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_task uuid;
begin
  if v_user is null or not public.is_staff() then raise exception 'Not authorized'; end if;
  if length(p_conversation) not between 1 and 1000 or length(p_message) not between 1 and 1000 or length(trim(p_title)) not between 1 and 240 or length(coalesce(p_detail,'')) > 10000 or p_priority not in ('high','medium','low') then raise exception 'Invalid task'; end if;
  if not exists(select 1 from public.mailbox_snapshot_messages where user_id=v_user and conversation_id=p_conversation and graph_message_id=p_message) then raise exception 'Message no longer available'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_conversation,0));
  select task_id into v_task from public.my_todo_mail_tasks where user_id=v_user and conversation_id=p_conversation;
  if v_task is not null then return v_task; end if;
  insert into public.tasks(title,detail,priority,due_date,client_id,is_personal,kind,status,created_by)
  values(trim(p_title),nullif(trim(p_detail),''),p_priority::public.task_priority,p_due,p_client,true,'general','open',v_user) returning id into v_task;
  insert into public.my_todo_mail_tasks(user_id,conversation_id,task_id) values(v_user,p_conversation,v_task);
  return v_task;
end;
$$;
revoke all on function public.create_my_todo_mail_task(text,text,text,text,text,date,uuid) from public,anon;
grant execute on function public.create_my_todo_mail_task(text,text,text,text,text,date,uuid) to authenticated;
