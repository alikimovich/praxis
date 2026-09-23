(() => {
  let enabled = true;
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;pointer-events:none;outline:2px solid Highlight;z-index:2147483647;display:none';
  document.documentElement.append(overlay);
  const show = el => {
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {display:'block',left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`});
  };
  const pick = el => {
    show(el);
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    window.webkit.messageHandlers.selection.postMessage({
      tag: el.tagName.toLowerCase(), id: el.id,
      text: (el.textContent || '').trim().slice(0, 500),
      source: el.closest('[data-praxis-source]')?.getAttribute('data-praxis-source') || null,
      bounds: { x:r.x,y:r.y,width:r.width,height:r.height },
      styles: { fontSize:style.fontSize,display:style.display,color:style.color }
    });
  };
  document.addEventListener('pointermove', e => { if (enabled && e.target instanceof Element) show(e.target); }, true);
  document.addEventListener('click', e => {
    if (!enabled || !(e.target instanceof Element)) return;
    e.preventDefault(); e.stopImmediatePropagation(); pick(e.target);
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { enabled = false; overlay.style.display='none'; } }, true);
  globalThis.praxisPreview = {
    setEnabled(value) { enabled = value; if (!value) overlay.style.display='none'; },
    select(selector) { const el = document.querySelector(selector); if (!el) throw new Error('Element missing'); pick(el); }
  };
})();
