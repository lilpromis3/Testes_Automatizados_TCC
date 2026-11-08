# Testes de acessibilidade de Niterói

Segue a estrutura de Saquarema: dez critérios por página, uma análise axe-core por teste, JSON completo e capturas por trechos da rolagem real. Os testes coletam achados; não falham pela existência de violações, mas falham quando uma precondição ou a coleta não pode ser executada.

Execute na raiz do projeto:

```powershell
npm run test:niteroi
npm run test:niteroi:home
npm run test:niteroi:servicos
npm run test:niteroi:processos
```

- Home: três aumentos de fonte (máximo do widget, +6 px), inverter cores e destacar links. O painel fica fechado durante a coleta.
- Serviços: avaliação do Niterói 360 como página comum, sem abrir ou ativar o Hand Talk. O catálogo deve estar carregado, e as famílias de fonte originais são verificadas antes da análise. O widget permanece no DOM como disponibilizado pelo site.
- Processos: clicar em Localizar Processo e confirmar número, ano e Pesquisar visíveis antes de cada análise. A pesquisa não é enviada. A varredura abrange a página com o formulário aberto.

Em 1.4.4, a home segue o método de Saquarema de redimensionamento de texto para 200% do tamanho anterior ao widget, registrado no JSON como alteração de font-size. Serviços e processos usam zoom nativo de 200% com a extensão local de Chromium, conforme a técnica [G142](https://www.w3.org/WAI/WCAG22/Techniques/general/G142). O cenário de zoom nativo é ignorado nos outros motores.

Em 1.4.10 o viewport passa a 320 px. Em 1.4.12 são aplicados simultaneamente os quatro valores de [espaçamento da WCAG](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): linha 1,5, parágrafo 2em, letras 0,12em e palavras 0,16em, preservando a família de fonte. Esses ajustes são condições do teste; não corrigem o site.

Os critérios sem regra axe associada recebem uma varredura geral complementar, identificada no JSON. Ausência de violações não certifica conformidade. Perda de conteúdo ou funcionalidade, contraste visual (especialmente com filtros de inversão), hover e aparência do foco precisam de revisão manual. O cenário de foco registra o primeiro Tab; não cobre toda a navegação.

Cada pasta contém JSONs e Screenshots. Os nomes estáveis substituem o mesmo cenário em novas execuções; apenas capturas listadas no JSON atual pertencem à coleta vigente.

Na tentativa inicial, o Hand Talk do Niterói 360 exibiu “Plugin indisponível — Ops! Site sem Hand Talk Plugin.” Os JSONs e as capturas dessa tentativa foram preservados em `Services-list-page/Historico-widget-indisponivel`. O usuário autorizou a avaliação como página comum; a suíte atual não exige os recursos do widget e usa nomes com `niteroi-servicos-pagina-comum` para identificar a nova coleta.

O diagnóstico histórico confirmou que `https://translation-v3.handtalk.me/api/v2/addons/auth` respondeu HTTP 401 com a mensagem “Token não autorizado.” em Niterói, enquanto o mesmo navegador recebeu HTTP 200 e abriu os controles em Saquarema. Para repetir a comparação: `node scripts/diagnostico-handtalk.cjs`. Essa autenticação não é precondição da suíte atual de serviços.

No formulário de processos, o select nativo de ano do Chromium retorna `line-height: normal` mesmo após a aplicação da folha de espaçamento. O JSON registra essa limitação e as medições; o espaçamento de linha desse controle exige revisão visual. As capturas de processos usam rolagem instantânea e confirmam cada posição para evitar capturar a rolagem suave ainda em andamento.

Antes das capturas de processos, a suíte aguarda o título digitado por JavaScript ficar completo e as animações finitas de entrada dos elementos visíveis terminarem, incluindo `fadeInUp`. Os controles do formulário são trazidos à vista e precisam atingir opacidade 1 antes da coleta. Cada trecho registra o estado do título e dos controles no JSON; os cenários de página completa incluem também uma captura com sufixo `formulario`, alinhada ao início dos campos. O cenário de zoom mantém o zoom nativo e pode precisar de mais de uma captura para um formulário maior que o viewport.
