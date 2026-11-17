# Fase 2 — MVP operacional

## Fluxos disponíveis

1. **Dashboard**: período, setor, equipamento e criticidade; situação atual das máquinas e ordens; parada no período; próximos vencimentos e atrasos; gráficos interativos. Intervalos sobrepostos do mesmo equipamento são unidos antes de somar a parada. Motivos são os informados pelos usuários, sem diagnóstico mecânico. Estados atuais não são reconstruídos como se fossem históricos.
2. **Equipamentos**: cadastro e edição, setor, criticidade e situação; filtros e paginação. Alterações são auditadas.
3. **Interrupções**: início, fim opcional, duração calculada, tipo e descrição; registros em andamento e edição pelos planejadores; recorrência explicável de mesmo motivo em pelo menos três registros e dois dias distintos nos últimos 30 dias.
4. **OS locais**: criação, prioridade, responsável, programação, apontamento, conclusão/cancelamento por transições válidas; ordens atrasadas; histórico; exportação CSV filtrada com proteção contra fórmulas do Excel. Nenhuma OS é enviada ao SAP. Referência SAP é apenas um campo informativo.
5. **Planos**: cadastro, periodicidade, situação, responsável e data; calendário mensal de próximos vencimentos ativos; conclusão com relato e histórico; próximo vencimento avançado pela periodicidade até ficar após a execução. Um mesmo apontamento não pode ser concluído duas vezes com a mesma versão.
6. **Terceiros**: cadastro com OS interna, requisitos documentais definidos pelo administrador, registro de documentos por referência e conferência manual; pendências; etapas com justificativa; tempo por etapa; filtro de processos sem movimentação há mais de sete dias. Rascunhos são copiados para revisão humana: não há envio de mensagens nem aprovação de pagamento.

## Permissões

| Operação | Administrador | Gestor | Planejador | Técnico | Visualizador |
|---|---|---|---|---|---|
| Ler dashboard, equipamentos, OS e planos | Sim | Sim | Sim | Sim | Sim |
| Cadastrar/editar equipamentos, planos e OS | Sim | Sim | Sim | Não | Não |
| Registrar interrupção | Sim | Sim | Sim | Sim | Não |
| Editar interrupção | Sim | Sim | Sim | Não | Não |
| Apontar OS e concluir plano | Sim | Sim | Sim | Somente atribuídos | Não |
| Ler terceiros (sem valores quando não autorizado) | Sim | Sim | Sim | Não | Sim |
| Manter processos e conferir documentos | Sim | Sim | Sim | Não | Não |
| Validar regularização / finalizar processo | Sim | Sim | Não | Não | Não |
| Ver/informar valores | Sim | Sim | Não | Não | Não |
| Configurar requisitos documentais | Sim | Não | Não | Não | Não |

A vinculação técnica usa `User.technicianId`; não se presume que qualquer técnico possa apontar qualquer OS. A conta fictícia de técnico é ligada a TEC-1. Não houve alteração de senha nessa vinculação.

## Regras e limites

- Ordens, planos e processos têm `version`. Atualizações concorrentes com uma versão antiga são recusadas com HTTP 409. Histórico e auditoria são gravados na mesma transação da mudança.
- Ordens concluídas/canceladas não podem ser reabertas nesta versão. O técnico não pode trocar equipamento, prioridade ou programação da OS.
- Processos só percorrem transições previstas. Uma solicitação pode não ter data de execução; ela precisa ser informada antes da etapa Serviço executado.
- Para preparar, validar, encaminhar ou finalizar um processo, os requisitos ativos precisam de documento conferido e as pendências registradas precisam estar resolvidas. Valores financeiros são retirados das respostas de usuários não autorizados.
- Nenhum requisito começa presumido obrigatório. Requisitos ativos são globais nesta fase e valem na próxima movimentação. Regras específicas por prestador/contrato ficam para evolução posterior.
- O documento é uma referência textual, não um arquivo enviado ao sistema. Upload e armazenamento de anexos permanecem futuros e estão identificados assim na tela.
- MTTR não é calculado usando duração de interrupção como se fosse tempo de reparo. MTBF e OEE também aguardam bases apropriadas; a interface informa os dados ausentes. Não são inventados valores ou economia.
- Cumprimento usa execuções pelo vencimento original e planos atualmente previstos no período; não reconstrói um planejamento histórico que não foi registrado. Gráficos diários usam UTC, identificado na interface.
- O calendário mostra o próximo vencimento cadastrado, sem gerar ocorrências fictícias ilimitadas. Agenda avançada com conflitos de horários e priorização assistida ainda não está implementada.
- Consulta paginada até 100 registros por página; exportação de até 5.000 OS por filtro; seletores de cadastro com até 1.000 equipamentos. O calendário pede filtros se houver mais de 100 planos no mês.

## Arquitetura

As rotas e regras estão em `backend/src/modules/operations`, com módulos para ordens, planos, terceiros e indicadores. Componentes, tipos e hook de consulta ficam separados no frontend. As páginas são carregadas sob demanda; o pacote de gráficos não entra no pacote inicial do login. A API Vercel mantém a mesma entrada `/api/*`, os mesmos cookies e o mesmo banco. Builds não aplicam migrations nem seed.

## Verificação

- 50 testes de integração e de regras passaram com PostgreSQL local isolado. Cobrem também a regressão de autenticação da Fase 1.
- Migrations testadas em `pcm-validation`, preservando 30 equipamentos, 100 OS, 70 planos e 25 processos anteriores.
- Chromium percorreu os fluxos pela interface: equipamento criado/editado, interrupção de 60 minutos, ordem executada e concluída, histórico e CSV, plano no calendário e execução, configuração documental, bloqueio sem conferência, processo com nove eventos até finalização e rascunho.
- Os seis módulos foram conferidos em 390×844 sem overflow horizontal ou erros JavaScript. Gráficos de linha, barras e setores foram verificados renderizados, com animações iniciais desativadas para estabilidade.
- Registros usados nos testes de escrita existiram somente no banco local isolado e foram removidos ao final. Não foi necessário redefinir a senha do usuário publicado.

O banco principal recebe somente migrations versionadas, sem reexecutar o seed. A documentação de validação registra a publicação e suas verificações. As fases 3 a 5 não são declaradas concluídas por esta entrega.
