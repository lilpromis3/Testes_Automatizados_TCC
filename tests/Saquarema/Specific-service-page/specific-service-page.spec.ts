import { test, expect, chromium, type Worker, type Page, type Frame, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://egov.saquarema.rj.gov.br';
const ROOT = __dirname;
const FORM_PATH = ['#myIframe', 'iframe[name="mainform"]', 'body'];
function serviceFrame(page: Page) {
  const frame = page.frames().find(f => f.url().includes('/adm/openform.do?') && /[?&]formID=7175(?:&|$)/.test(f.url()));
  if (!frame) throw new Error('O iframe do formulário de consulta de documentos não foi carregado.');
  return frame;
}
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
    estado: string; viewport?: unknown; verificacaoCriterio?: string };
  resumoAxe: Counts | null; ocorrenciasAxe: Counts | null;
  localizacaoDosAchados: Record<string, unknown>[]; axe: AxeResults | null;
  screenshots: string[]; erros: string[];
  captura?: Record<string, unknown>;
};

test.use({ viewport: { width: 1280, height: 720 } });
test.describe.configure({ mode: 'default', timeout: 180_000 });

async function settle(page: Page | Frame) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await Promise.race([
      Promise.all(document.getAnimations().filter(a => a instanceof CSSTransition).map(a => a.finished.catch(() => undefined))),
      new Promise(resolve => setTimeout(resolve, 2000)),
    ]);
  });
}

async function screenshot(page: Page, info: TestInfo, report: Report, state: string, allSections: boolean) {
  if (state === 'zoom-nativo-200') return screenshotZoom(page, info, report);
  const run = report.inicio.replace(/[:.]/g, '-');
  const iframe = page.locator('#myIframe');
  const frame = page.frames().find(f => f.url().includes('/adm/openform.do?'));
  const surface = frame ? await scrollingSurface(frame) : null;
  const geometry = surface ? await surface.evaluate(el => ({ top: el.scrollTop, height: el.scrollHeight, viewport: el.clientHeight })) : null;
  const maximum = geometry ? Math.max(0, geometry.height - geometry.viewport) : 0;
  const step = geometry ? Math.max(1, Math.floor(geometry.viewport * .85)) : 1;
  const offsets = allSections && geometry ? Array.from(new Set([
    ...Array.from({ length: Math.ceil(Math.min(maximum, 30_000) / step) }, (_, i) => i * step), Math.min(maximum, 30_000),
  ])) : [geometry?.top || 0];
  const sections: Record<string, unknown>[] = [];
  try {
    for (const [index, top] of offsets.entries()) {
      if (allSections && surface && frame) {
        await surface.evaluate((el, y) => { el.scrollTop = y; }, top);
        await settle(frame);
      }
      const name = report.criterio + '-saquarema-protocolo-' + info.project.name + '-' + run + '-' + state + '-trecho-' + (index + 1) + '.png';
      const file = path.join(ROOT, 'Screenshots', name);
      // Captura o iframe visível, sem tentar expandir o conteúdo interno com fullPage.
      if (await iframe.isVisible() && allSections) await iframe.screenshot({ path: file, timeout: 20_000 });
      else await page.screenshot({ path: file, fullPage: false, timeout: 20_000 });
      report.screenshots.push('Screenshots/' + name);
      sections.push({ arquivo: 'Screenshots/' + name, scrollTop: top });
      await info.attach(name, { path: file, contentType: 'image/png' });
    }
    report.captura = { metodo: allSections ? 'iframe_por_trechos_da_rolagem_interna' : 'viewport_estado_interacao_ou_erro',
      geometria: geometry, trechos: sections };
  } finally {
    if (allSections && surface && geometry && frame) {
      await surface.evaluate((el, y) => { el.scrollTop = y; }, geometry.top);
      await settle(frame);
    }
  }
}

async function screenshotZoom(page: Page, info: TestInfo, report: Report) {
  const session = await page.context().newCDPSession(page);
  const frame = serviceFrame(page);
  const surface = await scrollingSurface(frame);
  const inner = await surface.evaluate(el => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  const geometry = await page.locator('#myIframe').evaluate(el => {
    const r = el.getBoundingClientRect();
    const nav = document.querySelector('nav')?.getBoundingClientRect().height || 0;
    return { top: r.top + scrollY, height: r.height, available: Math.max(1, innerHeight - nav - 12),
      nav, viewportCss: { width: innerWidth, height: innerHeight }, scroll: scrollY };
  });
  const step = Math.max(1, Math.floor(geometry.available * .85));
  const positions = (maximum: number) => Array.from(new Set([
    ...Array.from({ length: Math.ceil(Math.min(maximum, 30_000) / step) }, (_, i) => i * step), Math.min(maximum, 30_000),
  ]));
  const sections: Record<string, unknown>[] = [];
  try {
    for (const innerTop of positions(Math.max(0, inner.max))) {
      await surface.evaluate((el, y) => { el.scrollTop = y; }, innerTop);
      for (const offset of positions(Math.max(0, geometry.height - geometry.available))) {
        await page.evaluate(y => scrollTo(0, y), geometry.top - geometry.nav - 6 + offset);
        await settle(frame);
        const run = report.inicio.replace(/[:.]/g, '-');
        const name = `${report.criterio}-saquarema-protocolo-${info.project.name}-${run}-zoom-nativo-200-trecho-${sections.length + 1}.png`;
        const file = path.join(ROOT, 'Screenshots', name);
        // Sem clip: coordenadas de recorte do Playwright ficam incorretas com zoom nativo.
        const capture = await session.send('Page.captureScreenshot', {
          format: 'png', fromSurface: true, captureBeyondViewport: false,
        });
        await writeFile(file, Buffer.from(capture.data, 'base64'));
        report.screenshots.push('Screenshots/' + name);
        sections.push({ arquivo: 'Screenshots/' + name, scrollExterno: await page.evaluate(() => scrollY), scrollInterno: innerTop });
        await info.attach(name, { path: file, contentType: 'image/png' });
      }
    }
    report.captura = { metodo: 'viewports_zoom_nativo_sem_redimensionar_janela', geometria: geometry, trechos: sections };
  } finally {
    await surface.evaluate((el, y) => { el.scrollTop = y; }, inner.top);
    await page.evaluate(y => scrollTo(0, y), geometry.scroll);
    await settle(frame);
    await session.detach();
  }
}

async function scrollingSurface(page: Page | Frame) {
  const tag = await page.evaluate(() => {
    const body = document.body;
    return body.scrollHeight > body.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(body).overflowY)
      ? 'body' : document.scrollingElement?.tagName.toLowerCase() || 'html';
  });
  return page.locator(tag);
}

async function formState(frame: Frame) {
  return {
    unidade: await frame.locator('#WFRInput1136235').inputValue(),
    tipo: await frame.locator('#WFRInput1136236').inputValue(),
    numero: await frame.locator('#WFRInput1136234').inputValue(),
  };
}

async function prepare(page: Page, report: Report) {
  const response = await page.goto(URL, { waitUntil: 'load', timeout: 60_000 });
  report.preparacao.http = { status: response?.status(), url: page.url() };
  expect(response?.ok()).toBeTruthy();
  const notice = page.locator('#myModalIframe');
  // O comunicado é aberto de forma assíncrona após o evento load.
  // Uma consulta imediata a isVisible pode ocorrer antes de sua abertura.
  const noticeVisible = await notice.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (noticeVisible) {
    await notice.getByRole('button', { name: 'Fechar', exact: true }).click({ timeout: 10_000 });
    await expect(notice).toBeHidden();
    await expect(page.locator('.modal-backdrop')).toHaveCount(0);
  }
  report.preparacao.comunicadoFechado = noticeVisible;
  await page.getByText('Consulta de Documentos (Protocolo)', { exact: true }).last().click();
  const nested = page.frameLocator('#myIframe').frameLocator('iframe[name="mainform"]');
  await expect(nested.locator('#WFRInput1136235')).toBeVisible({ timeout: 60_000 });
  const frame = serviceFrame(page);
  // O tutorial automático pode aparecer depois que os campos já estão disponíveis.
  const tour = frame.locator('.introjs-overlay');
  const tourVisible = await tour.waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
  if (tourVisible) {
    await frame.locator('body').press('Escape');
    await expect(tour).toBeHidden();
  }
  report.preparacao.tutorial = { exibido: tourVisible, dispensado: tourVisible, metodo: 'Escape' };
  await frame.locator('#MakerLookup1 button').click({ timeout: 10_000 });
  await frame.locator('#lookupInput li').filter({ hasText: /^1 \| PMS$/ }).click();
  await expect(frame.locator('#WFRInput1136235')).toHaveValue('1 | PMS');
  await expect(frame.locator('#MakerLookup4 .spinner-border')).toBeHidden();
  await frame.locator('#MakerLookup4 button').click({ timeout: 10_000 });
  await frame.locator('#lookupInput li').filter({ hasText: /^1 \| Processo Eletrônico$/ }).click();
  await expect(frame.locator('#WFRInput1136236')).toHaveValue('1 | Processo Eletrônico');
  await expect(frame.locator('#WFRInput1136234')).toHaveValue('');
  await expect(frame.locator('#lookupInput')).toBeHidden();
  report.preparacao.formulario = { ...await formState(frame), url: frame.url(), enviado: false };
  report.preparacao.perfil = 'padrao_sem_ajustes_assistivos';
  report.preparacao.escopo = { caminhoFrames: FORM_PATH, descricao: 'Documento do formulário aberto; exclui o catálogo externo do e-Gov.' };
  await page.locator('#myIframe').scrollIntoViewIfNeeded();
  await settle(frame);
  return frame;
}

async function layout(page: Frame) {
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
      raiz: 'iframe_do_formulario', toleranciaCssPx: 1,
    };
  });
}

async function zoomMetrics(page: Page, frame: Frame) {
  return {
    pagina: await page.evaluate(() => ({ larguraCss: innerWidth, alturaCss: innerHeight,
      devicePixelRatio, escalaVisual: visualViewport?.scale })),
    formulario: await frame.locator('h1').evaluate(el => ({ fonteCssPx: parseFloat(getComputedStyle(el).fontSize),
      larguraCss: innerWidth, alturaCss: innerHeight, devicePixelRatio })),
  };
}

async function prepareResize(page: Page, frame: Frame, report: Report, worker: Worker) {
  expect(await worker.evaluate('nativeZoom()')).toBe(1);
  const before = await zoomMetrics(page, frame);
  expect(await worker.evaluate('nativeZoom(2)')).toBe(2);
  await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBeCloseTo(before.pagina.devicePixelRatio * 2, 2);
  await settle(frame);
  const after = await zoomMetrics(page, frame);
  expect(after.pagina.escalaVisual).toBe(1);
  expect(after.pagina.larguraCss).toBeCloseTo(before.pagina.larguraCss / 2, 0);
  report.preparacao.redimensionamento = { metodo: 'zoom_nativo_chromium_tabs_setZoom', fator: 2,
    zoomNativoExecutado: true, zoomConfirmado: await worker.evaluate('nativeZoom()'),
    antes: before, depois: after, referencia: 'https://www.w3.org/WAI/WCAG22/Techniques/general/G142',
    observacao: 'Zoom da página inteira. O font-size não é alterado pelo teste; media queries do site podem mudar os tamanhos CSS.' };
  report.preparacao.layout = await layout(frame);
}

async function prepareSpacing(frame: Frame, report: Report) {
  // A folha é inserida no documento interno do formulário, não no catálogo.
  // Não cria espaçamento inline !important artificial para avoid-inline-spacing.
  await frame.locator('body *').evaluateAll(elements => elements.forEach(el => {
    if (el instanceof HTMLElement && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName) &&
      el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' &&
      parseFloat(getComputedStyle(el).fontSize) > 0 &&
      (el.textContent?.trim() || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))) {
      const style = getComputedStyle(el);
      el.setAttribute('data-tcc-spacing', '');
      el.setAttribute('data-tcc-spacing-font-family', style.fontFamily);
      el.setAttribute('data-tcc-spacing-font-size', style.fontSize);
    }
  }));
  await frame.addStyleTag({ content: `
    :root:root:root:root:root body [data-tcc-spacing] {
      line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important;
    }
    :root:root:root:root:root body p[data-tcc-spacing] { margin-bottom: 2em !important; }
  ` });
  await settle(frame);
  const values = await frame.locator('[data-tcc-spacing]').evaluateAll(elements => elements.map(el => {
    const s = getComputedStyle(el), size = parseFloat(s.fontSize);
    return { tag: el.tagName, id: el.id, alturaLinhaComputada: s.lineHeight,
      linha: parseFloat(s.lineHeight) / size, letras: parseFloat(s.letterSpacing) / size,
      palavras: parseFloat(s.wordSpacing) / size, paragrafo: el.tagName === 'P' ? parseFloat(s.marginBottom) / size : null,
      familiaPreservada: s.fontFamily === el.getAttribute('data-tcc-spacing-font-family'),
      tamanhoPreservado: s.fontSize === el.getAttribute('data-tcc-spacing-font-size') };
  }));
  expect(values.length).toBeGreaterThan(0);
  const nativeSelects = values.filter(v => v.tag === 'SELECT' && v.alturaLinhaComputada === 'normal');
  report.preparacao.espacamento = { aplicado: true, metodo: 'folha_de_estilo_no_iframe',
    caminhoFrames: FORM_PATH, elementosMedidos: values.length,
    linha: 1.5, paragrafoEm: 2, letrasEm: .12, palavrasEm: .16, medicoes: values,
    paragrafosMedidos: values.filter(v => v.paragrafo !== null).length,
    controlesNativosSemAlturaDeLinhaNumerica: nativeSelects,
    limitacao: nativeSelects.length
      ? 'Select nativo com line-height normal não confirma numericamente o espaçamento de linha; requer revisão visual.'
      : 'A confirmação dos estilos não comprova ausência de recortes, sobreposições ou perda de funcionalidade.' };
  expect(values.filter(v => !((v.linha >= 1.49 || nativeSelects.includes(v)) &&
    v.letras >= .119 && v.palavras >= .159 && (v.paragrafo === null || v.paragrafo >= 1.99)))).toEqual([]);
  expect(values.every(v => v.familiaPreservada && v.tamanhoPreservado),
    'O cenário de espaçamento deve preservar a família e o tamanho de fonte').toBeTruthy();
  report.preparacao.layout = await layout(frame);
}

async function prepareHover(page: Frame, report: Report) {
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

async function prepareFocus(page: Frame, report: Report) {
  const surface = await scrollingSurface(page);
  await surface.evaluate(el => { el.scrollTop = 0; });
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });
  await page.locator('body').press('Tab');
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
    analise: { varredurasExecutadas: 0, escopo: 'criterio', coberturaAxe: rules.length ? 'parcial' : 'sem_regras',
      limitacao: rules.length
        ? 'As regras associadas cobrem apenas parte do critério; ausência de achados não certifica conformidade.'
        : 'Sem regra axe associada ao critério nesta versão. Apenas evidências específicas; avaliação manual necessária.',
      estado: 'formulario-parcialmente-preenchido-padrao' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {
    const frame = await prepare(page, report);
    if (criterion === '1.4.4') {
      if (!zoomWorker) throw new Error('O teste de zoom requer o Chromium com a extensão local de automação.');
      await prepareResize(page, frame, report, zoomWorker);
      report.analise.estado = 'zoom-nativo-200';
    } else if (criterion === '1.4.10') {
      await page.setViewportSize({ width: 320, height: 720 });
      await settle(frame);
      report.preparacao.layout = await layout(frame);
      report.analise.estado = 'reflow-320';
    } else if (criterion === '1.4.12') {
      await prepareSpacing(frame, report);
      report.analise.estado = 'quatro-espacamentos';
      report.analise.verificacaoCriterio = 'preparacao_confirmada_cobertura_axe_parcial';
    } else if (criterion === '1.4.13') {
      await prepareHover(frame, report);
      report.analise.estado = 'hover-formulario';
    } else if (criterion === '2.4.7' || criterion === '2.4.13') {
      await prepareFocus(frame, report);
      report.analise.estado = 'primeiro-tab';
    } else if (criterion === '2.4.6') {
      report.preparacao.titulosERotulos = await frame.locator('h1,h2,h3,h4,h5,h6,label,input,select,textarea,button')
        .evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => ({
          html: el.outerHTML.slice(0, 500), texto: el.textContent?.trim(), ariaLabel: el.getAttribute('aria-label'),
          ariaLabelledby: el.getAttribute('aria-labelledby'),
        })));
    } else if (criterion === '1.4.11') {
      report.preparacao.componentesGraficos = await frame.locator('a,button,input,select,textarea,[role="button"],svg')
        .evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => {
          const s = getComputedStyle(el);
          return { html: el.outerHTML.slice(0, 300), cor: s.color, fundo: s.backgroundColor, borda: s.border, preenchimento: s.fill };
        }));
    }

    await settle(frame);
    expect(await formState(frame)).toEqual({ unidade: '1 | PMS', tipo: '1 | Processo Eletrônico', numero: '' });
    report.analise.viewport = page.viewportSize();
    await screenshot(page, info, report, report.analise.estado, !['1.4.13', '2.4.7', '2.4.13'].includes(criterion));
    if (zoomWorker) {
      expect(await zoomWorker.evaluate('nativeZoom()')).toBe(2);
      report.preparacao.zoomAposCaptura = await zoomMetrics(page, frame);
    }
    // Uma lista vazia não pode cair na análise padrão (geral) do axe.
    if (!rules.length) {
      report.statusExecucao = 'coleta_concluida_sem_cobertura_axe';
      return;
    }
    let builder = new AxeBuilder({ page }).include(FORM_PATH).options({ resultTypes: [...categories] });
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
    const file = path.join(ROOT, 'JSONs', `${criterion}-saquarema-protocolo-${info.project.name}.json`);
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
