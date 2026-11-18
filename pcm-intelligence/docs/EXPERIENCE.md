# Experiência e treinamento — v0.5

Endereço principal: https://pcm-intelligence.vercel.app. O endereço anterior continua aceito durante a transição. As contas, senhas, históricos e registros são preservados.

## Navegação

O cabeçalho suspenso agrupa Visão geral, Operação, Gestão e Suporte. O botão de três linhas abre a navegação completa, com diálogo nativo, foco contido e fechamento por Escape. Os menus seguem o perfil autenticado. O ícone PCM volta ao Início; o sino abre Alertas; o menu da conta permite trocar senha e sair. O tema é salvo neste navegador.

O Início consulta `/api/home`: ordens abertas/atrasadas, planos vencidos e próximos de vencer, reservas abertas hoje, bloqueios e processos há mais de sete dias sem movimento. Todos os indicadores vêm do banco. Os alertas individuais abrem o registro com seu histórico. As datas da agenda seguem America/Sao_Paulo. Sem registros, os indicadores mostram zero e há orientações para configurar a operação.

A navegação usa fragmentos da URL, preservando Voltar/Avançar e atualização da página sem exigir novas regras de servidor. Identificadores da URL são tratados como dados; permissões continuam verificadas na API.

## Cadastros

- Setor: agrupa os equipamentos.
- Técnico: profissional ao qual podem ser atribuídas atividades; não cria automaticamente uma conta.
- Usuário: conta que recebe acesso, perfil e senha temporária.

O administrador cria usuários em três passos: identificação, permissões e conferência. O perfil Técnico exige um vínculo técnico. É possível selecionar um profissional existente ou criar seu cadastro junto com a conta, em uma única transação. Erros, inclusive e-mail duplicado, revertem os dois cadastros e sua auditoria. A senha aleatória é exibida uma vez e não vai para os logs; copiar exibe confirmação. Não há envio automático de e-mails ou cadastro público.

A listagem de contas inicia em Ativos e permite pesquisar nome/e-mail, situação e perfil. A desativação, a redefinição de senha, as proteções do administrador e a revogação de sessões continuam vigentes.

## Tutorial e PDF

Após a troca obrigatória da senha temporária, usuários sem preferência registrada recebem uma apresentação de seis etapas. Concluir ou escolher Fazer depois salva a versão no próprio usuário e audita a decisão. O botão X fecha apenas a apresentação atual. A primeira conclusão é preservada ao rever o tutorial.

Suporte → Central de ajuda permite rever a apresentação, pesquisar procedimentos por palavra/categoria e baixar o manual de treinamento (19 páginas na versão 0.6). O manual inclui perfis, procedimentos e exercícios e contém apenas orientações públicas, sem dados de contas ou registros operacionais.

Fonte única do treinamento: `training/guide.json`. Gere novamente o PDF com `npm run docs:build`; `npm run build` também o gera. Arquivo publicado: `/docs/manual-pcm-intelligence.pdf`. As fontes DejaVu redistribuídas estão em `training/fonts`, com licença; elas garantem os acentos e símbolos no PDF sem downloads durante a geração.

A logo original está em `/brand/pcm-logo-original.png`. Há favicon ICO/PNG, ícone Apple e manifesto com ícones de aplicativo. Favoritos já salvos podem exigir atualização do navegador para mostrar o novo ícone. A opção de adicionar à tela inicial depende do navegador; não há promessa de uso offline.

## Atualização e verificação

Aplicar a migration `202611180006_experience_and_onboarding` antes de publicar o código. Ela adiciona apenas dois campos de preferência ao usuário e não altera senhas. Não executar seed, limpeza ou reset na base operacional.

Configurar `FRONTEND_ORIGIN` com o novo endereço. `ADDITIONAL_FRONTEND_ORIGINS` aceita origens confiáveis exatas separadas por vírgula, permitindo a transição do endereço antigo sem liberar outros domínios. A API continua exigindo sessão e verificando origem nas escritas.

Validação local: build completo; 116 testes de integração com PostgreSQL isolado; fluxo de navegador em 16 áreas, em 1500 px e 390 px, criação de usuário+técnico, cópia de senha, primeiro acesso, persistência do tutorial, alertas com detalhe, voltar do navegador, pesquisa de ajuda, PDF e ícones. PDF conferido por leitura de texto e renderização. SAP automático continua reservado para uma etapa futura.
