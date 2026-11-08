import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import axe, { type AxeResults } from 'axe-core';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const URL = 'https://saquarema.colab.re';
const ROOT = __dirname;
const assistiveFeatures = ['Tamanho de Fonte', 'Letras Destacadas',
  'Espaçamento Entre Linhas', 'Espaço entre Letras', 'Destacar Cabeçalho', 'Contraste de Cores'] as const;
const openWidget = (page: Page) => page.getByRole('button', { name: 'Abrir recursos assistivos.', exact: true });
const closeWidget = (page: Page) => page.getByRole('button', { name: 'Fechar recursos assistivos', exact: true });
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
        await surface.evaluate((el, y) => { el.scrollTop = y; }, top);
        await settle(page);
      }
      // Nome estável: uma nova execução substitui a captura do mesmo cenário.
      const name = `${report.criterio}-colab-baixa-visao-${info.project.name}-${state}-trecho-${index + 1}.png`;
      const file = path.join(ROOT, 'Screenshots', name);
      // fullPage não expande corretamente o body com rolagem própria do Colab.
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
      await surface.evaluate((el, y) => { el.scrollTop = y; }, geometry.top);
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

async function textSample(page: Page) {
  return page.getByRole('heading', { name: 'Categorias de serviços', exact: true }).evaluate(el => {
    const s = getComputedStyle(el);
    return { fontePx: parseFloat(s.fontSize), familia: s.fontFamily, peso: Number(s.fontWeight),
      linhaPx: parseFloat(s.lineHeight), letrasPx: parseFloat(s.letterSpacing) || 0 };
  });
}

async function prepareAssistiveResources(page: Page, report: Report) {
  const before = await textSample(page);
  // A base do teste de 200% é anterior ao aumento oferecido pelo widget.
  await page.locator('body *').evaluateAll(elements => elements.forEach(el => {
    if (el instanceof HTMLElement && el.getClientRects().length &&
      !['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName)) {
      const style = getComputedStyle(el);
      const size = parseFloat(style.fontSize);
      if (size > 0) el.setAttribute('data-tcc-base-font-size', String(size));
      el.setAttribute('data-tcc-base-font-family', style.fontFamily);
    }
  }));
  const evidence: Record<string, unknown> = { fornecedor: 'Hand Talk', amostraAntes: before,
    configuracao: 'nivel_maximo_de_cada_recurso', recursos: [] };
  report.preparacao.widgetBaixaVisao = evidence;
  await openWidget(page).click({ timeout: 30_000 });
  const textStyle = page.getByRole('button', { name: /^Ativar Estilo de Texto,/i });
  await expect(textStyle).toBeVisible({ timeout: 60_000 });
  await expect(textStyle).not.toHaveAttribute('selected', 'true');
  evidence.estiloDeTexto = { alterado: false, rotulo: await textStyle.getAttribute('aria-label') };
  for (const feature of assistiveFeatures) {
    const control = page.getByRole('button', { name: new RegExp(`^(Ativar )?${feature}(,| Ativo|$)`, 'i') });
    await expect(control).toHaveAttribute('aria-label', /^Ativar /, { timeout: 60_000 });
    await control.click({ timeout: 10_000 });
    await expect(control).toHaveAttribute('selected', 'true');
    await expect(control).toHaveAttribute('aria-label', /ativo/i);
    let nivel: number | null = null;
    let maximo: number | null = null;
    if (feature !== 'Letras Destacadas' && feature !== 'Destacar Cabeçalho') {
      // O rótulo informa o nível atual e o máximo; não presume três opções.
      const label = await control.getAttribute('aria-label');
      const match = label?.match(/opção\s+(\d+)\s+de\s+(\d+)/i);
      if (!match) throw new Error(`Níveis não identificados em ${feature}: ${label}`);
      nivel = Number(match[1]);
      maximo = Number(match[2]);
      if (nivel < 1 || maximo < nivel || maximo > 20) {
        throw new Error(`Níveis inesperados em ${feature}: ${label}`);
      }
      while (nivel < maximo) {
        await control.click({ timeout: 10_000 });
        nivel += 1;
        await expect(control).toHaveAttribute('aria-label',
          new RegExp(`opção\\s+${nivel}\\s+de\\s+${maximo}(?!\\d)`, 'i'));
      }
      await expect(control).toHaveAttribute('selected', 'true');
      await expect(control).toHaveAttribute('aria-label', /ativo/i);
    }
    (evidence.recursos as unknown[]).push({ recurso: feature, selecionado: true,
      nivelAplicado: nivel, nivelMaximo: maximo,
      rotulo: await control.getAttribute('aria-label') });
  }
  await settle(page);
  const activated = await textSample(page);
  expect(activated.fontePx).toBeGreaterThan(before.fontePx);
  expect(activated.familia).toBe(before.familia);
  expect(activated.peso).toBeGreaterThan(before.peso);
  expect(activated.linhaPx / activated.fontePx).toBeGreaterThan(before.linhaPx / before.fontePx);
  expect(activated.letrasPx).toBeGreaterThan(before.letrasPx);
  const fontChanges = await page.locator('[data-tcc-base-font-family]').evaluateAll(elements =>
    elements.filter(el => getComputedStyle(el).fontFamily !== el.getAttribute('data-tcc-base-font-family'))
      .map(el => ({ html: el.outerHTML.slice(0, 300), original: el.getAttribute('data-tcc-base-font-family'),
        atual: getComputedStyle(el).fontFamily })));
  evidence.verificacaoFamiliasDeFonte = { elementosMedidos: await page.locator('[data-tcc-base-font-family]').count(),
    alteracoes: fontChanges };
  expect(fontChanges, 'A configuração assistiva deve preservar as famílias de fonte originais').toEqual([]);
  await closeWidget(page).click();
  await expect(closeWidget(page)).toBeHidden();
  await expect(openWidget(page)).toBeVisible();
  await settle(page);
  const closed = await textSample(page);
  expect(closed).toEqual(activated);
  // Confirma que os seis recursos continuam ativos e o estilo de texto não foi acionado.
  const controls = await page.getByRole('button', { includeHidden: true }).evaluateAll(buttons =>
    buttons.map(el => ({ rotulo: el.getAttribute('aria-label'), selecionado: el.getAttribute('selected') })));
  for (const feature of assistiveFeatures) {
    const state = controls.find(control => control.rotulo?.toLowerCase().startsWith(feature.toLowerCase()));
    expect(state?.selecionado, `${feature} deve permanecer ativo após fechar o painel`).toBe('true');
  }
  expect(controls.find(control => /^Ativar Estilo de Texto,/i.test(control.rotulo || ''))?.selecionado).not.toBe('true');
  evidence.controlesAposFechar = controls.filter(control =>
    /^(Ativar )?(Tamanho de Fonte|Estilo de Texto|Letras Destacadas|Espaçamento Entre Linhas|Espaço entre Letras|Destacar Cabeçalho|Contraste de Cores)/i.test(control.rotulo || ''));
  Object.assign(evidence, { perfilAplicado: true, painelFechado: true, amostraAtivada: activated,
    amostraAposFechar: closed, verificacao: 'controles_selecionados_e_estilos_computados_de_um_titulo' });
}

async function prepare(page: Page, report: Report) {
  const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  report.preparacao.http = { status: response?.status(), url: page.url() };
  expect(response?.ok(), `A página precisa responder com sucesso (HTTP ${response?.status()})`).toBeTruthy();
  
  // O documento HTML inicial não garante que o catálogo da aplicação esteja pronto.
  await expect(page.getByRole('heading', { name: 'Categorias de serviços', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Desenvolvimento Econômico', { exact: true })).toBeVisible({ timeout: 30_000 });
  report.preparacao.catalogo = { secao: 'Categorias de serviços', categoriaConfirmada: 'Desenvolvimento Econômico' };
  report.preparacao.carregamento = await page.evaluate(async () => {
    const body = document.body;
    const surface = body.scrollHeight > body.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(body).overflowY)
      ? body : document.scrollingElement!;
    const limit = Math.min(surface.scrollHeight, 30_000);
    for (let y = 0; y < limit; y += surface.clientHeight) {
      surface.scrollTop = y;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    surface.scrollTop = 0;
    await Promise.all(Array.from(document.images).map(img => Promise.race([
      img.decode().catch(() => undefined), new Promise(resolve => setTimeout(resolve, 3000)),
    ])));
    return { imagens: document.images.length, alturaPercorrida: limit, superficieRolagem: surface.tagName,
      imagensNaoCarregadas: Array.from(document.images).filter(i => !i.complete || !i.naturalWidth).map(i => i.currentSrc || i.src) };
  });
  await settle(page);
  report.preparacao.acesso = 'direto_a_pagina_alvo';
  report.preparacao.perfil = 'baixa_visao_personalizado_colab';
  await prepareAssistiveResources(page, report);
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
  // Guarda os tamanhos computados antes de alterar ancestrais e descendentes.
  await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-tcc-base-font-size]'));
    const sizes = elements.map(el => Number(el.getAttribute('data-tcc-base-font-size')));
    elements.forEach((el, index) => {
      el.setAttribute('data-tcc-original-font-size', String(sizes[index]));
      el.style.setProperty('font-size', String(sizes[index] * 2) + 'px', 'important');
    });
  });
  await settle(page);
  const values = await page.locator('[data-tcc-original-font-size]').evaluateAll(elements => elements.map(el => ({
    original: Number(el.getAttribute('data-tcc-original-font-size')), atual: parseFloat(getComputedStyle(el).fontSize),
  })));
  expect(values.length).toBeGreaterThan(0);
  expect(values.filter(v => !Number.isFinite(v.atual / v.original) || Math.abs(v.atual / v.original - 2) >= .02)).toEqual([]);
  report.preparacao.redimensionamento = { metodo: 'font_size_inline', fator: 2,
    referencia: 'tamanho_computado_antes_do_widget',
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
      estado: 'baixa-visao-widget-fechado' },
    resumoAxe: null, ocorrenciasAxe: null, localizacaoDosAchados: [], axe: null, screenshots: [], erros: [],
  };

  try {
    await prepare(page, report);
    if (criterion === '1.4.4') {
      await prepareResize(page, report);
      report.analise.estado = 'texto-200-css';
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
      report.analise.estado = 'inspecao-hover-colab';
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
    await expect(closeWidget(page)).toBeHidden();
    await expect(openWidget(page)).toBeVisible();
    report.analise.painelFechado = true;
    report.analise.amostraTexto = await textSample(page);
    report.analise.viewport = page.viewportSize();
    await screenshot(page, info, report, report.analise.estado, !['1.4.13', '2.4.7', '2.4.13'].includes(criterion));
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
    const file = path.join(ROOT, 'JSONs', `${criterion}-saquarema-servicos-colab-baixa-visao-${info.project.name}.json`);
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
