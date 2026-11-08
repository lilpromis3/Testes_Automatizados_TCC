# Home de Saquarema: uma varredura por teste

Na raiz do repositório:

```powershell
npm run test:saquarema
npm run relatorio:saquarema
```

Cada teste acessa a home, abre o widget, ativa o perfil `vision` e fecha o painel. Depois prepara a condição específica do critério e executa **uma única chamada ao axe-core**, com o painel fechado. Não há varredura do painel aberto nem comparação entre várias análises no mesmo teste.

## Preparação da análise única

| Critério | Condição no momento da varredura |
| --- | --- |
| 1.1.1 e 1.4.3 | Perfil de baixa visão ativo e painel fechado |
| 1.4.4 | Texto a 200% do tamanho original por font-size, com o perfil ativo |
| 1.4.10 | Viewport de 320 × 720 CSS px |
| 1.4.11 | Página com o perfil ativo; inventário das cores de componentes |
| 1.4.12 | Quatro espaçamentos aplicados simultaneamente por uma folha de estilo |
| 1.4.13 | Hover no primeiro gatilho de submenu visível encontrado |
| 2.4.6 | Página com o perfil ativo; inventário de títulos, rótulos e controles |
| 2.4.7 e 2.4.13 | Primeiro elemento alcançado por Tab após reiniciar o foco no início da página |

Os dados de preparação e uma captura de tela são registrados antes da varredura. Quando existem regras associadas à tag consultada, elas são selecionadas. Quando não existem, é feita uma análise geral complementar do axe, identificada como tal; seus achados não são atribuídos ao critério que dá nome ao teste.

## JSON simplificado

O arquivo `JSONs/<criterio>-saquarema-home-<navegador>.json` é substituído a cada execução. Ele contém:

- `analise`: estado, escopo, confirmação de painel fechado e número de varreduras (1 quando concluída).
- `resumoAxe`: quantidade de regras em `violations`, `passes`, `incomplete` e `inapplicable` dessa única análise.
- `ocorrenciasAxe`: quantidade de elementos em `nodes` de cada categoria.
- `localizacaoDosAchados`: seletor, HTML, regra, motivo e referência de cada `violation` e `incomplete`.
- `axe`: resultado original completo da biblioteca.
- Preparação, versões, capturas e eventuais erros.

Não há somas de estados, pares distintos, array de cenários nem dois resumos de contagens. O escopo da análise continua explícito. Por exemplo, uma regra aprovada em seis elementos aparece como `passes: 1` em `resumoAxe` e `passes: 6` em `ocorrenciasAxe`.

`statusExecucao: coleta_concluida` informa que a preparação e a análise terminaram. Em caso de erro anterior à análise, o número de varreduras é zero e as contagens ficam `null`, sem simular um resultado do axe. O arquivo de erro também substitui o relatório anterior.

O relatório visual fica em `Relatorios/index.html`. Ele mostra uma linha por teste com as quatro categorias e permite consultar os achados e abrir os JSONs e capturas. As capturas atuais estão listadas em cada JSON; capturas de rodadas antigas podem permanecer em `Screenshots`.

A preparação de 1.4.12 usa uma folha de estilo em vez de atributos inline `!important`. Assim, a única varredura pode manter `avoid-inline-spacing` ativa, sem criar artificialmente o padrão que essa regra procura.

Consulte [LIMITACOES.md](LIMITACOES.md) para o alcance desta versão simplificada.
