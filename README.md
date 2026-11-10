# Testes automatizados de acessibilidade

Projeto de pesquisa para coleta de evidências de acessibilidade relacionadas à baixa visão em páginas públicas das prefeituras de Saquarema, Niterói e Rio de Janeiro, utilizando TypeScript, Playwright e axe-core.

São oito páginas e dez cenários por página, totalizando 80 cenários. Cada cenário é identificado por um critério WCAG e executa somente as regras axe associadas a ele. Na versão de referência, 32 cenários possuem regras e 48 ficam como não avaliados (`skipped` no Playwright). Quando não existem regras associadas, não há navegação pelo portal, preparação específica, captura, varredura axe ou verificação alternativa de acessibilidade pelo Playwright; é gerado apenas o JSON que documenta a ausência de avaliação.

## Ambiente de referência

| Componente | Versão ou configuração |
| --- | --- |
| Sistema operacional | Windows 11 |
| Node.js | 24.19.0 |
| TypeScript | 7.0.2 |
| Playwright | 1.63.0 |
| axe-core e integração `@axe-core/playwright` | 4.13.0 |
| Chromium registrado na coleta | 153.0.8010.12 |
| Viewport inicial | 1280 × 720 pixels CSS |
| Execução dos comandos do projeto | Um trabalhador, com `--workers=1` |

As dependências exatas estão no `package-lock.json`. O Chromium deve ser instalado pelo Playwright correspondente a essas dependências. A execução de referência foi realizada no Windows; outros sistemas não foram validados neste estudo.

## Instalação

Com Node.js, npm e Git disponíveis, execute no terminal:

```powershell
git clone https://github.com/lilpromis3/Testes_Automatizados_TCC.git
cd Testes_Automatizados_TCC
npm ci
npx playwright install chromium
```

Se o projeto já estiver no computador, abra o terminal na pasta que contém o `package.json` e execute os dois últimos comandos.

Instale o Chromium completo: os cenários de zoom nativo usam `channel: 'chromium'` e uma extensão local. A instalação somente com `--only-shell` não atende a esses cenários. É necessário acesso à internet para instalar as dependências e acessar os portais; não há servidor local da aplicação para iniciar.

## Execução

Todos os comandos abaixo devem ser executados na raiz do repositório.

### Executar todas as páginas

```powershell
npx playwright test --project=chromium --workers=1
```

### Executar uma página ou município

| Escopo | Comando |
| --- | --- |
| Saquarema — página inicial | `npm run test:saquarema` |
| Saquarema — catálogo Colab | `npm run test:saquarema:servicos` |
| Saquarema — Consulta de Documentos | `npm run test:saquarema:protocolo` |
| Niterói — todas as páginas | `npm run test:niteroi` |
| Niterói — página inicial | `npm run test:niteroi:home` |
| Niterói — catálogo Niterói 360 | `npm run test:niteroi:servicos` |
| Niterói — Localizar Processo | `npm run test:niteroi:processos` |
| Rio de Janeiro — página inicial | `npm run test:rio:home` |
| Rio de Janeiro — Carioca Digital | `npm run test:rio:servicos` |

Para executar as três páginas de Saquarema em um único comando:

```powershell
npx playwright test tests/Saquarema --project=chromium --workers=1
```

### Executar um critério específico

Exemplo para o cenário de espaçamento do formulário de Saquarema:

```powershell
npx playwright test tests/Saquarema/Specific-service-page/specific-service-page.spec.ts --project=chromium --workers=1 --grep '1\.4\.12'
```

### Conferir o projeto sem executar a coleta

```powershell
npx tsc --noEmit
npx playwright test --project=chromium --workers=1 --list
```

O primeiro comando verifica os tipos; o segundo lista os testes sem navegar pelos portais.

## Organização dos arquivos

```text
Testes_Automatizados_TCC/
├── package.json
├── package-lock.json
├── playwright.config.ts
├── tsconfig.json
├── scripts/
│   ├── relatorio-saquarema.cjs
│   └── diagnostico-handtalk.cjs
└── tests/
    ├── Saquarema/
    │   ├── Home-page/
    │   ├── Services-list-page/
    │   └── Specific-service-page/
    ├── Niteroi/
    │   ├── Home-page/
    │   ├── Services-list-page/
    │   └── Specific-service-page/
    ├── Rio-de-Janeiro/
    │   ├── Home-page/
    │   └── Services-list-page/
    └── helpers/
        └── native-zoom-extension/
```

Cada pasta de página avaliada contém o arquivo `.spec.ts`, os relatórios em `JSONs/` e as imagens em `Screenshots/`. Diretórios `Historico-*`, quando presentes, guardam versões anteriores e não integram a coleta corrente.

## Páginas e condições de preparação

| Município e página | Endereço | Condição inicial da coleta |
| --- | --- | --- |
| Saquarema — inicial | https://www.saquarema.rj.gov.br | Perfil `vision` do widget ativado e painel fechado. |
| Saquarema — serviços | https://saquarema.colab.re | Recursos Hand Talk configurados e painel fechado. |
| Saquarema — serviço específico | https://egov.saquarema.rj.gov.br | Formulário Consulta de Documentos (Protocolo) aberto nos iframes, com unidade e tipo selecionados. |
| Niterói — inicial | https://niteroi.rj.gov.br | Fonte no terceiro nível do widget, inversão de cores e destaque de links; painel fechado. |
| Niterói — serviços | https://niteroi360.niteroi.rj.gov.br | Hand Talk ativado quando disponível; em caso de erro do widget, painel fechado e continuidade com o layout comum. Preparação apenas nos cenários com regras axe. |
| Niterói — serviço específico | https://processo.niteroi.rj.gov.br | Formulário Localizar Processo aberto. |
| Rio de Janeiro — inicial | https://prefeitura.rio | Máximo de fonte do Pojo, alto contraste, links sublinhados e fonte legível; painel fechado. |
| Rio de Janeiro — serviços | https://carioca.rio | Aumento pelo controle +A até 200% do texto de referência. |

No Colab de Saquarema, os recursos Tamanho de Fonte, Espaçamento Entre Linhas e Espaço entre Letras usam o nível 3 de 3; Contraste de Cores usa 2 de 2; Letras Destacadas e Destacar Cabeçalho ficam ativos. Estilo de Texto permanece desativado, preservando as famílias de fonte.

Na home de Niterói, o máximo identificado corresponde a três aumentos, com acréscimo de 6 px nos elementos medidos. No Niterói 360, os cenários com regras axe tentam ativar os seis recursos Hand Talk no máximo disponível, preservando o Estilo de Texto desativado e fechando o painel antes da análise. Quando o widget está disponível, a preparação confirma os controles selecionados e as alterações nos estilos computados. Se o painel informar indisponibilidade, o teste registra a ocorrência, fecha o painel e segue com o layout comum da página. Em ambos os casos, as adaptações específicas de redimensionamento e espaçamento são aplicadas antes da varredura dos respectivos critérios. Os cenários sem regras são registrados como não avaliados antes da navegação. O script de diagnóstico em `scripts/diagnostico-handtalk.cjs` permite repetir a inspeção dessa integração.

Os JSONs correntes seguem o padrão `<criterio>-niteroi-servicos-<navegador>.json`. O campo `preparacao.perfil` informa se os recursos foram aplicados ou se a análise prosseguiu com a página comum por indisponibilidade; a resposta de autenticação fica em `preparacao.autenticacaoHandTalk`. A coleta anterior sem tentativa de ativação está preservada em `Historico-pagina-comum/`.

Na home do Rio, oito cliques levam ao nível 200 do Pojo; um clique adicional confirma o limite. Esse nível não implica que todo texto tenha exatamente o dobro do tamanho original. Os recursos de contraste, sublinhado e fonte legível são ativados antes do aumento para manter os controles acessíveis durante a preparação.

O +A do Carioca Digital não tem máximo programado no código inspecionado. O padrão do teste é `CARIOCA_FONT_FACTOR=2`, aplicado à referência “SERVIÇOS MAIS BUSCADOS”. Na coleta de referência, foram necessários 18 cliques para passar de 17,5 px a 35 px. Para explicitar esse fator no PowerShell:

```powershell
$env:CARIOCA_FONT_FACTOR = '2'
npm run test:rio:servicos
```

O fator é verificado na referência; não representa uma ampliação percentual uniforme de todos os textos. A comparação de famílias de fonte ocorre antes das alterações de viewport, pois o CSS responsivo pode mudar as famílias no layout móvel.

Os formulários de processos são preparados sem enviar consultas. Em Saquarema, são selecionados `1 | PMS` e `1 | Processo Eletrônico`, mantendo o número vazio; em Niterói, o número também permanece vazio. A análise axe do e-Gov é limitada ao documento do formulário, por `include(['#myIframe', 'iframe[name="mainform"]', 'body'])`.

A página de consulta a processos do Rio de Janeiro não integra a suíte: o acesso ao serviço selecionado exigiu autenticação por usuário externo ou conta gov.br. Não há teste ou relatório da interface autenticada.

## Critérios e alcance da automação

| Critério | Cenário | Regras axe associadas na versão 4.13.0 |
| --- | --- | --- |
| 1.1.1 | Conteúdo não textual | Regras de alternativas textuais. |
| 1.4.3 | Contraste mínimo | `color-contrast` |
| 1.4.4 | Redimensionamento do texto | `meta-viewport` |
| 1.4.10 | Reflow | Sem regras associadas. |
| 1.4.11 | Contraste não textual | Sem regras associadas. |
| 1.4.12 | Espaçamento do texto | `avoid-inline-spacing` |
| 1.4.13 | Conteúdo em hover ou foco | Sem regras associadas. |
| 2.4.6 | Títulos e rótulos | Sem regras associadas. |
| 2.4.7 | Foco visível | Sem regras associadas. |
| 2.4.13 | Aparência do foco | Sem regras associadas. |

As regras são consultadas com `axe.getRules([tag])` e selecionadas por `withRules`. Cada cenário executa no máximo uma análise axe. Uma lista vazia registra `nao_avaliado_sem_regra_axe` no JSON e marca o cenário como `skipped` no Playwright antes de acessar o portal. A acessibilidade desse critério não pôde ser checada pelo método automatizado adotado. Isso não significa aprovação, reprovação, inaplicabilidade ou impossibilidade de avaliação por outros métodos.

### Condições específicas

- **1.4.4:** a home e o Colab de Saquarema e a home de Niterói usam alteração de `font-size` para o dobro das referências registradas. O serviço específico de Saquarema e as páginas de serviços e processos de Niterói usam zoom nativo de 200% pela extensão local. A home do Rio preserva o máximo do Pojo; o Carioca Digital preserva o aumento pelo +A até o fator da referência. O JSON identifica o método e suas medições.
- **1.4.12:** uma folha de estilo adicional configura linha 1,5, margem inferior de parágrafos 2em, letras 0,12em e palavras 0,16em. No e-Gov de Saquarema, a folha é inserida no iframe do formulário. São verificados os valores computados nos elementos existentes. A ausência de parágrafos visíveis ou a altura de linha não numérica de controles nativos, quando identificadas pela rotina, são registradas como limites da medição.
- **1.4.10, 1.4.11, 1.4.13, 2.4.6, 2.4.7 e 2.4.13:** sem regras axe associadas na versão utilizada; não avaliados. Não são executados reflow, inventários de componentes ou títulos, hover, Tab ou medições de indicadores de foco para esses critérios.

Nos cenários com regras, os controles assistivos previamente configurados permanecem ativos, ressalvadas as alterações específicas do cenário. As verificações não percorrem todos os estados ou interações possíveis da interface. O Playwright realiza a preparação e executa a integração com o axe-core; não substitui as regras ausentes por verificações próprias de conformidade.

## Resultados e arquivos de saída

Os relatórios ficam em `tests/<municipio>/<pagina>/JSONs/`. O nome identifica critério, página e navegador, por exemplo:

```text
tests/Rio-de-Janeiro/Services-list-page/JSONs/1.4.12-rio-servicos-carioca-chromium.json
```

| Campo | Conteúdo |
| --- | --- |
| `criterio`, `nome`, `url`, `inicio`, `fim`, `ambiente` | Identificação da coleta, datas e versões registradas. |
| `preparacao` | Recursos, condições e medições aplicadas ao cenário. |
| `regrasDisponiveis`, `analise` | Regras selecionadas, cobertura, estado e número de varreduras. |
| `resumoAxe` | Quantidade de regras por categoria. |
| `ocorrenciasAxe` | Quantidade de ocorrências em `nodes` por categoria. |
| `localizacaoDosAchados` | Localização de resultados `violations` e `incomplete`. |
| `axe` | Resultado completo da análise, quando executada. |
| `screenshots`, `captura` | Imagens vinculadas e metadados de captura, quando disponíveis. |
| `statusExecucao`, `erros` | Estado da execução e eventuais falhas. |

`coleta_concluida` indica conclusão da preparação e da análise; violações não reprovam a execução por si só. `nao_avaliado_sem_regra_axe` indica ausência de verificação de acessibilidade: zero varreduras, contagens e `axe` como `null`, preparação vazia, sem achados e sem capturas. Esses cenários aparecem como `skipped` no Playwright, com o motivo anexado ao relatório. `erro_de_execucao_ou_precondicao` indica interrupção da coleta e faz o teste falhar.

Os registros anteriores dos seis critérios sem regras foram preservados em `Historico-evidencias-playwright/JSONs/` em cada página e não integram os resultados correntes. Suas referências `Screenshots/` apontam para a pasta de capturas original da página, onde as imagens antigas permanecem. A coleta atual deve ser consultada pelos JSONs da pasta `JSONs/` diretamente associada ao `.spec.ts`.

Nas análises executadas, as categorias são `violations`, `passes`, `incomplete` e `inapplicable`. Uma regra pode apresentar várias ocorrências. A soma das ocorrências não é necessariamente a quantidade de elementos únicos da página. Um `pass` de regra não representa aprovação integral do critério; contagens nulas por ausência de análise não significam zero problemas.

Os JSONs de nomes estáveis são substituídos em novas execuções. As capturas podem usar nomes estáveis ou incluir a data da rodada. Para selecionar as imagens corretas, consulte sempre `screenshots` no JSON vigente. Antes de repetir uma coleta que precise ser preservada, copie os JSONs e as imagens vinculadas para uma pasta própria.

### Relatórios HTML

Com o reporter padrão de `playwright.config.ts`, o relatório da execução fica em `playwright-report/`:

```powershell
npx playwright show-report
```

Executar com `--reporter=list` usa apenas o reporter de terminal e não atualiza esse HTML. A configuração prevê traces no primeiro retry; não há trace de todas as execuções. Fora do CI, não há retries automáticos por padrão.

Para gerar o relatório adicional da home de Saquarema a partir dos JSONs correntes:

```powershell
npm run relatorio:saquarema
```

O arquivo gerado fica em `tests/Saquarema/Home-page/Relatorios/index.html`. Esse comando não executa novamente os testes e não gera relatório das outras páginas.

## Limitações de reprodução e interpretação

- Os testes acessam portais públicos em funcionamento. Mudanças de conteúdo, seletores, widgets, rede ou bloqueios podem alterar os resultados ou interromper a preparação. Nesses casos, confira o erro e as capturas antes de repetir o cenário.
- As condições assistivas diferem entre as páginas. A suíte não realiza uma comparação sistemática de cada página com e sem os recursos ativados, nem usa um único método de ampliação em todos os cenários.
- As capturas variam entre página integral, trechos da rolagem e viewport da interação. Rotinas com limite de 30.000 px registram a cobertura quando implementado. A quantidade de imagens não mede a quantidade de problemas de acessibilidade.
- A aplicação dos espaçamentos ou a ativação do zoom não comprova ausência de perdas de conteúdo e funcionalidade. A regra `meta-viewport` não avalia toda a apresentação ampliada, e `avoid-inline-spacing` não verifica todos os recortes ou sobreposições.
- Os seis critérios sem regras associadas não tiveram a acessibilidade verificada nesta avaliação automatizada. Não há resultados próprios do Playwright para suprir essa ausência de cobertura.
- A cobertura é parcial e restrita ao Chromium. Ausência de violações não certifica conformidade WCAG ou eMAG. O projeto não implementa uma avaliação específica do eMAG, não realiza testes com participantes e não substitui avaliação manual complementar.

## Referências técnicas

- [Testes de acessibilidade com Playwright](https://playwright.dev/docs/accessibility-testing)
- [API do axe-core](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- [Extensões no Playwright](https://playwright.dev/docs/chrome-extensions)
- [WCAG 2.2 — Espaçamento do texto](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [Técnica G142 — Zoom](https://www.w3.org/WAI/WCAG22/Techniques/general/G142)
