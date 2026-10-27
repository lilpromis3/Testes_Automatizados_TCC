import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

test('1.1.1 - Non-text Content', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag111'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.1.1 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        // Exibe o motivo/resumo da falha para o elemento do HTML
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  // Anexa o relatório detalhado como um arquivo JSON no relatório do Playwright
  await testInfo.attach('relatorio-wcag-111', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.3 - Contrast (Minimum)', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag143'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.3 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        // Exibe o motivo/resumo da falha para o elemento do HTML
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  // Anexa o relatório detalhado como um arquivo JSON no relatório do Playwright
  await testInfo.attach('relatorio-wcag-143', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.4 - Resize Text', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br', { waitUntil: 'domcontentloaded' });

  // Aumento de texto/layout para 200% conforme exigido pelo critério 1.4.4
  await page.evaluate(() => {
    document.body.style.zoom = '200%';
  });

  await page.waitForTimeout(500);

  // Captura de tela da página ampliada a 200%
  const screenshotBuffer = await page.screenshot({ fullPage: true });

  await page.screenshot({ 
    path: 'evidencias/zoom-200-rio-das-ostras.png', 
    fullPage: true 
  });

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag144'])
    .analyze();

  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.4 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }

  await testInfo.attach('relatorio-wcag-144', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.10 - Reflow', async ({ page }, testInfo) => {
  // viewport específica de 320px exigida pelo critério 1.4.10
  await page.setViewportSize({ width: 320, height: 720 });

  await page.goto('https://www.riodasostras.rj.gov.br', { waitUntil: 'domcontentloaded' });

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag1410'])
    .analyze();

  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.10 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }

  await testInfo.attach('relatorio-wcag-1410', {
    body: JSON.stringify(violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.11 - Non-text Contrast', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag1411'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.11 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        // Exibe o motivo/resumo da falha para o elemento do HTML
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  // Anexa o relatório detalhado como um arquivo JSON no relatório do Playwright
  await testInfo.attach('relatorio-wcag-1411', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.12 - Text Spacing', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag1412'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.12 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        // Exibe o motivo/resumo da falha para o elemento do HTML
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  // Anexa o relatório detalhado como um arquivo JSON no relatório do Playwright
  await testInfo.attach('relatorio-wcag-1412', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('1.4.13 - Content on Hover or Focus', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag1413'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 1.4.13 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        // Exibe o motivo/resumo da falha para o elemento do HTML
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  // Anexa o relatório detalhado como um arquivo JSON no relatório do Playwright
  await testInfo.attach('relatorio-wcag-1413', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('2.4.6 - Headings and Labels', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag246'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 2.4.6 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  await testInfo.attach('relatorio-wcag-246', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});

test('2.4.7 - Focus Visible', async ({ page }, testInfo) => {
  await page.goto('https://www.riodasostras.rj.gov.br');

  const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags([
        'wcag247'
      ])
      .analyze();
  
  const violations = accessibilityScanResults.violations;

  console.log(`\n======================================================`);
  console.log(` RELATÓRIO DETALHADO 2.4.7 - RIO DAS OSTRAS`);
  console.log(`======================================================`);

  if (violations.length === 0) {
    console.log('Nenhuma violação encontrada!');
  } else {
    violations.forEach((violation, ruleIndex) => {
      console.log(`\n Regra #${ruleIndex + 1}: ${violation.id} (${violation.impact?.toUpperCase()})`);
      console.log(`   Descrição: ${violation.help}`);
      console.log(`   Saiba mais: ${violation.helpUrl}`);
      console.log(`   Total de ocorrências: ${violation.nodes.length}\n`);

      console.log(`   --- ELEMENTOS AFETADOS ---`);
      
      violation.nodes.forEach((node, nodeIndex) => {
        console.log(`   [${nodeIndex + 1}] Seletor CSS: ${node.target.join(' > ')}`);
        console.log(`       HTML: ${node.html}`);
        
        const failureMotive = node.failureSummary?.replace(/\n/g, '\n       ') ?? 'Sem resumo disponível.';
        console.log(`       Motivo: ${failureMotive}`);
        console.log(`   --------------------------------------------------`);
      });
    });
  }
  
  await testInfo.attach('relatorio-wcag-247', {
    body: JSON.stringify(accessibilityScanResults.violations, null, 2),
    contentType: 'application/json',
  });
});