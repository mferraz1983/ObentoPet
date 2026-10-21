-- ================================================================
-- VIRADA DE SEGURANÇA — rode SOMENTE quando o app novo (com login) já estiver no ar
-- e você tiver criado seu usuário admin. Antes disso, o app ANTIGO deixa de funcionar
-- (ele usa a chave pública sem login). Backup das tabelas: schema backup_20261021.
-- ================================================================

-- 0) Reimporta clientes -> tutores/pets (idempotente; pega o que mudou desde a 1ª migração)
select public.migrate_legacy_clients();

-- 1) Liga RLS nas tabelas antigas
alter table public.clients               enable row level security;
alter table public.delivery_deduction    enable row level security;
alter table public.delivery_reschedules  enable row level security;
alter table public.shelf_products        enable row level security;
alter table public.shelf_stock_log       enable row level security;
alter table public.snack_products        enable row level security;
alter table public.snack_stock_log       enable row level security;
alter table public.status_log            enable row level security;
alter table public.subscriber_stock      enable row level security;
alter table public.subscriber_stock_log  enable row level security;

-- 2) Equipe (admin + operacional): acesso total
do $$ declare t text; begin
  foreach t in array array['clients','delivery_deduction','delivery_reschedules','shelf_products','shelf_stock_log','snack_products','snack_stock_log','status_log','subscriber_stock','subscriber_stock_log','avulsa_orders'] loop
    execute format('drop policy if exists %I on public.%I', t||'_staff', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_staff())) with check ((select public.is_staff()))', t||'_staff', t);
  end loop;
end $$;

-- 3) Portador: só lê o necessário para entregar e marca "entregue"
do $$ declare t text; begin
  foreach t in array array['clients','delivery_reschedules','avulsa_orders','tutors','pets','status_log'] loop
    execute format('drop policy if exists %I on public.%I', t||'_portador_read', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.app_role()) = ''portador'')', t||'_portador_read', t);
  end loop;
end $$;
drop policy if exists status_log_portador_write on public.status_log;
create policy status_log_portador_write on public.status_log for insert to authenticated with check ((select public.app_role()) = 'portador');
drop policy if exists status_log_portador_upd on public.status_log;
create policy status_log_portador_upd on public.status_log for update to authenticated using ((select public.app_role()) = 'portador') with check ((select public.app_role()) = 'portador');

-- 4) Funções de saldo: nada de anon
revoke execute on function public.increment_subscriber_balance(text, integer) from anon, public;
revoke execute on function public.increment_shelf_balance(text, integer) from anon, public;
revoke execute on function public.increment_snack_balance(text, integer) from anon, public;
grant  execute on function public.increment_subscriber_balance(text, integer) to authenticated;
grant  execute on function public.increment_shelf_balance(text, integer) to authenticated;
grant  execute on function public.increment_snack_balance(text, integer) to authenticated;

-- 5) Seu usuário admin (crie antes em Authentication > Users e troque o e-mail abaixo)
-- insert into public.profiles (user_id, nome, role, ativo)
--   select id, 'Murilo', 'admin', true from auth.users where email = 'SEU_EMAIL' on conflict (user_id) do update set role='admin', ativo=true;

-- Depois: Authentication > Providers > Email > desligue "Allow new users to sign up".
