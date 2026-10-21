# ObentōPet · Gestão (v2)

React + Vite + PWA, Supabase (Auth + RLS + Edge Functions). Funciona no celular e pode ser instalado na tela inicial.

## Rodar / publicar
```
npm install
cp .env.example .env     # preencha VITE_SUPABASE_URL e VITE_SUPABASE_KEY (chave pública/anon)
npm run dev              # desenvolvimento
npm test                 # testes das regras (entregas, rodadas A/B, produção…)
npm run build            # gera dist/ — publique no GitHub Pages (base /ObentoPet/)
node scripts/extract-logo.mjs <index.html antigo>   # extrai o logo real das etiquetas para public/label-logo.png
```

## Módulos
Hoje · Entregas (roteiro + PDF/WhatsApp) · Clientes (abas CLIENTE/PET) · Produtos (Estoque ASSINANTE/AVULSO/PETISCOS + Produção A/B) · Admin (usuários, avisos, etiquetas).
Perfis: **admin** (tudo + CPF/CNPJ), **operacional** (sem Admin/CPF), **portador** (só Hoje e Entregas).

## Ordem de virada
1. `npm run build` e publicar. 2. Criar seu usuário em Authentication > Users. 3. Rodar `supabase/cutover.sql` (liga RLS nas tabelas antigas — o app antigo para de funcionar, por isso só depois do novo no ar). 4. Desligar "Allow new users to sign up".
5. Edge Functions `bling-sync` e `daily-dispatch` (pasta `supabase/functions`) + secrets `MANYCHAT_API_KEY`, `CRON_SECRET`, `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`. 6. `supabase/schedule.sql`.

## ManyChat
Contatos precisam existir no ManyChat (só se pode escrever para quem já falou com a loja). O texto vai direto dentro da janela de 24h; fora dela, grava o campo `obentopet_msg` e dispara o fluxo (`flow_ns_*` em app_settings) que deve usar um template aprovado da Meta. Endpoints a validar com sua conta: `findBySystemField` (phone/whatsapp_phone) e `sendContent` WhatsApp.
