# Privacidade e segurança do PCM Intelligence

## Acesso e dados

O Express valida a sessão no servidor e aplica permissões por rota e por registro. A administração de contas exige perfil administrador. Um administrador só pode editar, redefinir a senha ou remover contas de níveis inferiores, além de atualizar os dados da própria conta. Técnicos só alteram ordens atribuídas a eles e dentro das transições permitidas. Planejadores só consultam e operam seus próprios lotes de importação. Gestores e administradores podem consultar e operar lotes de outros usuários.

O site pede o aceite dos termos e a ciência da política na tela de acesso. A versão enviada pelo site é registrada na auditoria de um login bem-sucedido. O cookie de sessão é essencial. O tema fica no armazenamento local. Antes de adotar os textos como política oficial, a organização deve preencher o responsável pelo tratamento, seu canal de privacidade e os prazos de retenção aplicáveis.

Os uploads de importação têm formatos e tamanhos limitados. Envie somente as colunas necessárias. O código usa Prisma com consultas parametrizadas, valida esquemas no servidor e renderiza texto do usuário como texto no React. Cabeçalhos de segurança são configurados na Vercel, e a plataforma redireciona HTTP para HTTPS.

## Banco e publicação

- O frontend usa a API Express no mesmo domínio. As credenciais PostgreSQL ficam no servidor. O sistema não usa uma chave pública de banco nem precisa habilitar a Data API.
- A migração de RLS habilita a proteção nas tabelas da aplicação. O proprietário das tabelas mantém o acesso necessário à aplicação. Uma conexão com outro papel precisa de concessões e políticas explícitas. O RLS desta migração bloqueia acesso direto por papéis comuns e a API continua responsável pela autorização dos usuários.
- Valide a migração em uma branch Neon isolada com os papéis de execução e de migração realmente usados. Confira a identidade do projeto Neon ligado à produção, a janela de recuperação e a possibilidade de restauração em branch antes de aplicar a migração. Backups com retenção independente precisam de configuração e teste no projeto correto.
- Configure `PCM_IMPORT_ENCRYPTION_KEY` como variável sensível no servidor, com 32 bytes aleatórios em hexadecimal, antes de publicar em ambientes operacionais. Guarde uma cópia segura com acesso separado. A mesma chave deve permanecer disponível até concluir ou expirar lotes cifrados que a utilizem. A falta da chave bloqueia novas importações operacionais. As prévias e cargas de processamento de novas importações são cifradas com AES-256-GCM. Lotes legados continuam legíveis e são descartados segundo o fluxo existente. Isso não cifra os demais campos operacionais a nível de aplicativo.
- Preserve TLS nas URLs fornecidas pelo Neon. Migrações são executadas separadamente com a conexão direta. Não execute o seed na base operacional.

## Dependências e segredos

Use `npm audit` e revise mudanças de versão principal antes de atualizar dependências com alterações incompatíveis. Se uma credencial real for encontrada no histórico, revogue e substitua esse valor primeiro. Trate eventual reescrita de histórico como uma operação coordenada com colaboradores.
