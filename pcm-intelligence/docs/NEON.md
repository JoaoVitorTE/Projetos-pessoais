# Conexão do backend ao Neon

O projeto usa Prisma 6 e mantém a autenticação local existente. Não habilita Neon Auth nem Data API.

- `DATABASE_URL`: conexão PostgreSQL com pool (`-pooler` no hostname), para consultas da aplicação.
- `DATABASE_URL_UNPOOLED`: conexão direta, sem `-pooler`, usada por `directUrl` no schema Prisma para migrations.
- Preserve os parâmetros TLS fornecidos pelo Neon nas duas URLs.
- Valores reais somente em `backend/.env` ignorado pelo Git, ou no gerenciador de segredos da hospedagem da API. Não existem credenciais reais neste documento ou no `.env.example`.

Para Compose local, as duas variáveis podem usar o mesmo endereço local de exemplo. Se já existe um `.env` antigo, adicione `DATABASE_URL_UNPOOLED` antes de aplicar migrations.

A configuração de conexão não aplica migrations nem carrega dados. `npm run db:generate` e `npm run build` geram tipos e compilam. Para preparar futuramente o banco de demonstração, revise o destino, aplique `npm run db:migrate` e execute `npm run db:seed` com `DATA_MODE=demo` e `SEED_PASSWORD` definida. Nunca execute os testes de seed sobre banco com dados reais.

A Vercel atual serve somente o frontend. Salvar as conexões neste ambiente não configura automaticamente os segredos de outra hospedagem, não publica a API e não habilita o login no site. Não coloque a URL do banco no frontend.

## Verificação desta configuração

As conexões reais foram salvas somente no arquivo local ignorado `backend/.env`. O build completo passou e o banco respondeu `SELECT 1` pela integração Neon. A conexão PostgreSQL direta a partir deste ambiente falhou com "Can't reach database server" na porta 5432, tanto com pool quanto sem pool. Portanto, a conectividade Prisma neste ambiente ainda não está validada; ela precisa ser testada a partir da hospedagem da API com acesso de rede ao Neon. Não foram aplicadas migrations nem executado seed no banco remoto.

## Publicação com API

A partir da versão com `api/index.ts`, a Vercel também executa a API. As variáveis reais precisam estar nos segredos de production; salvar o `.env` local não basta. Migrations e seed são executados separadamente, e sua execução não faz parte do build. A demonstração remota foi inicializada após validação em uma branch isolada; a documentação de validação registra os testes.
