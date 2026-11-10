import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://prefeitura.rio';
const ROOT = __dirname;
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
    estado: string; viewport?: unknown; painelFechado?: boolean; amostraTexto?: unknown };
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
      const name = `${report.criterio}-rio-home-${info.project.name}-${state}-trecho-${index + 1}.png`;
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
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  report.preparacao.http = { status: response?.status(), url: page.url() };
  expect(response?.ok()).toBeTruthy();
  await settle(page);
  await page.locator('#pojo-a11y-toolbar .pojo-a11y-toolbar-toggle-link').waitFor();
  const rejectCookies = page.locator('[data-cky-tag="reject-button"]');
  if (await rejectCookies.isVisible()) {
    await rejectCookies.click();
    await expect(rejectCookies).toBeHidden();
    report.preparacao.cookies = 'nao_essenciais_rejeitados_pelo_botao_do_banner';
  } else report.preparacao.cookies = 'banner_nao_visivel';
  await page.locator('body *').evaluateAll(elements => elements.forEach(el => {
    if (el instanceof HTMLElement && !el.closest('#pojo-a11y-toolbar') && el.getClientRects().length &&
      parseFloat(getComputedStyle(el).fontSize) > 0 && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName)) {
      el.setAttribute('data-tcc-base-font-size', String(parseFloat(getComputedStyle(el).fontSize)));
    }
  }));
  const widget = page.locator('#pojo-a11y-toolbar');
  await widget.locator('.pojo-a11y-toolbar-toggle-link').click();
  await expect(widget).toHaveClass(/pojo-a11y-toolbar-open/);
  await widget.locator('[data-action="reset"]').click();
  // Configura os toggles antes de ampliar: no máximo, o próprio painel cresce
  // e os controles inferiores ficam fora do viewport ou sob o tradutor.
  for (const action of ['high-contrast', 'links-underline', 'readable-font']) {
    await widget.locator(`[data-action="${action}"]`).click({ timeout: 10_000 });
    await expect(widget.locator(`[data-action="${action}"]`)).toHaveClass(/\bactive\b/);
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\bpojo-a11y-${action}\\b`));
  }
  const levels: number[] = [];
  for (let level = 130; level <= 200; level += 10) {
    await widget.locator('[data-action="resize-plus"]').click();
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\bpojo-a11y-resize-font-${level}\\b`));
    levels.push(level);
    await settle(page);
  }
  const sizes = () => page.locator('[data-tcc-base-font-size]').evaluateAll(es => es
    .filter(el => el.getClientRects().length)
    .map(el => ({ tag: el.tagName, original: Number(el.getAttribute('data-tcc-base-font-size')),
      atual: parseFloat(getComputedStyle(el).fontSize) })));
  const maximum = await sizes();
  expect(maximum.length).toBeGreaterThan(0);
  expect(maximum.some(v => v.atual > v.original)).toBeTruthy();
  const storedLevel = () => page.evaluate(() => JSON.parse(localStorage.getItem('pojo-a11y') || '{}').variables?.currentFontSize);
  expect(await storedLevel()).toBe(200);
  await widget.locator('[data-action="resize-plus"]').click();
  await settle(page);
  await expect(page.locator('body')).toHaveClass(/\bpojo-a11y-resize-font-200\b/);
  expect(await storedLevel()).toBe(200);
  await widget.locator('.pojo-a11y-toolbar-toggle-link').click();
  await settle(page);
  report.preparacao.widgetBaixaVisao = { fornecedor: 'Pojo Accessibility', niveisAposCadaClique: levels,
    nivelFonte: 200, cliquesParaMaximo: 8, maximoConfirmadoPorCliqueAdicional: true,
    verificacaoMaximo: 'classe_e_nivel_persistido_iguais_a_200_antes_e_depois_do_clique_adicional',
    ordem: ['high-contrast', 'links-underline', 'readable-font', 'resize-plus_8_vezes', 'resize-plus_confirmacao', 'fechar_painel'],
    altoContraste: true, linksSublinhados: true, fonteLegivel: true,
    ...(report.criterio === '1.4.4' ? { tamanhosNoMaximo: maximum } : {}),
    observacao: 'Nível 200 do widget não equivale necessariamente a 200% do tamanho original em todos os elementos; o CSS usa percentuais herdados.' };
  await verifyPrepared(page, report);
}

async function verifyPrepared(page: Page, report: Report) {
  await expect(page.locator('html')).toHaveAttribute('lang', /^pt/i);
  report.preparacao.idioma = await page.evaluate(() => ({ documento: document.documentElement.lang,
    navegador: navigator.language }));
  await expect(page.locator('#pojo-a11y-toolbar')).not.toHaveClass(/pojo-a11y-toolbar-open/);
  for (const state of ['resize-font-200', 'high-contrast', 'links-underline', 'readable-font']) {
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\bpojo-a11y-${state}\\b`));
  }
  const sample = await page.locator('h1,h2,p,a').evaluateAll(es => es
    .filter(el => !el.closest('#pojo-a11y-toolbar') && el.getClientRects().length && el.textContent?.trim())
    .slice(0, 40).map(el => {
      const s = getComputedStyle(el);
      return { tag: el.tagName, texto: el.textContent?.trim().slice(0, 120), fonte: s.fontFamily,
        tamanho: s.fontSize, cor: s.color, fundo: s.backgroundColor, sublinhado: s.textDecorationLine };
    }));
  expect(sample.length).toBeGreaterThan(0);
  expect(sample.every(s => s.fonte.toLowerCase().includes('verdana'))).toBeTruthy();
  expect(sample.filter(s => s.tag === 'A').every(s => s.sublinhado.includes('underline'))).toBeTruthy();
  // O inventário de estilos interessa ao contraste; nos outros critérios,
  // a amostra serve apenas para verificar internamente a preparação do widget.
  if (['1.4.3', '1.4.11'].includes(report.criterio)) report.analise.amostraTexto = sample;
  report.analise.painelFechado = true;
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
  // Preserva o aumento máximo solicitado, sem substituí-lo por font-size injetado.
  const values = await page.locator('[data-tcc-base-font-size]').evaluateAll(elements => elements
    .filter(el => el.getClientRects().length && el.textContent?.trim()).map(el => {
      const original = Number(el.getAttribute('data-tcc-base-font-size'));
      const atual = parseFloat(getComputedStyle(el).fontSize);
      return { tag: el.tagName, html: el.outerHTML.slice(0, 300), original, atual, fator: atual / original };
    }));
  expect(values.length).toBeGreaterThan(0);
  report.preparacao.redimensionamento = { metodo: 'widget_nativo_no_maximo', nivelWidget: 200,
    referencia: 'tamanho_computado_antes_do_widget',
    elementosMedidos: values.length, medicoes: values,
    elementosAbaixoDoDobro: values.filter(v => v.fator < 1.99).length,
    zoomNativoExecutado: false, fontSizeInjetado: false,
    limite: 'Avalia a condição solicitada do widget; não comprova ampliação uniforme de 200% nem ausência de perdas.' };
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
        : 'Sem regra axe associada ao critério nesta versão. A acessibilidade deste critério não foi verificada nesta avaliação automatizada.',
      estado: 'baixa-visao-widget-fechado' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {

    if (!rules.length) {
      report.statusExecucao = 'nao_avaliado_sem_regra_axe';
      report.analise.estado = 'nao_avaliado';
      info.skip(true, report.analise.limitacao);
    }
    report.preparacao.limitesDaAvaliacao = {
      resultado: 'coleta_de_evidencias_nao_certifica_conformidade',
      criteriosSemRegraAxe: 'nao_avaliados_sem_varredura_axe_ou_verificacao_playwright',
      revisaoManual: 'A avaliação manual está fora do escopo desta suíte; ausência de achados não certifica conformidade.',
    };
    await prepare(page, report);
    if (criterion === '1.4.4') {
      await prepareResize(page, report);
      report.analise.estado = 'texto-maximo-widget';
    } else if (criterion === '1.4.12') {
      await prepareSpacing(page, report);
      report.analise.estado = 'quatro-espacamentos';
    }

    await settle(page);
    await verifyPrepared(page, report);
    report.analise.viewport = page.viewportSize();
    await screenshot(page, info, report, report.analise.estado, true);
    await verifyPrepared(page, report);
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
    // O skip mantém o registro de não avaliação e segue para o finally.
    if (!rules.length) throw error;
    report.statusExecucao = 'erro_de_execucao_ou_precondicao';
    report.erros.push(error instanceof Error ? error.stack || error.message : String(error));
    if (!page.isClosed()) await screenshot(page, info, report, 'erro', false).catch(e => report.erros.push(String(e)));
    throw error;
  } finally {
    report.fim = new Date().toISOString();
    const file = path.join(ROOT, 'JSONs', `${criterion}-rio-home-${info.project.name}.json`);
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
