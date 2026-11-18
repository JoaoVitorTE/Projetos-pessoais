# PCM Intelligence — Equipamentos e listas de tarefas (v0.6)

MVP operacional de manutenção industrial com frontend React, API Express/Prisma, PostgreSQL Neon, autenticação e cinco perfis. Opera com cadastros locais e arquivos exportados autorizados; mantém modo de demonstração separado. Sem conexão direta SAP/SKA e sem comandos industriais.

Disponível: dashboard calculado; equipamentos; interrupções e recorrência de motivos; OS internas com histórico e exportação CSV; preventivas/lubrificação com calendário e conclusão; terceiros com checklist configurável, etapas, histórico e rascunho para revisão humana. A senha e os registros da Fase 1 são preservados nas atualizações.

Disponível nesta versão: importação CSV/XLSX com prévia, mapeamento, repetidos, atualização, conflitos e reversão; relatório preventivo PDF/Excel; Assistente PCM estruturado; alertas de prazo; cadastros de usuários/técnicos/setores e auditoria pesquisável. Consulte [uso diário, permissões e limites](docs/IMPORTS-AND-CONTROL.md) e [regras operacionais](docs/PHASE2.md). Nova etapa: [Agenda inteligente](docs/SCHEDULING.md), com visões semanal/mensal, jornadas e ausências configuráveis, conflitos, execução por etapas e propostas explicáveis para revisão humana. Sincronização SAP automática, ar comprimido na interface, análises estatísticas avançadas e modelos preditivos continuam futuros.

Nova experiência: página inicial com alertas e atalhos, cabeçalho suspenso por seções, menu hambúrguer, logo e ícones, cadastro guiado de usuários e tutorial persistido por conta. Consulte [experiência e treinamento](docs/EXPERIENCE.md) e o [manual em PDF](frontend/public/docs/manual-pcm-intelligence.pdf). Endereço principal: https://pcm-intelligence.vercel.app. A mesma senha de cada conta continua válida.

Nova versão: TAG obrigatória por setor, número opcional, exclusão/restauração com histórico e importação conjunta de preventivas, lubrificação e tarefas. Consulte [identificação e importação de tarefas](docs/EQUIPMENT-AND-TASKS.md).

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

Abra http://localhost:5173. Login: `admin@pcm.demo`, com a senha que você definiu. O primeiro acesso exige troca da senha. A troca encerra todas as sessões do usuário. Depois de entrar novamente, a opção **Minha senha** permite outra alteração. O seed não redefine senhas existentes; os demais perfis são criados com senhas aleatórias independentes e podem ter o acesso ativado e a senha redefinida pelo administrador em Cadastros e acessos.

Para parar: Ctrl+C e `docker compose stop`. O volume do PostgreSQL é preservado.

## Vercel + Neon

A publicação agora inclui a interface e uma função Node que serve `/api/*` no mesmo domínio. As sessões e os limites de login ficam no PostgreSQL e persistem entre instâncias.

Na Vercel: Root Directory `pcm-intelligence`, Build Command `npm run build`, Output Directory `frontend/dist`, Install Command `npm ci`, Node 22. `vercel.json` configura a função e o build. O build nunca aplica migrations, não executa seed e não redefine senhas.

Configure no ambiente **production** da Vercel:

- `DATABASE_URL`: conexão Neon com pool.
- `DATABASE_URL_UNPOOLED`: conexão direta, para ferramentas Prisma.
- `DATA_MODE=operational` para a base limpa de operação; `demo` somente em ambiente fictício.
- `FRONTEND_ORIGIN`: URL HTTPS final, sem barra no fim (`https://pcm-intelligence.vercel.app`).
- `ADDITIONAL_FRONTEND_ORIGINS`: opcional; outras origens confiáveis exatas, separadas por vírgula, durante a transição de domínio.

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

Os 138 testes cobrem agenda, jornadas, conflitos simultâneos, execução parcial/final, permissões e sincronização com OS/planos/importação, além de importação CSV/XLSX e repetidos, atualizações, conflitos/reversão, referências criadas, administração, assistente, PDF/Excel, além de fluxos operacionais, permissões, histórico, concorrência, calendário, conferência documental, indicadores e login, autorização dos cinco perfis, auditoria, cookies, logout, expiração, contagens, senha obrigatória, alteração de senha, invalidação de sessões e limite persistente de tentativas.

## Estrutura

- `frontend/`: React, TypeScript, Vite, Lucide e CSS responsivo com temas claro/escuro.
- `backend/src/`: Express, Zod, bcrypt, sessões, autorização, auditoria e Prisma singleton.
- `api/index.ts`: entrada da função Vercel, reutilizando a API Express.
- `backend/prisma/`: schema, migrations versionadas, dados fictícios e seed idempotente.
- `backend/tests/`: integração com PostgreSQL real isolado.
- `docs/`: arquitetura, hospedagem, Neon e evidências de validação.

O seed é opcional para demonstração, somente com `DATA_MODE=demo`. Não roda no build e não deve ser executado na base limpa. Dados do seed: 30 equipamentos, 5 setores, 12 técnicos, 200 interrupções, 100 OS, 40 preventivas + 30 planos de lubrificação, 25 processos e 336 leituras de ar comprimido.
