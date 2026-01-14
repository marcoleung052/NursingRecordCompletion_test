// app.js - 全域狀態與 fragment loader（與 demo1.html 行為一致）
window.App = (function () {
  const state = {
    currentUser: null,
    patients: [
      { id: 1, name: '王小明', bed: 'A101' },
      { id: 2, name: '陳小華', bed: 'B202' }
    ],
    records: {
      1: [{ id: 1, title: '入院評估', content: '病人狀況穩定', createdAt: Date.now() }]
    },
    temp: {}
  };

  const container = document.getElementById('app');

  async function loadFragment(name, params = {}) {
    const url = `fragments/${name}.html`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('載入失敗');
      const text = await res.text();

      const div = document.createElement('div');
      div.innerHTML = text;

      const scripts = Array.from(div.querySelectorAll('script'));
      scripts.forEach(s => s.parentNode.removeChild(s));

      container.innerHTML = '';
      Array.from(div.childNodes).forEach(node => container.appendChild(node));

      for (const s of scripts) {
        const script = document.createElement('script');
        if (s.src) {
          script.src = s.src;
          await new Promise((resolve) => {
            script.onload = resolve; script.onerror = resolve;
            document.body.appendChild(script);
          });
        } else {
          script.textContent = s.textContent;
          document.body.appendChild(script);
        }
        document.body.removeChild(script);
      }

      const ev = new CustomEvent('app:navigate', { detail: { page: name, params } });
      window.dispatchEvent(ev);
    } catch (err) {
      container.innerHTML = `<div class="card">載入 fragment 失敗：${name}</div>`;
    }
  }

  function navigate(page, params = {}, opts = {}) {
    const url = `${page}.html`;
    if (opts.replace) history.replaceState({ page, params }, '', url);
    else history.pushState({ page, params }, '', url);
    return loadFragment(page, params);
  }

  window.addEventListener('popstate', (e) => {
    const st = e.state;
    if (st && st.page) loadFragment(st.page, st.params || {});
  });

  function sendData(key, value) { state.temp[key] = value; }
  function getData(key) { return state.temp[key]; }
  function clearData(key) { if (key) delete state.temp[key]; else state.temp = {}; }
  function getState() { return state; }

  return {
    navigate,
    loadFragment,
    sendData,
    getData,
    clearData,
    getState
  };
})();
