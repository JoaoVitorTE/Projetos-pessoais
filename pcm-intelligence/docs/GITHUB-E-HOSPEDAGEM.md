# GitHub e hospedagem

O aplicativo fica na pasta `pcm-intelligence` do repositório `JoaoVitorTE/Projetos-pessoais`. Nenhum segredo deve ser versionado. `.env`, configurações de agente, `.vercel`, dependências e builds estão ignorados.

## Vercel

- Root Directory: `pcm-intelligence`.
- Build Command: `npm run build`.
- Output Directory: `frontend/dist`.
- Install Command: `npm ci`.
- Node.js: 22.

A função `api/[...path].ts` exporta a aplicação Express. Todas as chamadas do frontend usam `/api` no mesmo domínio, sem dependência de proxy de desenvolvimento. O Prisma Client é gerado antes do TypeScript. O build não aplica migrations nem seed.

Defina em production `DATA_MODE=demo`, `FRONTEND_ORIGIN` e as conexões `DATABASE_URL` e `DATABASE_URL_UNPOOLED` como segredos sensíveis. As duas URLs são do mesmo banco; a primeira tem pool e a segunda é direta. Migrations devem ser aplicadas separadamente. Nenhum segredo recebe prefixo `VITE_`.

Os cookies são HTTP-only, SameSite Strict e Secure em produção. As origens aceitas são a URL configurada e os domínios exatos fornecidos pela Vercel nas variáveis de sistema; não se confia no cabeçalho Host enviado pelo cliente.

O login exige troca da senha temporária antes de consultar dados. A troca encerra todas as sessões. Reimplantar ou reexecutar o seed não redefine a senha já alterada. O limite de login usa PostgreSQL, não a memória da função.

A configuração de Deployment Protection da Vercel é independente do login PCM. Quando a plataforma exigir autenticação, o proprietário deverá autorizar o acesso à publicação. Não altere proteções de outros projetos.

A Fase 1 é uma demonstração, sem integrações industriais ou serviços pagos obrigatórios. Limites gratuitos e eventual cobrança dependem das contas e dos provedores. Os módulos operacionais permanecem sinalizados como futuros.
