# Validação da Fase 1

Executada em 16/11/2026, Node.js 24.22.1, PostgreSQL 16 em Docker. O ambiente exigiu execução com permissão ampliada para instalar pacotes, acessar o daemon Docker, binários Prisma e sockets locais. As verificações foram executadas, não simuladas.

- Instalação das dependências e lockfile npm gerado.
- PostgreSQL iniciado com healthcheck saudável.
- Prisma Client gerado, migration SQL inicial aplicada com `prisma migrate deploy`.
- Seed executado duas vezes: volumes permaneceram 30 equipamentos, 5 setores, 12 técnicos, 200 interrupções, 100 ordens, 40 planos preventivos, 30 de lubrificação, 25 terceiros, 336 leituras.
- `npm run build`: TypeScript backend/frontend e build Vite aprovados.
- `npm test`: 15 testes de integração com PostgreSQL real, incluindo matriz dos cinco perfis, credenciais inválidas, validação, sessão expirada, logout, origem externa, auditoria e contagens.
- `npm run dev`: frontend e backend iniciados. HTTP 200 para frontend, saúde da API e saúde via proxy Vite. Login e consulta autenticada através do proxy retornaram 200; logout executado.

Não foi realizada inspeção visual automatizada em navegador, teste de carga ou validação em Windows neste ambiente Linux. As instruções PowerShell estão no README. O MVP completo ainda não atende aos 12 critérios globais: esta entrega corresponde à fundação. CRUD operacional, dashboard com indicadores, calendário, fluxo de terceiros, análise de recorrência, assistente e importação permanecem para as fases seguintes.

## Arquivos principais

- Raiz: package.json, package-lock.json, .gitignore, docker-compose.yml, README.md.
- Frontend: package.json, tsconfig.json, vite.config.ts, index.html, src/main.tsx, src/styles.css.
- Backend: package.json, tsconfig.json, .env.example, src/app.ts, src/server.ts.
- Banco: prisma/schema.prisma, prisma/seed.ts, prisma/migrations/migration_lock.toml, prisma/migrations/202611160001_foundation/migration.sql.
- Testes: backend/tests/auth.test.ts.
- Documentação: docs/ARCHITECTURE.md, docs/VALIDATION.md, analytics/README.md, sample-data/README.md.

backend/.env foi criado somente no ambiente local, com senha aleatória de demonstração, e está ignorado pelo Git. Nenhuma senha pessoal ou dado industrial real foi utilizado. A senha do ambiente pode ser consultada localmente nesse arquivo; não foi publicada nos logs.

## Atualização de 17/11/2026 — publicação funcional

A versão de código `7ea1f7c4e7a66877c095dec0f950612d6fd13336` foi publicada em production na Vercel e testada no domínio `https://projetos-pessoais-pcm-intelligence.vercel.app`.

- Build completo aprovado: backend, entrada da função Node e frontend.
- 23 testes de integração aprovados em PostgreSQL local isolado, com troca obrigatória de senha, invalidação de todas as sessões e limite de login persistente.
- Migrations e seed testados na branch Neon `pcm-validation` e aplicados ao banco principal. A tabela `_prisma_migrations` registra os checksums dos arquivos versionados; nenhum seed é executado durante builds.
- Endpoint de saúde publicado retornou HTTP 200, `database=connected` e `dataMode=demo`.
- Login do administrador publicado aprovado; cookies Secure, HTTP-only e SameSite Strict; respostas de sessão sem cache. A senha temporária do administrador foi preservada para a entrega.
- Chromium real percorreu: formulário de login, exigência de senha nova, bloqueio de dados antes da troca, alteração, novo login, consulta das contagens, autorização do planejador, opção Minha senha e logout com invalidação.
- Capturas desktop e mobile 390×844 foram inspecionadas. Sem overflow horizontal e sem erro JavaScript durante o fluxo.
- Conta usada na verificação restaurada e sessões encerradas após o teste. Não foram usados dados industriais reais.

Contagens publicadas: 30 equipamentos, 5 setores, 12 técnicos, 200 interrupções, 100 OS, 40 preventivas, 30 lubrificações, 25 processos de terceiros e 336 leituras. Os módulos operacionais ainda estão indicados como futuros; esta publicação não representa a conclusão das cinco fases do projeto.

A validação remota encontrou e corrigiu incompatibilidade CommonJS/ES Modules e roteamento de URLs aninhadas da API. A versão final usa `type=module` na raiz e encaminhamento explícito `/api/:path*` para a função `api/index.ts`.

## Fase 2 — 17/11/2026

A Fase 2 adiciona seis módulos operacionais descritos em PHASE2.md. Build aprovado; 50 testes passaram com PostgreSQL real isolado. Chromium percorreu gravações, edições, histórico, CSV, calendário, execução de plano e fluxo de terceiros com checklist e nove movimentações; os seis módulos foram conferidos em largura de 390 px, sem overflow horizontal e sem erros JavaScript. Gráficos foram conferidos renderizados em desktop e celular.

As migrations são aditivas: vínculo de técnico, versões, histórico de OS, metadados de execução/documentos e aceitação de solicitações sem data de execução inventada. Não removem registros nem alteram hashes de senha. A aplicação no Neon principal é precedida de validação na branch pcm-validation; o seed não é reexecutado em produção.
