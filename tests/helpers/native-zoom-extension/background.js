// Controla apenas o zoom nativo da aba ativa do navegador isolado de testes.
globalThis.nativeZoom = async factor => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('A aba ativa do teste não foi encontrada.');
  if (factor !== undefined) {
    await chrome.tabs.setZoomSettings(tab.id, { mode: 'automatic', scope: 'per-tab' });
    await chrome.tabs.setZoom(tab.id, factor);
  }
  return chrome.tabs.getZoom(tab.id);
};
