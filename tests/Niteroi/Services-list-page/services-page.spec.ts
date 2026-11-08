import { test, expect, chromium, type Worker, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://niteroi360.niteroi.rj.gov.br';
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
  analise: { varredurasExecutadas: number; escopo: 'criterio' | 'geral_complementar';
    estado: string; viewport?: unknown; painelFechado?: boolean; amostraTexto?: unknown };
  resumoAxe: Counts | null; ocorrenciasAxe: Counts | null;
  localizacaoDosAchados: Record<string, unknown>[]; axe: AxeResults | null;
  screenshots: string[]; erros: string[];
  captura?: Record<string, unknown>;
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
        const actual = await surface.evaluate(el => el.scrollTop);
        expect(Math.abs(actual - top), 'A captura deve aguardar a posição de rolagem solicitada').toBeLessThanOrEqual(1);
      }
      // Nome estável: uma nova execução substitui a captura do mesmo cenário.
      const name = `${report.criterio}-niteroi-servicos-pagina-comum-${info.project.name}-${state}-trecho-${index + 1}.png`;
      const file = path.join(ROOT, 'Screenshots', name);
      if (state === 'zoom-nativo-200') {
        const session = await page.context().newCDPSession(page);
        try {
          const capture = await session.send('Page.captureScreenshot', {
            format: 'png', fromSurface: true, captureBeyondViewport: false,
          });
          await writeFile(file, Buffer.from(capture.data, 'base64'));
        } finally { await session.detach(); }
      } else {
        await page.screenshot({ path: file, fullPage: false, timeout: 20_000 });
      }
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
  await expect(page.getByRole('heading', { name: 'Categorias de serviços', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Desenvolvimento Econômico', { exact: true })).toBeVisible({ timeout: 30_000 });
  report.preparacao.catalogo = { secao: 'Categorias de serviços', categoriaConfirmada: 'Desenvolvimento Econômico' };
  report.preparacao.carregamento = await page.evaluate(async () => {
    const body = document.body;
    const surface = body.scrollHeight > body.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(body).overflowY)
      ? body : document.scrollingElement!;
    const limit = Math.min(surface.scrollHeight, 30_000);
    for (let y = 0; y < limit; y += surface.clientHeight) {
      surface.scrollTo({ top: y, behavior: 'instant' });
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    surface.scrollTo({ top: 0, behavior: 'instant' });
    await Promise.all(Array.from(document.images).map(img => Promise.race([
      img.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3000)),
    ])));
    return { imagens: document.images.length, alturaPercorrida: limit, superficieRolagem: surface.tagName,
      imagensNaoCarregadas: Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src) };
  });
  await settle(page);
  await page.locator('body *').evaluateAll(elements => elements.forEach(el => {
    if (el instanceof HTMLElement && el.getClientRects().length &&
      !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName)) {
      el.setAttribute('data-tcc-base-font-family', getComputedStyle(el).fontFamily);
    }
  }));
  report.preparacao.perfil = 'pagina_comum_sem_ajustes_widget';
  report.preparacao.widget = { acionado: false, recursosAssistivosAplicados: false,
    observacao: 'Avaliação autorizada como página comum; não depende da autenticação do Hand Talk.' };
  await verifyPrepared(page, report);
}

async function verifyPrepared(page: Page, report: Report) {
  await expect(page.getByRole('heading', { name: 'Categorias de serviços', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fechar recursos assistivos', exact: true })).toBeHidden();
  const changes = await page.locator('[data-tcc-base-font-family]').evaluateAll(elements => elements
    .filter(el => getComputedStyle(el).fontFamily !== el.getAttribute('data-tcc-base-font-family'))
    .map(el => ({ html: el.outerHTML.slice(0, 300), original: el.getAttribute('data-tcc-base-font-family'),
      atual: getComputedStyle(el).fontFamily })));
  report.preparacao.verificacaoFamiliasDeFonte = {
    elementosMedidos: await page.locator('[data-tcc-base-font-family]').count(), alteracoes: changes };
  expect(changes, 'Os cenários devem preservar as famílias de fonte originais').toEqual([]);
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

async function prepareResize(page: Page, report: Report, worker: Worker) {
  const metrics = () => page.evaluate(() => ({ larguraCss: innerWidth, alturaCss: innerHeight,
    devicePixelRatio, escalaVisual: visualViewport?.scale }));
  expect(await worker.evaluate('nativeZoom()')).toBe(1);
  const before = await metrics();
  expect(await worker.evaluate('nativeZoom(2)')).toBe(2);
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBeCloseTo(before.devicePixelRatio * 2, 2);
  await settle(page);
  const after = await metrics();
  expect(after.larguraCss).toBeCloseTo(before.larguraCss / 2, 0);
  expect(after.escalaVisual).toBe(1);
  report.preparacao.redimensionamento = { metodo: 'zoom_nativo_chromium_tabs_setZoom', fator: 2,
    zoomNativoExecutado: true, antes: before, depois: after,
    referencia: 'https://www.w3.org/WAI/WCAG22/Techniques/general/G142' };
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
    return { tag: el.tagName, alturaLinhaComputada: s.lineHeight,
      linha: parseFloat(s.lineHeight) / size, letras: parseFloat(s.letterSpacing) / size,
      palavras: parseFloat(s.wordSpacing) / size, paragrafo: el.tagName === 'P' ? parseFloat(s.marginBottom) / size : null };
  }));
  expect(values.length).toBeGreaterThan(0);
  // O select nativo do Chromium pode retornar line-height: normal mesmo com a folha aplicada.
  const nativeSelects = values.filter(v => v.tag === 'SELECT' && v.alturaLinhaComputada === 'normal');
  expect(values.filter(v => !((v.linha >= 1.49 || nativeSelects.includes(v)) && v.letras >= .119 && v.palavras >= .159 &&
    (v.paragrafo === null || v.paragrafo >= 1.99)))).toEqual([]);
  report.preparacao.espacamento = { metodo: 'folha_de_estilo', elementosMedidos: values.length,
    linha: 1.5, paragrafoEm: 2, letrasEm: .12, palavrasEm: .16,
    medicoes: values, controlesNativosSemAlturaDeLinhaNumerica: nativeSelects,
    limitacao: 'Select nativo com line-height normal não confirma numericamente o espaçamento de linha; requer revisão visual.' };
  report.preparacao.layout = await layout(page);
}

async function prepareHover(page: Page, report: Report) {
  // Busca possíveis gatilhos de conteúdo adicional exibido por hover.
  const selector = '[aria-haspopup="true"], [aria-haspopup="menu"], [aria-describedby], [title]:not(iframe):not(script):not(style)';
  const triggers = page.locator(selector);
  for (let i = 0; i < await triggers.count(); i++) {
    const trigger = triggers.nth(i);
    if (!await trigger.isVisible()) continue;
    const before = await page.locator('[role="tooltip"]:visible, [role="menu"]:visible').count();
    await trigger.hover({ timeout: 10_000 });
    await page.waitForTimeout(350);
    report.preparacao.hover = { seletor: selector, indice: i, gatilho: await trigger.evaluate(el => el.outerHTML.slice(0, 600)),
      popupsVisiveisAntes: before,
      popupsVisiveisDepois: await page.locator('[role="tooltip"]:visible, [role="menu"]:visible').count(), esperaMs: 350,
      observacao: 'A detecção por atributos não cobre todos os conteúdos exibidos por CSS ou JavaScript.' };
    return;
  }
  report.preparacao.hover = { seletor: selector, gatilhoVisivelEncontrado: false,
    observacao: 'Nenhum candidato encontrado; a coleta não determina a aplicabilidade ou conformidade do critério 1.4.13.' };
}

async function prepareFocus(page: Page, report: Report) {
  const surface = await scrollingSurface(page);
  await surface.evaluate(el => { el.scrollTo({ top: 0, behavior: 'instant' }); });
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

async function evaluateCriterion(criterion: typeof criteria[number][0], page: Page, info: TestInfo, zoomWorker?: Worker) {
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
      estado: 'catalogo-original-sem-ajustes-widget' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {
    report.preparacao.limitesDaAvaliacao = {
      resultado: 'coleta_de_evidencias_nao_certifica_conformidade',
      criteriosSemRegraAxe: 'varredura_geral_complementar_sem_atribuicao_ao_criterio',
      revisaoManual: 'Validar perdas de conteúdo e funcionalidade, contraste renderizado, hover e indicadores de foco nas capturas e na interação.',
    };
    await prepare(page, report);
    if (criterion === '1.4.4') {
      if (!zoomWorker) throw new Error('Zoom nativo requer Chromium com extensão local.');
      await prepareResize(page, report, zoomWorker);
      report.analise.estado = 'zoom-nativo-200';
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
    const file = path.join(ROOT, 'JSONs', `${criterion}-niteroi-servicos-pagina-comum-${info.project.name}.json`);
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
test('1.4.4 - Resize Text', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'O zoom nativo automatizado usa a API de abas do Chromium; outros motores exigem validação própria.');
  const extension = path.resolve(ROOT, '../../helpers/native-zoom-extension');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 720 },
    args: ['--disable-extensions-except=' + extension, '--load-extension=' + extension],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 30_000 });
    const page = context.pages()[0] || await context.newPage();
    await evaluateCriterion('1.4.4', page, testInfo, worker);
  } finally {
    await context.close();
  }
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
