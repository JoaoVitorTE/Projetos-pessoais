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
