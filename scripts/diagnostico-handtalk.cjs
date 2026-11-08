const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  try {
    const urls = process.argv.slice(2);
    for (const url of urls.length ? urls : ['https://niteroi360.niteroi.rj.gov.br', 'https://saquarema.colab.re']) {
      const page = await browser.newPage();
      const network = [];
      const pending = [];
      page.on('requestfailed', req => {
        if (/handtalk/i.test(req.url())) network.push({ tipo: 'falha', host: new URL(req.url()).hostname,
          caminho: new URL(req.url()).pathname, erro: req.failure()?.errorText });
      });
      page.on('response', res => {
        if (!/handtalk/i.test(res.url())) return;
        const u = new URL(res.url());
        const item = { host: u.hostname, caminho: u.pathname, status: res.status(), tipo: res.request().resourceType() };
        network.push(item);
        if (['fetch', 'xhr'].includes(item.tipo)) pending.push(res.text().then(body => {
          try {
            const data = JSON.parse(body);
            item.chaves = Object.keys(data);
            item.mensagem = data.message || data.error || data.detail;
            item.sucesso = data.success;
          } catch { item.formato = body.slice(0, 150); }
        }).catch(() => {}));
      });
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.getByRole('heading', { name: 'Categorias de serviços', exact: true }).waitFor({ timeout: 60000 });
        await page.waitForTimeout(15000);
        await page.getByRole('button', { name: 'Abrir recursos assistivos.', exact: true }).click();
        await page.waitForTimeout(10000);
        console.log(JSON.stringify({ url, urlFinal: page.url(), estado: (await page.locator('body').innerText()).slice(-5000), network }));
        await Promise.all(pending);
        console.log(JSON.stringify({ url, redeFinal: network }));
      } catch (error) { console.log(JSON.stringify({ url, erro: String(error), network })); }
      await page.close();
    }
  } finally { await browser.close(); }
})();
