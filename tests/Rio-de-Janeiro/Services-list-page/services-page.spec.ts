import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://carioca.rio';
const ROOT = __dirname;
const FONT_FACTOR = Number(process.env.CARIOCA_FONT_FACTOR || '2');
const FONT_REFERENCE = '.TitleMaisBuscados';
const criteria = [
  ['1.1.1', 'Non-text Content'],
  ['1.4.3', 'Contrast (Minimum)'],
  ['1.4.4', 'Resize Text'],
  ['1.4.10', 'Reflow'],
  ['1.4.11', 'Non-text Contrast'],
  ['1.4.12', 'Text Spacing'],
  ['1.4.13', 'Content on Hover or Focus'],
  ['2.4.6', 'Headings and Labels'],
  ['2.4.7', 'Focus Visible'],
  ['2.4.13', 'Focus Appearance'],
] as const;
const categories = ['violations', 'passes', 'incomplete', 'inapplicable'] as const;
type Counts = Record<typeof categories[number], number>;
type Report = {
  criterio: string; nome: string; inicio: string; fim?: string; url: string;
  ambiente: Record<string, unknown>; regrasDisponiveis: string[];
  statusExecucao: string; preparacao: Record<string, unknown>;
  analise: { varredurasExecutadas: number; escopo: 'criterio'; coberturaAxe: 'parcial' | 'sem_regras'; limitacao: string;
    estado: string; viewport?: unknown };
  resumoAxe: Counts | null; ocorrenciasAxe: Counts | null;
  localizacaoDosAchados: Record<string, unknown>[]; axe: AxeResults | null;
  screenshots: string[]; erros: string[];
  captura?: Record<string, unknown>;
};

test.use({ viewport: { width: 1280, height: 720 }, locale: 'pt-BR' });
test.describe.configure({ mode: 'default', timeout: 180_000 });

async function settle(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.race([
      Promise.all(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished.catch(() => undefined))),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  });
}

async function screenshot(page: Page, info: TestInfo, report: Report, state: string, fullPage: boolean) {
  const surface = await scrollingSurface(page);
  const geometry = await surface.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight,
    viewport: el.clientHeight, tag: el.tagName }));
  const maximum = Math.max(0, geometry.height - geometry.viewport);
  const step = Math.max(1, Math.floor(geometry.viewport * .85));
  const offsets = fullPage ? Array.from(new Set([
    ...Array.from({ length: Math.ceil(Math.min(maximum, 30_000) / step) }, (_, i) => i * step),
    Math.min(maximum, 30_000),
  ])) : [geometry.top];
  const sections: Record<string, unknown>[] = [];
  try {
    for (const [index, top] of offsets.entries()) {
      if (fullPage) {
        await surface.evaluate((el, y) => { el.scrollTo({ top: y, behavior: 'instant' }); }, top);
        await settle(page);
        expect(Math.abs(await surface.evaluate(el => el.scrollTop) - top)).toBeLessThanOrEqual(1);
      }
      // Nome estável: uma nova execução substitui a captura do mesmo cenário.
      const name = `${report.criterio}-rio-servicos-carioca-${info.project.name}-${state}-trecho-${index + 1}.png`;
      const file = path.join(ROOT, 'Screenshots', name);
      // Capturas por viewport preservam o estado real de rolagem.
      await page.screenshot({ path: file, fullPage: false, timeout: 20_000 });
      report.screenshots.push(`Screenshots/${name}`);
      sections.push({ arquivo: `Screenshots/${name}`, scrollTop: await surface.evaluate(el => el.scrollTop) });
      await info.attach(name, { path: file, contentType: 'image/png' });
    }
    report.captura = { metodo: 'viewports_por_rolagem_real', superficie: geometry.tag,
      alturaConteudo: geometry.height, alturaViewport: geometry.viewport, trechos: sections,
      cobertura: fullPage ? (maximum <= 30_000 ? 'pagina_completa' : 'limitada_a_30000px') : 'estado_hover_ou_foco_ou_erro' };
  } finally {
    if (fullPage) {
      await surface.evaluate((el, y) => { el.scrollTo({ top: y, behavior: 'instant' }); }, geometry.top);
      await settle(page);
    }
  }
}

async function scrollingSurface(page: Page) {
  const tag = await page.evaluate(() => {
    const body = document.body;
    return body.scrollHeight > body.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(body).overflowY)
      ? 'body' : document.scrollingElement?.tagName.toLowerCase() || 'html';
  });
  return page.locator(tag);
}

async function prepare(page: Page, report: Report) {
  expect(Number.isFinite(FONT_FACTOR) && FONT_FACTOR > 1 && FONT_FACTOR <= 5,
    'CARIOCA_FONT_FACTOR deve ser maior que 1 e no máximo 5').toBeTruthy();
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  report.preparacao.http = { status: response?.status(), url: page.url() };
  expect(response?.ok()).toBeTruthy();
  await expect(page.locator(FONT_REFERENCE + ':visible').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.ListaMaisBuscados a:visible').first()).toBeVisible();
  await settle(page);
  const notice = page.locator('.pum-active');
  const noticeVisible = await notice.first().waitFor({ state: 'visible', timeout: 3000 }).then(() => true, () => false);
  if (noticeVisible) {
    await notice.first().locator('.pum-close').click({ timeout: 10_000 });
    await expect(page.locator('.pum-active')).toHaveCount(0);
  }
  report.preparacao.comunicado = { exibido: noticeVisible, fechadoPeloBotao: noticeVisible };
  await page.locator('body *').evaluateAll(elements => elements.forEach(el => {
    if (el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName) &&
      el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && el.textContent?.trim()) {
      el.setAttribute('data-tcc-base-font-size', String(parseFloat(getComputedStyle(el).fontSize)));
      el.setAttribute('data-tcc-base-font-family', getComputedStyle(el).fontFamily);
    }
  }));
  await page.locator(FONT_REFERENCE).evaluateAll(elements => elements.forEach(el => {
    el.setAttribute('data-tcc-font-reference', String(parseFloat(getComputedStyle(el).fontSize)));
  }));
  const reference = page.locator(FONT_REFERENCE + ':visible').first();
  const original = await reference.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const target = original * FONT_FACTOR;
  let current = original;
  let clicks = 0;
  while (current < target - .01 && clicks < 100) {
    await page.locator('.aumentar-fonte a:visible').first().click({ timeout: 10_000 });
    await settle(page);
    const next = await reference.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(next, 'O botão +A precisa aumentar o texto de referência').toBeGreaterThan(current);
    current = next;
    clicks++;
  }
  expect(current).toBeGreaterThanOrEqual(target - .01);
  report.preparacao.aumentoFonte = { controle: '.aumentar-fonte a', acionamento: 'cliques_reais_no_controle_do_site',
    limiteProgramadoIdentificado: false, cliques: clicks, fatorAlvo: FONT_FACTOR,
    fatorAtingidoNaReferencia: current / original, referencia: 'SERVIÇOS MAIS BUSCADOS',
    criterioDeParada: 'atingir_o_fator_alvo_na_referencia_pois_o_controle_nao_tem_maximo',
    tamanhoOriginalPx: original, tamanhoFinalPx: current,
    escopo: 'Aumento aplicado em todos os cenários; não pressupõe o mesmo fator em todos os elementos.' };
  await verifyPrepared(page, report, true);
}

async function verifyPrepared(page: Page, report: Report, verifyFontFamilies = false) {
  await expect(page.locator('html')).toHaveAttribute('lang', /^pt/i);
  await expect(page.locator('.pum-active')).toHaveCount(0);
  const values = await page.locator(FONT_REFERENCE + ':visible').evaluateAll(elements => elements.map(el => ({
    original: Number(el.getAttribute('data-tcc-font-reference')),
    atual: parseFloat(getComputedStyle(el).fontSize),
  })));
  expect(values.length).toBeGreaterThan(0);
  expect(values.every(v => v.original > 0 && v.atual / v.original >= FONT_FACTOR - .01)).toBeTruthy();
  // Compara a família antes/depois do +A no mesmo viewport. As media queries
  // do portal podem trocar famílias ao preparar o cenário móvel de 320 px.
  if (verifyFontFamilies) {
    const changedFamilies = await page.locator('[data-tcc-base-font-family]').evaluateAll(elements => elements
      .filter(el => getComputedStyle(el).fontFamily !== el.getAttribute('data-tcc-base-font-family'))
      .map(el => el.tagName));
    expect(changedFamilies, 'O aumento deve preservar as famílias de fonte do portal').toEqual([]);
    report.preparacao.familiasDeFontePreservadas = true;
  }
  report.preparacao.fonteAmpliadaConfirmada = true;
  report.preparacao.idioma = await page.evaluate(() => ({ documento: document.documentElement.lang,
    navegador: navigator.language }));
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el =>
      el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    return {
      larguraViewport: innerWidth, larguraDocumento: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1 ||
        document.body.scrollWidth > document.body.clientWidth + 1,
      candidatosRecorte: elements.filter(el => {
        const s = getComputedStyle(el);
        return (['hidden', 'clip'].includes(s.overflowX) && el.scrollWidth > el.clientWidth + 1) ||
          (['hidden', 'clip'].includes(s.overflowY) && el.scrollHeight > el.clientHeight + 1);
      }).map(el => ({ html: el.outerHTML.slice(0, 400), scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight })),
      raiz: 'DOM_principal', toleranciaCssPx: 1,
    };
  });
}

async function prepareResize(page: Page, report: Report) {
  // Mede o aumento nativo solicitado, sem substituir os tamanhos por CSS injetado.
  const values = await page.locator('[data-tcc-base-font-size]').evaluateAll(elements => elements
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
    .map(el => {
      const original = Number(el.getAttribute('data-tcc-base-font-size'));
      const atual = parseFloat(getComputedStyle(el).fontSize);
      return { tag: el.tagName, html: el.outerHTML.slice(0, 300), original, atual, fator: atual / original };
    }));
  report.preparacao.redimensionamento = { metodo: 'controle_nativo_mais_A', fatorAlvoNaReferencia: FONT_FACTOR,
    elementosMedidos: values.length, medicoes: values, elementosAbaixoDoDobro: values.filter(v => v.fator < 1.99).length,
    zoomNativoExecutado: false, fontSizeInjetadoPeloTeste: false,
    limite: 'O controle não tem máximo programado. O fator é definido pelo texto de referência; não equivale a aumento uniforme nem comprova ausência de perdas.' };
  report.preparacao.layout = await layout(page);
}

async function prepareSpacing(page: Page, report: Report) {
  // Folha de estilo, em vez de inline !important: a própria preparação não cria achados de avoid-inline-spacing.
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('body *').forEach(el => {
      if (el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName) &&
        el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) > 0 && el.textContent?.trim()) {
        el.setAttribute('data-tcc-spacing', '');
      }
    });
  });
  await page.addStyleTag({ content: `
    :root:root:root:root:root body [data-tcc-spacing] {
      line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important;
    }
    :root:root:root:root:root body p[data-tcc-spacing] { margin-bottom: 2em !important; }
  ` });
  await settle(page);
  const values = await page.locator('[data-tcc-spacing]').evaluateAll(elements => elements.map(el => {
    const s = getComputedStyle(el), size = parseFloat(s.fontSize);
    return { linha: parseFloat(s.lineHeight) / size, letras: parseFloat(s.letterSpacing) / size,
      palavras: parseFloat(s.wordSpacing) / size, paragrafo: el.tagName === 'P' ? parseFloat(s.marginBottom) / size : null };
  }));
  expect(values.length).toBeGreaterThan(0);
  expect(values.filter(v => !(v.linha >= 1.49 && v.letras >= .119 && v.palavras >= .159 &&
    (v.paragrafo === null || v.paragrafo >= 1.99)))).toEqual([]);
  report.preparacao.espacamento = { metodo: 'folha_de_estilo', elementosMedidos: values.length,
    linha: 1.5, paragrafoEm: 2, letrasEm: .12, palavrasEm: .16 };
  report.preparacao.layout = await layout(page);
}

async function prepareHover(page: Page, report: Report) {
  const menus = page.locator('nav li:has(> ul)');
  for (let i = 0; i < await menus.count(); i++) {
    const trigger = menus.nth(i).locator(':scope > a').first();
    if (!await trigger.isVisible()) continue;
    const popup = menus.nth(i).locator(':scope > ul').first();
    const before = await popup.isVisible();
    await trigger.hover();
    await page.waitForTimeout(350);
    report.preparacao.hover = { seletor: 'nav li:has(> ul)', indice: i, gatilho: await trigger.innerText(),
      visivelAntes: before, visivelNaPreparacao: await popup.isVisible(), esperaMs: 350 };
    return;
  }
  report.preparacao.hover = { seletor: 'nav li:has(> ul)', gatilhoVisivelEncontrado: false };
}

async function prepareFocus(page: Page, report: Report) {
  const surface = await scrollingSurface(page);
  await surface.evaluate(el => { el.scrollTop = 0; });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });
  await page.keyboard.press('Tab');
  await settle(page);
  report.preparacao.foco = await page.evaluate(() => {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
    if (!el || el === document.body) return { elementoAlcancado: false };
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return { elementoAlcancado: true, metodo: 'primeiro_Tab', html: el.outerHTML.slice(0, 600),
      focoVisivelPseudoClasse: el.matches(':focus-visible'), outline: s.outline, boxShadow: s.boxShadow,
      retangulo: { x: r.x, y: r.y, largura: r.width, altura: r.height }, medicaoDePixelsExecutada: false };
  });
}

async function evaluateCriterion(criterion: typeof criteria[number][0], page: Page, info: TestInfo) {
  const [, name] = criteria.find(([id]) => id === criterion)!;
  await mkdir(path.join(ROOT, 'JSONs'), { recursive: true });
  await mkdir(path.join(ROOT, 'Screenshots'), { recursive: true });
  const tag = `wcag${criterion.replace(/\./g, '')}`;
  const rules = axe.getRules([tag]).map(r => r.ruleId);
  const report: Report = {
    criterio: criterion, nome: name, inicio: new Date().toISOString(), url: URL,
    ambiente: { navegador: info.project.name, versaoNavegador: page.context().browser()?.version(),
      axe: axe.version, playwright: require('@playwright/test/package.json').version, tag, retry: info.retry },
    regrasDisponiveis: rules, statusExecucao: 'em_execucao', preparacao: {},
    analise: { varredurasExecutadas: 0, escopo: 'criterio', coberturaAxe: rules.length ? 'parcial' : 'sem_regras',
      limitacao: rules.length
        ? 'As regras associadas cobrem apenas parte do critério; ausência de achados não certifica conformidade.'
        : 'Sem regra axe associada ao critério nesta versão. Apenas evidências específicas; avaliação manual necessária.',
      estado: 'fonte-ampliada-controle-nativo' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {
    report.preparacao.limitesDaAvaliacao = {
      resultado: 'coleta_de_evidencias_nao_certifica_conformidade',
      criteriosSemRegraAxe: 'somente_evidencias_especificas_sem_executar_axe',
      revisaoManual: 'Validar perdas de conteúdo e funcionalidade, contraste renderizado, hover e indicadores de foco nas capturas e na interação.',
    };
    await prepare(page, report);
    if (criterion === '1.4.4') {
      await prepareResize(page, report);
      report.analise.estado = 'texto-ampliado-controle-nativo';
    } else if (criterion === '1.4.10') {
      await page.setViewportSize({ width: 320, height: 720 });
      await settle(page);
      report.preparacao.layout = await layout(page);
      report.analise.estado = 'reflow-320';
    } else if (criterion === '1.4.12') {
      await prepareSpacing(page, report);
      report.analise.estado = 'quatro-espacamentos';
    } else if (criterion === '1.4.13') {
      await prepareHover(page, report);
      report.analise.estado = 'inspecao-hover';
    } else if (criterion === '2.4.7' || criterion === '2.4.13') {
      await prepareFocus(page, report);
      report.analise.estado = 'primeiro-tab';
    } else if (criterion === '2.4.6') {
      report.preparacao.titulosERotulos = await page.locator('h1,h2,h3,h4,h5,h6,label,input,select,textarea,button')
        .evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => ({
          html: el.outerHTML.slice(0, 500), texto: el.textContent?.trim(), ariaLabel: el.getAttribute('aria-label'),
          ariaLabelledby: el.getAttribute('aria-labelledby'),
        })));
    } else if (criterion === '1.4.11') {
      report.preparacao.componentesGraficos = await page.locator('a,button,input,select,textarea,[role="button"],svg')
        .evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
          const s = getComputedStyle(el);
          return { html: el.outerHTML.slice(0, 300), cor: s.color, fundo: s.backgroundColor, borda: s.border, preenchimento: s.fill };
        }));
    }

    await settle(page);
    await verifyPrepared(page, report);
    report.analise.viewport = page.viewportSize();
    await screenshot(page, info, report, report.analise.estado, !['1.4.13', '2.4.7', '2.4.13'].includes(criterion));
    await verifyPrepared(page, report);
    // Uma lista vazia não pode cair na análise padrão (geral) do axe.
    if (!rules.length) {
      report.statusExecucao = 'coleta_concluida_sem_cobertura_axe';
      return;
    }
    let builder = new AxeBuilder({ page }).options({ resultTypes: [...categories] });
    builder = builder.withRules(rules);

    // Única chamada ao axe, restrita às regras associadas ao critério.
    const result = await builder.analyze();
    report.axe = result;
    report.analise.varredurasExecutadas = 1;
    report.resumoAxe = Object.fromEntries(categories.map(category => [category, result[category].length])) as Counts;
    report.ocorrenciasAxe = Object.fromEntries(categories.map(category => [category,
      result[category].reduce((n, rule) => n + rule.nodes.length, 0)])) as Counts;
    report.localizacaoDosAchados = (['violations', 'incomplete'] as const).flatMap(category =>
      result[category].flatMap(rule => rule.nodes.map(node => ({
        categoria: category, regra: rule.id, tagsDaRegra: rule.tags, alvo: node.target, html: node.html,
        mensagem: rule.help, impacto: node.impact || rule.impact,
        motivo: node.failureSummary || [...node.any, ...node.all, ...node.none].map(check => check.message).join('\n'),
        helpUrl: rule.helpUrl,
      }))));
    report.statusExecucao = 'coleta_concluida';
  } catch (error) {
    report.statusExecucao = 'erro_de_execucao_ou_precondicao';
    report.erros.push(error instanceof Error ? error.stack || error.message : String(error));
    if (!page.isClosed()) await screenshot(page, info, report, 'erro', false).catch(e => report.erros.push(String(e)));
    throw error;
  } finally {
    report.fim = new Date().toISOString();
    const file = path.join(ROOT, 'JSONs', `${criterion}-rio-servicos-carioca-${info.project.name}.json`);
    const temporary = `${file}.tmp-${info.workerIndex}-${info.retry}`;
    await writeFile(temporary, JSON.stringify(report, null, 2), 'utf8');
    await rename(temporary, file);
    await info.attach(`WCAG-${criterion}`, { path: file, contentType: 'application/json' });
    console.log(`WCAG ${criterion}: ${report.statusExecucao} | ${report.analise.varredurasExecutadas} varredura | ${report.analise.escopo}`);
    console.log(JSON.stringify(report.resumoAxe));
  }
}

test('1.1.1 - Non-text Content', async ({ page }, testInfo) => {
  await evaluateCriterion('1.1.1', page, testInfo);
});
test('1.4.3 - Contrast (Minimum)', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.3', page, testInfo);
});
test('1.4.4 - Resize Text', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.4', page, testInfo);
});
test('1.4.10 - Reflow', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.10', page, testInfo);
});
test('1.4.11 - Non-text Contrast', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.11', page, testInfo);
});
test('1.4.12 - Text Spacing', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.12', page, testInfo);
});
test('1.4.13 - Content on Hover or Focus', async ({ page }, testInfo) => {
  await evaluateCriterion('1.4.13', page, testInfo);
});
test('2.4.6 - Headings and Labels', async ({ page }, testInfo) => {
  await evaluateCriterion('2.4.6', page, testInfo);
});
test('2.4.7 - Focus Visible', async ({ page }, testInfo) => {
  await evaluateCriterion('2.4.7', page, testInfo);
});
test('2.4.13 - Focus Appearance', async ({ page }, testInfo) => {
  await evaluateCriterion('2.4.13', page, testInfo);
});
