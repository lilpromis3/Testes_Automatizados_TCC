# Consulta de Documentos (Protocolo) — Saquarema

Na raiz do projeto, execute:

```sh
npm run test:saquarema:protocolo
```

Cada um dos dez testes abre o e-Gov e clica em “Consulta de Documentos
(Protocolo)”. Fecha o comunicado inicial, quando presente, e dispensa o
tutorial automático do formulário com Escape. Seleciona “1 | PMS” em
Unidade Protocoladora e “1 | Processo Eletrônico” em Tipo de Documento.
Confirma os valores e mantém o número do documento vazio. Não clica em
“Consultar Documento”, não envia a consulta e não testa resultados ou
mensagens de validação após envio. As requisições automáticas usadas pelo
site para carregar as listas continuam funcionando normalmente.

## Condições de avaliação

O formulário está dentro de dois iframes. A única chamada ao axe por teste
é limitada ao documento do formulário por
`include(['#myIframe', 'iframe[name="mainform"]', 'body'])`. Assim, os achados
não incluem a navegação e o catálogo da página externa. A URL do formulário
e o caminho dos frames ficam registrados no JSON.

A condição inicial é a apresentação normal, sem ativar recursos assistivos.
Somente o critério correspondente recebe estas preparações:

| Critério | Preparação |
| --- | --- |
| 1.4.4 | Zoom nativo de página inteira a 200% no Chromium, confirmado pela API de abas e pela escala de renderização. Não altera o `font-size`. |
| 1.4.10 | Viewport externa de 320 × 720 CSS px; registra a largura real e os possíveis recortes dentro do iframe, sem forçar o site a se adaptar. |
| 1.4.12 | Aplica e verifica simultaneamente linha 1,5, margem inferior de parágrafos 2 em, letras 0,12 em e palavras 0,16 em dentro do iframe. |
| 1.4.13 | Hover no primeiro candidato visível identificado por atributos de popup, descrição ou título no formulário; registra menus e tooltips detectados. |
| 2.4.7 e 2.4.13 | Reinicia o foco no documento do formulário e registra o primeiro elemento alcançado com Tab. |
| 2.4.6 e 1.4.11 | Registra, respectivamente, títulos/rótulos e estilos de componentes do formulário. |

Os dois campos selecionados e o número vazio são conferidos novamente antes
da coleta. Os demais critérios usam o formulário parcialmente preenchido
sem alterações de apresentação.

### Zoom nativo no critério 1.4.4

Somente esse teste inicia um Chromium isolado com a extensão local em
`tests/helpers/native-zoom-extension`, sem usar o perfil pessoal do navegador.
A extensão automatiza `chrome.tabs.setZoom(2)` e confirma o valor com
`chrome.tabs.getZoom`. Não injeta CSS nem conteúdo no site. O teste verifica
o aumento de `devicePixelRatio`, a redução da largura útil em pixels CSS e
que `visualViewport.scale` continua em 1 (sem zoom de pinça). Registra as
medições antes/depois e confirma novamente o zoom após as capturas.

O navegador começa com viewport de 1280 × 720; com zoom de 200%, sua área
útil passa a 640 × 360 CSS px. O zoom abrange também os iframes. As capturas
desse cenário são viewports sequenciais, percorrendo a rolagem externa e a
interna sem redimensionar a janela. Usa captura direta do Chromium sem
recorte por coordenadas, evitando imagens em branco que o recorte padrão
do Playwright produzia com zoom nativo. `page.viewportSize()` representa a
configuração inicial; as dimensões CSS reais ficam nas medições do relatório.

Este método está implementado para o projeto Chromium. O teste 1.4.4 é
explicitamente ignorado em Firefox/WebKit, enquanto não houver implementação
de zoom nativo validada para esses motores. Os demais critérios permanecem
disponíveis nos projetos configurados.

Referências: [técnica G142 da W3C](https://www.w3.org/WAI/WCAG22/Techniques/general/G142),
[API de zoom do Chromium](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom)
e [extensões no Playwright](https://playwright.dev/docs/chrome-extensions).
As capturas antigas foram separadas em `Historico-resize-anterior/Screenshots`.
As imagens com `texto-200-css` são do método anterior; utilize as
imagens listadas no JSON atual, identificadas por `zoom-nativo-200`.

O teste coleta evidências e executa axe nesse estado. A confirmação de que
todo o conteúdo e todas as funções continuam disponíveis exige revisão;
um resultado axe sem violações não comprova sozinho o critério 1.4.4.

## Evidências e limites

Os JSONs são salvos em `JSONs/` e as imagens em `Screenshots/`, com nomes
contendo `saquarema-protocolo`. A captura usa o iframe como área de interesse,
com trechos de sua rolagem interna quando necessário, sem expandir o documento
interno por `fullPage`. Nos cenários de hover/foco, usa apenas a viewport
atual para preservar a interação. Nenhum estilo de layout é corrigido para
melhorar as imagens; texto cortado pelo próprio site permanece como evidência.
Cada JSON lista suas capturas e as posições de rolagem.

Assim como nos testes anteriores, sucesso do teste significa coleta
concluída, não conformidade WCAG. Violações e resultados incompletos ficam
nos relatórios sem reprovar a execução. Critérios sem regras axe específicas
recebem uma varredura geral complementar, identificada em `analise.escopo`;
esses achados não devem ser atribuídos automaticamente ao critério do teste.
A avaliação exige revisão manual de perda de conteúdo, recortes, contraste
não textual e comportamento de hover/foco. A coleta do primeiro gatilho ou
primeiro Tab não cobre todos os componentes nem comprova integralmente
os critérios 1.4.13, 2.4.7 ou 2.4.13.
