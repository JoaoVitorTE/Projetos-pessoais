# Planilha SAP no PCM Intelligence

## Primeira carga

1. Entre com um perfil de PCM, gerente ou administrador e abra **Importar planilhas → Planilha SAP**. Baixe o **Modelo Excel**. O mesmo [modelo PCM-SAP.xlsx](../sample-data/PCM-SAP.xlsx) está disponível no repositório.
2. Mantenha as abas **Máquinas**, **Ordens**, **Notas** e **Apontamentos**. Cole cada exportação com seus cabeçalhos na linha 1. Se uma aba ainda estiver sem dados, deixe apenas o cabeçalho. Formate as colunas de TAG, matrícula, números SAP e contador como **Texto** antes de colar, para preservar os zeros. Mantenha as colunas extras onde elas vieram na exportação. Use até 3 MB, 1.000 linhas de dados e 60 colunas por aba. Em cargas maiores, importe um período por vez, substituindo as linhas no mesmo arquivo entre os envios. O histórico já importado fica no PCM.
3. Em **Máquinas**, informe TAG, nome e setor já cadastrado. O número SAP pode ser acrescentado depois ao mesmo cadastro. Criticidade aceita 1, 2 ou 3 e a situação aceita os códigos `UNKNOWN`, `RUNNING`, `STOPPED` e `MAINTENANCE`. Nas ordens e notas, informe o número do equipamento SAP ou TAG e setor quando disponíveis. Para ordens, inicie pela exportação de novembro de 2026. A data inicial pode mudar nas próximas cargas.
4. Selecione o arquivo e clique em **Ver prévia**. Confira os dados por aba. Para cabeçalhos diferentes dos sugeridos no modelo, selecione a coluna real ao lado do campo correspondente, execute **Ver prévia** novamente e clique em **Salvar mapeamento por aba**. Se dois cabeçalhos forem idênticos, dê títulos distintos no Excel antes de selecionar a coluna. Colunas extras e vazias continuam nas suas posições. No layout H.TECNICOS, associe a matrícula ao técnico e `RFC_PS4` a **Registrado por**.
5. Clique em **Importar arquivo**. Em **Arquivos recebidos**, abra o resultado para ver o processamento de cada aba e as divergências por linha. Uma ordem cujo equipamento ainda não foi identificado aparece em **Relatórios → Horas e notas SAP → Ordens SAP**. Depois de corrigir a identificação, importe novamente a linha. Para tipos SAP sem categoria local reconhecida, cadastre ou classifique a OS local com a mesma referência SAP e reimporte a linha para associá-la. As novas OS locais entram abertas. Os campos de planejamento e o histórico da OS ficam no cadastro local. Os campos do SAP aparecem em **Última exportação SAP**.

A fila **Notas sem ordem** está em **Relatórios → Horas e notas SAP**. Ao chegar uma ordem com o número da nota, ela passa para **Notas com ordem**, com acesso aos dados SAP e à OS local quando associada. O arquivo pode trazer somente as linhas novas e alteradas. A ausência de uma linha em uma exportação posterior preserva o que já foi importado.

## Atualização automática ao salvar

Use o **SharePoint Online** corporativo com o fluxo do **Power Automate**. Guarde o arquivo fixo em **Documentos → PCM → PCM-SAP.xlsx** no site do PCM. Edite e salve nesse mesmo caminho e preserve o item ao longo do uso. Faça a primeira carga e salve o mapeamento manual antes de ativar o fluxo.

**Na Vercel**, aplique a migration ao PostgreSQL com `npm run db:migrate` a partir de `pcm-intelligence` antes de publicar o app e configure estas variáveis de ambiente no projeto. Publique novamente após alterar as variáveis.

| Variável | Valor |
|---|---|
| `PCM_WORKBOOK_FILE_ID` | ID numérico do item na biblioteca do SharePoint, como texto. Veja o campo **ID** em **Obter propriedades do arquivo**. |
| `PCM_WORKBOOK_FILE_LABEL` | Identificação que a equipe verá no PCM, por exemplo `Site PCM / Documentos / PCM / PCM-SAP.xlsx`. |
| `PCM_WORKBOOK_SECRET` | Segredo aleatório exclusivo de pelo menos 32 caracteres. Configure como variável sensível e coloque o mesmo segredo no cabeçalho HTTP do fluxo. |

**No Power Automate**, crie um fluxo de nuvem automatizado na conta de integração da empresa.

1. Use o gatilho SharePoint **Quando um arquivo é criado ou modificado (apenas propriedades)**. Escolha o site do PCM, a biblioteca **Documentos** e a pasta **PCM**. Filtre pelo **ID** do item configurado na Vercel. Nas configurações do gatilho, ative o controle de simultaneidade com grau 1.
2. Adicione **Obter propriedades do arquivo** usando o **ID** do gatilho. Em seguida, use **Obter conteúdo do arquivo** com o **Identificador** do item. Consulte as propriedades novamente e envie apenas se **Modificado** e, se exposta, a versão do item permanecerem iguais nas duas leituras. Se o Excel salvar entre as leituras, o próximo evento processará a versão recente.
3. Use a ação **HTTP** com método `POST`, URL `https://pcm-intelligence.vercel.app/api/sap/connection` (ajuste para o domínio publicado) e cabeçalhos `Content-Type: application/json` e `Authorization: Bearer <segredo>`. Use as entradas e saídas seguras nessa ação. Preencha o corpo conforme a tabela.

   | Propriedade | Valor na ação HTTP |
   |---|---|
   | `filename` | `PCM-SAP.xlsx` |
   | `fileId` | ID do item na biblioteca convertido em texto, por exemplo `string(triggerBody()?['ID'])`. |
   | `modifiedAt` | Campo **Modificado** ISO 8601 de **Obter propriedades do arquivo**. |
   | `content` | Parte base64 do conteúdo do arquivo, sem prefixo `data:`. Renomeando a ação de conteúdo para `Get_PCM_File`, use a expressão `body('Get_PCM_File')?['$content']`. |

4. Salve uma alteração de teste no Excel. Em **Importar planilhas → Planilha SAP**, clique em **Atualizar histórico** e confira o nome do arquivo, a origem **Microsoft 365** e a data da última atualização bem-sucedida. **Arquivo recebido** indica que a API recebeu o arquivo. **Dados atualizados parcialmente** indica que há linhas para conferir. Cabeçalhos inválidos geram resposta HTTP 422. Reenvios da mesma versão e versões anteriores aparecem com situação própria.

A conta do fluxo precisa de permissão de **leitura** no arquivo e na biblioteca do SharePoint, com acesso ao gatilho e às ações de leitura. A TI precisa permitir o conector **HTTP Premium** e o envio HTTPS ao domínio do PCM pela política de dados do Power Platform. O PCM recebe somente o arquivo enviado pelo fluxo. A operação usa a conta e as permissões de leitura do SharePoint, sem registro de aplicativo no Microsoft Graph. A conta PCM que salvou o mapeamento precisa continuar ativa e autorizada para importar. Se a TI restringir o conector ou se o fluxo estiver pendente, use o upload manual na mesma tela.

## Conferir as horas de um técnico

1. Abra **Relatórios → Horas e notas SAP**. Selecione o intervalo pelas datas dos apontamentos e, se desejar, informe matrícula, tipo SAP, centro de trabalho ou equipamento.
2. Clique na matrícula para conferir ordens, confirmação e contador, horário inicial e final, horas do SAP, registrador e texto da confirmação. O valor **20,780** representa 20,780 horas decimais pela matrícula do técnico. O total usa o campo de horas do SAP, inclusive quando o horário final é anterior ao inicial. Excel e PDF recebem os mesmos filtros e totais da consulta.
3. O contador **Fora da soma** indica apontamentos com horas inválidas ou aguardando revisão. Corrija os dados na planilha e reimporte. Inclua confirmação e contador sempre que possível. Se ocorrer uma mudança sem esses identificadores e o PCM marcar ambiguidade, use **Revisar** e indique se o novo registro substitui um anterior ou deve ser somado. A decisão fica na auditoria. Os totais são somados com precisão decimal antes do arredondamento para três casas.

## Validação

Testes locais com PostgreSQL verificam cadastro, auditoria, arquivamento e exclusão, cabeçalhos e prévia, notas e confirmações que chegam antes da ordem, reenvio, horas por matrícula, preservação dos dados do PCM, Excel/PDF e o receptor HTTP com revisões simultâneas e fora de ordem.

A entrega real de um salvamento pelo Microsoft 365 depende da conta corporativa, das permissões do SharePoint e da configuração do fluxo. A etapa 4 da conexão verifica esse percurso no ambiente da empresa.

## Rotina diária com arquivos separados

No Início, o PCM mostra a situação do dia de cada exportação no horário de São Paulo. Abra **Importar hoje** para selecionar a transação correspondente.

- **IW38 · Ordens de manutenção.** Inclua número da ordem, equipamento, tipo, data de entrada ou data-base e descritivo. Use os códigos CORR, CORP, MELH e CORI. Para identificar preventivas e lubrificação, inclua a coluna **Plano de manutenção**. Quando estiverem disponíveis, inclua **Descrição do plano** e **Item de manutenção**.
- **IW47 · Apontamentos da equipe.** Inclua ordem, matrícula, datas, horas e, quando disponível, número e contador de confirmação. Use os apontamentos para acompanhar trabalho realizado.

O PCM aceita um Excel de cada transação com uma única aba de dados ou uma aba chamada IW38, IW47, Ordens ou Apontamentos, conforme a transação. A planilha consolidada e sua conexão continuam disponíveis. Confira a prévia e importe cada arquivo. A rotina assinala importações parciais para revisão e só confirma uma transação após processar linhas dessa origem.

## Planejamento e análise de interrupções

Em Ordens de serviço, registre o planejamento com tipo, data e texto para a futura ordem. Abra a ordem oficial no SAP, importe a IW38 e informe o número para vincular os registros. O vínculo exige que a ordem importada pertença ao equipamento do planejamento.

Em Interrupções, o PCM mostra equipamentos com pelo menos duas ordens CORR ou CORI nos últimos 30 dias. O descritivo e os números das ordens ajudam a investigar. Revise a sugestão e escolha a data para salvar o planejamento. A duração real de uma parada pode ser importada em lote em **Importar paradas em lote**. Aponte exceções manualmente quando necessário.

A aba **Preventivas e lubrificação** mostra referências de planos agrupadas pelo número identificado na IW38. Quando a exportação não traz a lista de tarefas, o PCM mantém a referência e as ordens associadas. Periodicidade, próximo vencimento e tarefas só podem ser cadastrados com os dados do plano.
