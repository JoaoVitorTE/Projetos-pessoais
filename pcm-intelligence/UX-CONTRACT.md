# Contrato de interface

O PCM atende equipes de manutenção industrial em português do Brasil. As regras operacionais e os perfis estão documentados em [Fase 2](docs/PHASE2.md), [Agenda](docs/SCHEDULING.md) e [Cadastros de equipamentos](docs/EQUIPMENT-AND-TASKS.md). As datas e horas seguem os formatos da tela e o fuso definido para cada consulta.

| Capacidade | Componente ou fonte | Comportamento |
|---|---|---|
| Navegação | `Navigation` e `useNavigation` | Grupos respondem ao mouse, teclado e toque. A rota identifica o módulo ativo. |
| Diálogos | `Modal` em `OperationalUI` | título identificável, fechamento por teclado e aviso visível quando a operação falha |
| Listas | `useResource`, `State`, `Empty` e controles nativos | carregamento, erro, lista vazia e filtros usam os componentes existentes |
| Cadastros | APIs Express e diálogos de cada módulo | permissões e regras de vínculo são aplicadas no servidor e comunicadas na interface |
| Temas | CSS do frontend e preferência persistida | foco visível, contraste conferido nos dois temas e respeito a movimento reduzido |

A página inicial mostra até cinco pendências e três reservas. Os links para Alertas e Agenda levam à lista completa. Os indicadores são lidos da API, e os cartões levam aos módulos correspondentes.
