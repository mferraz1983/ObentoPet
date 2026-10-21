-- Agendamentos (horário de Brasília = UTC-3). Rode depois de: deploy da função daily-dispatch,
-- secrets MANYCHAT_API_KEY e CRON_SECRET criados, e extensões pg_cron/pg_net instaladas.
-- create extension if not exists pg_cron; create extension if not exists pg_net;
-- Guarde o segredo no Vault:  select vault.create_secret('SEU_CRON_SECRET','cron_secret');

select cron.schedule('obentopet-portadores', '0 10 * * *',  $$select net.http_post('https://jyrujdfwdwkwynolpbni.supabase.co/functions/v1/daily-dispatch', jsonb_build_object('kind','couriers'),   headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')))$$);  -- 07:00
select cron.schedule('obentopet-clientes',   '0 20 * * *',  $$select net.http_post('https://jyrujdfwdwkwynolpbni.supabase.co/functions/v1/daily-dispatch', jsonb_build_object('kind','customers'), headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')))$$);  -- 17:00 (aviso de amanhã)
select cron.schedule('obentopet-producao',   '0 17 * * 5',  $$select net.http_post('https://jyrujdfwdwkwynolpbni.supabase.co/functions/v1/daily-dispatch', jsonb_build_object('kind','production'),headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')))$$);  -- sexta 14:00
