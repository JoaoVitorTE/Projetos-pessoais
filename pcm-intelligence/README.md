# PCM Intelligence

Plataforma local de demonstração para planejamento e controle de manutenção industrial. **Fase 1 implementada; validação e limitações em docs/VALIDATION.md.** Nenhuma integração SKA/SAP, envio externo de dados, comando industrial ou API paga.

## Windows — execução exata (PowerShell)

Pré-requisitos: Node.js 22 LTS ou 24 LTS, Docker Desktop com Linux containers e Docker Compose. Abra o Docker Desktop e aguarde iniciar.

```powershell
cd C:\caminho\pcm-intelligence
Copy-Item backend\.env.example backend\.env
```

Edite `backend\.env` e preencha `SEED_PASSWORD` com uma senha local de pelo menos 12 caracteres. Não compartilhe esse arquivo. As credenciais do PostgreSQL no exemplo são exclusivamente para desenvolvimento local; se alterar `POSTGRES_PASSWORD`, ajuste também `DATABASE_URL`.

```powershell
npm ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run build
npm test
npm run dev
```

Abra **http://localhost:5173**. API: http://localhost:3001/api/health. Login: `admin@pcm.demo` com a senha configurada. Outros perfis: `manager@pcm.demo`, `planner@pcm.demo`, `technician@pcm.demo` e `viewer@pcm.demo`, usando a mesma senha inicial da demonstração. O seed não altera usuários ou registros existentes; mudar SEED_PASSWORD não redefine senhas. Não há recuperação de senha nesta fase.

Para encerrar, Ctrl+C no terminal; `docker compose stop` pausa o banco preservando dados. Para reiniciar: `docker compose up -d --wait` e `npm run dev`. As portas 5432, 3001 e 5173 precisam estar disponíveis. O navegador deve usar localhost para coincidir com FRONTEND_ORIGIN. Não use o comando de desenvolvimento para exposição pública.

## Estrutura e escopo

- `frontend/`: React + TypeScript + Vite, CSS responsivo, temas claro/escuro, login e contagens da fundação; consulta usuários e auditoria conforme perfil.
- `backend/`: Express + TypeScript, Prisma/PostgreSQL, validação Zod, bcrypt custo 12, sessões opacas de 8 horas (somente hash no banco), cookie HTTP-only, limite de login, Helmet, verificação de Origin e logs Pino.
- `backend/prisma/`: modelo, migration SQL versionada e seed idempotente com IDs estáveis. Sem exclusão de dados no seed.
- `backend/tests/`: testes de integração usando o PostgreSQL de demonstração. Nunca apontar para banco real. Os testes geram sessões e auditoria.
- `docs/`: arquitetura, permissões, validação e próximos passos.
- `analytics/`, `sample-data/`: reservados; nenhum importador ou análise habilitado ainda.

A interface exibe contagens reais do banco fictício, **não indicadores operacionais de dashboard**. OEE, MTTR, MTBF, CRUD de OS, calendário, terceiros, alertas, assistente, relatórios e importadores são funcionalidades futuras. Não há botões operacionais decorativos.

Comandos: `npm run build` verifica TypeScript e gera os builds; `npm test` roda integração; `npm run db:migrate` aplica migrations; `npm run db:seed` carrega a demonstração. Não execute seed/testes sobre dados reais. `DATA_MODE` aceita apenas `demo` nesta versão.

A API de produção pode ser iniciada com `npm run start -w backend` depois do build, mas uma implantação exige HTTPS, reverse proxy, frontend servido no mesmo domínio, backup, revisão de segurança e gestão de segredos. Nenhuma implantação de produção foi realizada.

## Build na Vercel

Para publicar a interface, use Root Directory `pcm-intelligence`; o `vercel.json` configura `npm run build:frontend` e saída `frontend/dist`. API e PostgreSQL precisam de hospedagem própria: consulte [GitHub e hospedagem](docs/GITHUB-E-HOSPEDAGEM.md). O build completo gera automaticamente o Prisma Client antes do TypeScript.
