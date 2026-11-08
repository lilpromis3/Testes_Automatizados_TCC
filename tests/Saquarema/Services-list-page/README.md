# Avaliação do catálogo de serviços de Saquarema no Colab

Execute na raiz do projeto:

```sh
npm run test:saquarema:servicos
```

Os dez critérios e o formato de coleta seguem `Home-page/home-page.spec.ts`.
Cada teste abre diretamente https://saquarema.colab.re em um contexto
isolado, executa uma análise axe e salva JSON e capturas nesta pasta.
Antes da coleta, aguarda a seção “Categorias de serviços” e a categoria
“Desenvolvimento Econômico”, pois o catálogo é carregado por JavaScript.
A jornada home → Colab deve ser coberta separadamente para que uma falha
na navegação não impeça a avaliação da página alvo.

Antes de cada análise, abre os recursos assistivos do Hand Talk e aplica
simultaneamente: tamanho de fonte, letras destacadas, espaçamento entre linhas,
espaço entre letras, destaque de cabeçalho e contraste de cores.
Estilo de Texto permanece desativado e a família original da amostra é preservada.
Também são comparadas as famílias de fonte computadas antes e depois nos
elementos existentes durante a preparação; diferenças interrompem a coleta.
As medições ficam em `preparacao.widgetBaixaVisao.verificacaoFamiliasDeFonte`.
Nos controles com níveis, seleciona
o máximo informado pelo rótulo acessível (opção 3 de 3 quando existem três
níveis), confirmando cada avanço. Letras destacadas e Destacar Cabeçalho
são apenas ativados, pois não possuem níveis.
O nível aplicado e o máximo disponível são registrados por recurso no JSON.
Os controles de tamanho de fonte e espaçamentos possuem três opções;
Contraste de Cores possui duas, sendo utilizada a opção 2 de 2.
Se os níveis não puderem ser identificados, o teste falha na preparação.
Trata-se de uma
configuração personalizada para baixa visão, não de um perfil pronto
equivalente ao da home. Os outros recursos permanecem no estado inicial.

O teste confirma os controles selecionados e a mudança nos estilos computados
do título “Categorias de serviços”. Fecha o painel pelo botão oferecido pelo
site e confirma que os estilos medidos permanecem aplicados. Imediatamente
antes da captura e da única varredura axe, confirma novamente que o painel
está fechado. Os controles, opções e medições ficam em
`preparacao.widgetBaixaVisao`; `analise.painelFechado` e `analise.amostraTexto`
registram a condição no momento da coleta. A amostra confirma os efeitos no
título medido, sem comprovar que o widget modifica todos os elementos da página.

No critério 1.4.4, o redimensionamento usa 200% dos tamanhos computados
antes da ativação do widget, evitando duplicar novamente o aumento assistivo;
não executa zoom nativo. O reflow usa viewport de 320 CSS px. Hover busca
candidatos por atributos de popup, descrição ou título e registra a interação
com o primeiro visível. Ausência de candidato não comprova conformidade ou
inaplicabilidade do critério. Foco registra
o primeiro elemento alcançado com Tab. Essas coletas não cobrem todos os
componentes, estados, áreas autenticadas ou formulários internos dos serviços.
No critério 1.4.12, uma folha de estilo adicional aplica os quatro valores
WCAG e verifica os estilos computados. Esse cenário específico difere dos
níveis nativos do widget; os demais ajustes assistivos continuam ativos.

Os arquivos atuais incluem `colab-baixa-visao` no nome. As coletas anteriores do e-Gov
foram preservadas em `Historico-egov/`, com seus JSONs e capturas originais.
Elas não representam resultados do Colab nem do teste específico de
“Consulta de Documentos (Protocolo)” no e-Gov, que possui outro escopo.
As coletas do Colab sem recursos assistivos foram preservadas em
`Historico-colab-padrao/` e não representam o cenário atual.
Os JSONs da coleta com os controles no primeiro nível foram copiados para
`Historico-colab-nivel-1-20261107-203010/JSONs/` antes da nova execução.
As capturas antigas que estavam em `Screenshots/` foram substituídas a pedido
da autora; referências dos JSONs históricos a essas imagens podem não existir.
Não misture essas contagens com as coletas atuais, que usam o nível máximo
dos recursos selecionados, sem alterar Estilo de Texto.
Os JSONs da configuração anterior com Estilo de Texto ativo no nível 3
foram preservados em uma pasta `Historico-colab-estilo-texto-nivel-3-*`.
Essa configuração anterior não inclui os novos ajustes de cabeçalho e contraste.

## Capturas e rolagem

O Colab usa rolagem interna no `body`, com altura limitada à viewport.
`page.screenshot({ fullPage: true })` gerava imagens com conteúdo apenas no
trecho inicial e uma grande área em branco. A preparação anterior também
tentava percorrer a janela, sem percorrer esse contêiner.

A coleta atual percorre o contêiner real e salva capturas de viewport
sequenciais, com 15% de sobreposição, até o final (limite de 30.000 px).
Os nomes terminam em `trecho-1`, `trecho-2` etc. O campo `captura` do JSON
registra o método, o contêiner, os deslocamentos e a cobertura. A posição
original é restaurada antes do axe. Nenhum CSS de layout é alterado para
produzir as imagens. Nos testes de hover e foco, captura apenas a viewport
do estado avaliado para não desfazer a interação.
As capturas atuais usam nomes estáveis, sem horário, para substituir o mesmo
cenário nas novas execuções. A pasta `Screenshots/` foi limpa dos arquivos
antigos após a coleta completa; utilize os caminhos dos dez JSONs atuais.
Quebras de palavras e espaçamentos excessivos observados com os recursos
no máximo pertencem à apresentação do site nessa condição, não são corrigidos
artificialmente para as capturas.

Os resultados anteriores com capturas incompletas foram preservados em
`Historico-colab-captura-incompleta/`; utilize os novos JSONs e capturas para
a avaliação atual.

Assim como na home, testes concluídos indicam sucesso da coleta, não
conformidade WCAG. Violações ficam nos JSONs sem reprovar a execução.
Critérios sem regras axe específicas recebem uma varredura geral complementar,
identificada por `analise.escopo`; seus achados não devem ser atribuídos
automaticamente ao critério do arquivo. A avaliação de perda de conteúdo,
contraste não textual, hover e aparência do foco exige revisão manual.
