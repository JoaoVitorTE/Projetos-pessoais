# PCM Intelligence — Fase 1

Fundação funcional de uma plataforma de manutenção industrial, com dados fictícios, autenticação e cinco perfis. Não possui integração com SAP/SKA nem envia comandos industriais. Dashboard operacional, CRUD de OS, calendário, terceiros, assistente, análises e importação continuam nas próximas fases.

## Execução local no Windows (PowerShell)

Pré-requisitos: Node.js 22 LTS, Docker Desktop com Linux containers e Git. No repositório, entre em `pcm-intelligence`.

```powershell
Copy-Item backend\.env.example backend\.env
```

Edite `backend\.env`: para Compose, mantenha as duas URLs locais do exemplo; preencha `SEED_PASSWORD` com uma senha de 12 caracteres ou mais (até 72 bytes). Nunca envie o arquivo ao GitHub.

```powershell
npm ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm run dev
```

Abra http://localhost:5173. Login: `admin@pcm.demo`, com a senha que você definiu. O primeiro acesso exige troca da senha. A troca encerra todas as sessões do usuário. Depois de entrar novamente, a opção **Minha senha** permite outra alteração. O seed não redefine senhas existentes; os demais perfis são criados com senhas aleatórias independentes e não há recuperação de senha nesta fase.

Para parar: Ctrl+C e `docker compose stop`. O volume do PostgreSQL é preservado.

## Vercel + Neon

A publicação agora inclui a interface e uma função Node que serve `/api/*` no mesmo domínio. As sessões e os limites de login ficam no PostgreSQL e persistem entre instâncias.

Na Vercel: Root Directory `pcm-intelligence`, Build Command `npm run build`, Output Directory `frontend/dist`, Install Command `npm ci`, Node 22. `vercel.json` configura a função e o build. O build nunca aplica migrations, não executa seed e não redefine senhas.

Configure no ambiente **production** da Vercel:

- `DATABASE_URL`: conexão Neon com pool.
- `DATABASE_URL_UNPOOLED`: conexão direta, para ferramentas Prisma.
- `DATA_MODE=demo`.
- `FRONTEND_ORIGIN`: URL HTTPS final, sem barra no fim.

Use variáveis sensíveis para as URLs. Nunca use prefixo `VITE_` para segredos. Prepare migrations/seed de forma controlada antes da publicação. A senha temporária é fornecida separadamente; não existe senha padrão embutida no código, nos builds ou nas variáveis da Vercel.

## Testes com banco separado

Os testes se recusam a rodar se o banco não terminar em `_test`. Não os execute contra o Neon principal.

```powershell
docker exec pcm-intelligence-postgres-1 createdb -U pcm pcm_release_test
Copy-Item backend\.env.test.example backend\.env.test
node --env-file=backend/.env.test node_modules/prisma/build/index.js migrate deploy --schema backend/prisma/schema.prisma
node --env-file=backend/.env.test --import tsx backend/prisma/seed.ts
npm test
```

Na primeira linha, substitua o nome do container se seu Compose usar outro nome (`docker compose ps`). `SEED_SHARED_TEST_PASSWORD=true` só tem efeito com `NODE_ENV=test`: permite testar os cinco perfis com a senha do arquivo de testes. Não use em produção.

Os testes cobrem login, autorização dos cinco perfis, auditoria, cookies, logout, expiração, contagens, senha obrigatória, alteração de senha, invalidação de sessões e limite persistente de tentativas.

## Estrutura

- `frontend/`: React, TypeScript, Vite, Lucide e CSS responsivo com temas claro/escuro.
- `backend/src/`: Express, Zod, bcrypt, sessões, autorização, auditoria e Prisma singleton.
- `api/index.ts`: entrada da função Vercel, reutilizando a API Express.
- `backend/prisma/`: schema, migrations versionadas, dados fictícios e seed idempotente.
- `backend/tests/`: integração com PostgreSQL real isolado.
- `docs/`: arquitetura, hospedagem, Neon e evidências de validação.

Dados: 30 equipamentos, 5 setores, 12 técnicos, 200 interrupções, 100 OS, 40 preventivas + 30 planos de lubrificação, 25 processos e 336 leituras de ar comprimido.
