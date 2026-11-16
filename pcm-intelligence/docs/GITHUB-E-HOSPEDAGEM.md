# Enviar ao GitHub e hospedar

## Subir pelo navegador

1. Extraia o ZIP. Nunca envie o arquivo ZIP como substituto dos arquivos do projeto.
2. Crie um repositório no GitHub; comece com visibilidade privada.
3. Abra o repositório, escolha Add file → Upload files e arraste o conteúdo da pasta pcm-intelligence, preservando as subpastas. O package.json da raiz deve aparecer na raiz do repositório.
4. Confirme o envio em Commit changes. Confira que nenhum arquivo .env, node_modules ou dist foi incluído. O .env.example é apenas um modelo local e pode ser versionado.

Pelo Git, em um computador com Git instalado, dentro da pasta extraída:

```powershell
git init
git add .
git commit -m "Implementa fundação do PCM Intelligence"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/pcm-intelligence.git
git push -u origin main
```

Substitua SEU-USUARIO e crie antes um repositório vazio no GitHub. Não existem credenciais do GitHub no projeto. Nunca adicione backend/.env ao Git.

## Vercel: limites desta versão

A Vercel pode servir o build estático do frontend React. Isso, sozinho, não disponibiliza o sistema: o proxy /api no vite.config.ts existe apenas no desenvolvimento. A API atual é um processo Express persistente com PostgreSQL, e não foi adaptada para funções Vercel. O Docker Compose não roda na Vercel.

Não importe este repositório esperando que login e banco funcionem automaticamente. Sem API e banco implantados, a interface pode carregar, mas o login não funcionará.

Para uma implantação completa, será necessário:

- Banco PostgreSQL hospedado, migrations aplicadas e seed fictício executado uma vez.
- Hospedagem da API Node com HTTPS, conexão com banco, gestão de variáveis e adaptação do endereço de escuta ao provedor (o servidor atual escuta em 127.0.0.1).
- Frontend na Vercel com encaminhamento /api para a API hospedada, preservando cookies e cabeçalhos.
- FRONTEND_ORIGIN com a URL HTTPS final, NODE_ENV=production e DATA_MODE=demo no backend. DATABASE_URL e demais segredos somente no provedor da API.
- Teste completo de login/logout, cookies, permissões, proxy e conexão com banco após a implantação.

Não existe configuração de publicação automática neste pacote. Contas, limites gratuitos e eventual cobrança dependem dos provedores; nenhuma hospedagem foi criada ou contratada.

Os dados incluídos são fictícios. Para apresentação, use credenciais próprias da demonstração. Não use nome, logotipo, dados ou credenciais reais de uma empresa sem autorização. Este pacote não contém dados reais nem integrações com SAP ou SKA.
