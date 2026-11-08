import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://www.saquarema.rj.gov.br';
const ROOT = __dirname;
const WIDGET = '#real-accessibility';
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
  analise: { varredurasExecutadas: number; escopo: 'criterio' | 'geral_complementar';
    estado: string; viewport?: unknown; widget?: unknown; painelFechado?: boolean };
  resumoAxe: Counts | null; ocorrenciasAxe: Counts | null;
  localizacaoDosAchados: Record<string, unknown>[]; axe: AxeResults | null;
  screenshots: string[]; erros: string[];
};

test.use({ viewport: { width: 1280, height: 720 } });
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

async function widgetState(page: Page) {
  return page.evaluate(() => {
    const shadow = document.querySelector('#real-accessibility')?.shadowRoot;
    return {
      preferencias: JSON.parse(localStorage.getItem('realAccessibility') || 'null'),
      classes: document.documentElement.className,
      painelAberto: shadow?.querySelector('[data-act="fab"]')?.getAttribute('aria-expanded') === 'true',
    };
  });
}

async function screenshot(page: Page, info: TestInfo, report: Report, state: string, fullPage: boolean) {
  const run = report.inicio.replace(/[:.]/g, '-');
  const name = `${report.criterio}-${info.project.name}-${run}-${state}.png`;
  const file = path.join(ROOT, 'Screenshots', name);
  await page.screenshot({ path: file, fullPage, timeout: 20_000 });
  report.screenshots.push(`Screenshots/${name}`);
  await info.attach(name, { path: file, contentType: 'image/png' });
}

async function prepare(page: Page, report: Report) {
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  report.preparacao.http = { status: response?.status(), url: page.url() };
  expect(response?.ok(), `A página precisa responder com sucesso (HTTP ${response?.status()})`).toBeTruthy();
  report.preparacao.carregamento = await page.evaluate(async () => {
    const limit = Math.min(document.documentElement.scrollHeight, 30_000);
    for (let y = 0; y < limit; y += innerHeight) {
      scrollTo(0, y);
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    scrollTo(0, 0);
    await Promise.all(Array.from(document.images).map(img => Promise.race([
      img.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3000)),
    ])));
    return { imagens: document.images.length, alturaPercorrida: limit,
      imagensNaoCarregadas: Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src) };
  });
  await page.locator(`${WIDGET} [data-act="fab"]`).click({ timeout: 30_000 });
  const profile = page.locator(`${WIDGET} [data-act="profile"][data-key="vision"]`);
  await profile.click();
  await expect(profile).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveClass(/ra-c-high/);
  await expect.poll(async () => (await widgetState(page)).preferencias?.profile).toBe('vision');
  await settle(page);
  await page.locator(`${WIDGET} button[data-act="close"]`).click();
  await expect(page.locator(`${WIDGET} [data-act="fab"]`)).toHaveAttribute('aria-expanded', 'false');
  await settle(page);
  report.preparacao.perfil = 'vision';
}

async function layout(page: Page) {
  return page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('body *')).filter(el =>
      el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    return {
      larguraViewport: innerWidth, larguraDocumento: document.documentElement.scrollWidth,
      rolagemHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
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
  await page.evaluate(() => {
    document.querySelectorAll<HTMLElement>('[data-ra-fs]').forEach(el => {
      el.style.setProperty('font-size', `${Number(el.dataset.raFs) * 2}px`, 'important');
    });
  });
  await settle(page);
  const values = await page.locator('[data-ra-fs]').evaluateAll(elements => elements.map(el => ({
    original: Number(el.getAttribute('data-ra-fs')), atual: parseFloat(getComputedStyle(el).fontSize),
  })));
  expect(values.length).toBeGreaterThan(0);
  expect(values.filter(v => !Number.isFinite(v.atual / v.original) || Math.abs(v.atual / v.original - 2) >= .02)).toEqual([]);
  report.preparacao.redimensionamento = { metodo: 'font_size_inline', fator: 2,
    elementosMedidos: values.length, zoomNativoExecutado: false };
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
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
    scrollTo(0, 0);
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
    analise: { varredurasExecutadas: 0, escopo: rules.length ? 'criterio' : 'geral_complementar',
      estado: 'perfil-baixa-visao-widget-fechado' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {
    await prepare(page, report);
    if (criterion === '1.4.4') {
      await prepareResize(page, report);
      report.analise.estado = 'texto-200-css-widget-fechado';
    } else if (criterion === '1.4.10') {
      await page.setViewportSize({ width: 320, height: 720 });
      await settle(page);
      report.preparacao.layout = await layout(page);
      report.analise.estado = 'reflow-320-widget-fechado';
    } else if (criterion === '1.4.12') {
      await prepareSpacing(page, report);
      report.analise.estado = 'quatro-espacamentos-widget-fechado';
    } else if (criterion === '1.4.13') {
      await prepareHover(page, report);
      report.analise.estado = 'primeiro-submenu-visivel-hover-widget-fechado';
    } else if (criterion === '2.4.7' || criterion === '2.4.13') {
      await prepareFocus(page, report);
      report.analise.estado = 'primeiro-tab-widget-fechado';
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
    await expect(page.locator(`${WIDGET} [data-act="fab"]`)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`${WIDGET} .ra-open`)).toHaveCount(0);
    report.analise.painelFechado = true;
    report.analise.viewport = page.viewportSize();
    report.analise.widget = await widgetState(page);
    await screenshot(page, info, report, report.analise.estado, !['1.4.13', '2.4.7', '2.4.13'].includes(criterion));
    let builder = new AxeBuilder({ page }).options({ resultTypes: [...categories] });
    if (rules.length) builder = builder.withRules(rules);

    // Única chamada de análise do axe-core em cada teste.
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
    const file = path.join(ROOT, 'JSONs', `${criterion}-saquarema-home-${info.project.name}.json`);
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
