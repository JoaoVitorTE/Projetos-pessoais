# Importação, cadastros e controle — versão 0.3

## Uso diário com exportações SAP

1. Exporte um relatório **autorizado** em CSV UTF-8 ou XLSX. A transação/listagem e suas colunas dependem da configuração da empresa; confirme com o responsável SAP. O aplicativo não presume um layout proprietário nem acessa o SAP.
2. Em **Importações SAP / planilhas**, crie uma origem para equipamentos, ordens, planos ou interrupções. Escolha se o arquivo é fictício ou uma exportação autorizada. Use a mesma identificação de base, por exemplo `SAP-PRINCIPAL`, para relatórios dessa instalação. Bases diferentes precisam de identificações diferentes.
3. Envie o arquivo, escolha a linha dos cabeçalhos e a aba quando necessário. Limites por arquivo: 3 MB, 1.000 linhas de dados, 60 colunas. XLSX tem limite adicional de 20 MB efetivamente descompactados e 250 entradas ZIP. Macros e vínculos externos são recusados; fórmulas não são executadas.
4. Mapeie as colunas. Use o número externo estável da OS/plano/ocorrência como chave. O nome do arquivo e o número da linha não são identidades. Para itens de uma mesma OS, use uma segunda coluna estável, como o item/operação. Uma interrupção precisa de identidade própria, pois a mesma máquina pode parar várias vezes.
5. Traduza códigos de tipo, prioridade e situação conforme os significados usados pela empresa. Nenhum código SAP é traduzido silenciosamente. Escolha o fuso das datas sem deslocamento e o formato de data. Códigos de equipamentos e números externos preservam zeros fornecidos como texto ou formato numérico do Excel; zeros já perdidos na exportação não podem ser reconstruídos.
6. Importe equipamentos antes dos demais relatórios ou autorize explicitamente criar referências ausentes. Novos equipamentos exigem setor e criticidade definidos pelo usuário; o estado fica como **Não informado** quando ausente. Técnicos criados pela importação recebem especialidade “Não informada”. Campos vazios não apagam valores existentes. Datas ausentes de uma OS nova permanecem ausentes.
7. Gere a prévia e revise novos, atualizados, sem alteração, repetidos, inválidos e conflitos. A tabela mostra até 200 linhas; totais, validação e erros consideram o arquivo inteiro. A prévia não muda os registros operacionais. O mapeamento pode ser reutilizado nos próximos arquivos.
8. Digite `IMPORTAR`. Se houver erros, corrija o arquivo ou autorize somente as linhas válidas; as demais ficam no relatório de erros. O processamento acontece em trechos transacionais de até cinco linhas. Pode ser pausado e retomado pelo histórico após falha de rede ou troca de página.
9. No dia seguinte, reutilize a origem e os identificadores. A unicidade é `(identificação da base, tipo de registro, chave externa)`, inclusive entre layouts/origens diferentes da mesma base. Conteúdo igual não cria outro registro. Conteúdo diferente atualiza a cópia local, com histórico. Linhas com a mesma chave e conteúdos divergentes no próprio arquivo são conflitos.

Alterações locais posteriores à importação são protegidas por versão. A substituição exige revisão e autorização explícita na prévia; se o registro mudar depois da prévia, a linha não será sobrescrita. Nenhuma dessas operações escreve no SAP, aprova pagamento, envia mensagens ou comanda máquinas.

**Desfazer** reverte os registros que continuam no estado deixado pelo lote e remove referências criadas que não tenham vínculos posteriores. Alterações posteriores, apontamentos e vínculos impedem a reversão para preservar trabalho novo. Uma reversão de atualização incrementa a versão; não permite apagar uma cadeia antiga ignorando seu histórico. Lotes parciais podem ser encerrados e então desfeitos. A reversão e as alterações permanecem na auditoria.

Arquivos brutos ficam no banco apenas durante prévia/processamento. Prévia expira após uma hora; dados de prévias expiradas são descartados no próximo upload. Ao finalizar ou encerrar um lote, o conteúdo bruto é descartado. Histórico, diferenças aplicadas, chaves e erros são preservados para rastreabilidade; exportações autorizadas continuam sendo dados confidenciais que exigem política de acesso e retenção da empresa.

`SapExportImportAdapter`, `SkaReportsImportAdapter` e `GenericImportAdapter` compartilham o parser e o contrato de mapeamento. A [Agenda inteligente](SCHEDULING.md) protege reservas ativas contra alteração silenciosa de datas, técnico ou equipamento. Mudanças de status sincronizam bloqueio/encerramento; reverter um lote não reativa reservas canceladas.

Sincronização automática requer documentação, autorização e mecanismo oficial. Não há scraping, credenciais industriais ou consulta a endpoints internos.

## Relatório e assistente

**Relatório de preventivas** reúne planos ativos e OS preventivas/lubrificação não concluídas ou canceladas, com vencimentos, responsáveis, filtros e exportações PDF/Excel. Os dois tipos de registro são contados separadamente: não se presume que uma OS e um plano sejam atividades diferentes ou correspondentes sem vínculo explícito. Sem programação significa ausência de data, não uma data estimada. O resumo executivo é calculado a partir dos mesmos resultados.

**Assistente PCM** é somente leitura e usa consultas estruturadas e templates. Informa período, evidências, limite de resultados e recomendações para revisão. Responde paradas da semana, ordens atrasadas, planos vencidos/próximos sete dias, amanhã e terceiros pendentes conforme permissões. Perguntas fora desse contrato mostram as capacidades, sem uma resposta inventada. Não há API de IA paga. Alertas calculados cobrem atrasos e processos sem movimentação há mais de sete dias. Modelos de probabilidade, diagnóstico mecânico e alertas estatísticos de aumento de frequência permanecem futuros.

## Cadastros e permissões novas

| Operação | Administrador | Gestor | Planejador | Técnico | Visualizador |
|---|---|---|---|---|---|
| Importar, revisar, retomar e desfazer lotes | Sim | Sim | Sim | Não | Não |
| Criar/editar técnicos e setores | Sim | Sim | Sim | Não | Não |
| Criar/editar/ativar usuários e redefinir senha | Sim | Não | Não | Não | Não |
| Auditoria pesquisável com antes/depois | Sim | Sim | Não | Não | Não |
| Relatório preventivo e assistente de dados operacionais | Sim | Sim | Sim | Sim | Sim |
| Consultar terceiros no assistente | Sim | Sim | Sim | Não | Sim |

Senhas temporárias são aleatórias, exibidas uma vez na confirmação e exigem troca no primeiro acesso. Não são enviadas por e-mail nem registradas em auditoria. Redefinição, desativação e alteração de perfil revogam sessões. Não há cadastro público; o administrador autoriza novos acessos. O próprio administrador não pode remover seu acesso administrativo. Técnicos precisam de vínculo com um cadastro ativo para criar uma conta técnica. Desativar técnico não desativa a conta vinculada; o acesso é controlado no cadastro de usuários.

## Ambiente limpo e recuperação

`DATA_MODE=demo` permite seed fictício. `DATA_MODE=operational` identifica a operação local e impede seed. O modo não realiza limpeza automática. A manutenção de terceiros conserva seu fluxo atual.

A limpeza solicitada pelo responsável é uma operação administrativa única, após backup Neon. Preserva usuários, perfis, auditoria e senha/sessão do administrador; desativa os outros quatro acessos fictícios e remove registros operacionais e seus vínculos. Não é uma rota pública, migration ou efeito do build. O script `backend/scripts/clear-operational-data.ts` exige todos os argumentos de confirmação, usuário administrador e identificação de um backup já verificado. Não execute em uma base existente sem autorização específica e backup. Recuperação deve ser feita a partir do branch/snapshot de backup em ambiente separado e revisada antes de substituir dados ativos.

## Validação

- 80 testes automatizados com PostgreSQL isolado: regressão de autenticação/PCM, CSV/XLSX, quatro tipos de importação, repetidos entre dias e layouts, atualização, conflitos, reversão, referências, cadastros, permissões, auditoria, assistente e relatórios.
- Build de backend, função Vercel e frontend.
- Fluxo Chromium com importação, reimportação, reversão, PDF/Excel, técnico, antes/depois e consulta estruturada. Sete telas verificadas em 390 × 844 sem overflow horizontal e sem erros JavaScript.
- Migration aditiva testada primeiro em branch de validação Neon. A senha do administrador não é redefinida pela atualização.

Continuam futuros: sincronização SAP/SKA automática, modelos preditivos, monitoramento de ar comprimido na interface e armazenamento de anexos. As fases completas do projeto não são declaradas concluídas por esta versão.
