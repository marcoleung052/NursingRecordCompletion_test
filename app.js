// app.js - 全域狀態與 fragment loader
window.App = (function () {
  const state = {
    currentUser: null,
    patients: [
      { id: 1, name: '王小明', bed: 'A101' },
      { id: 2, name: '陳小華', bed: 'B202' }
    ],
    records: {
      // patientId: [ { id, title, content, createdAt } ]
      1: [{ id: 1, title: '入院評估', content: '病人狀況穩定', createdAt: Date.now() }]
    },
    temp: {} // 可用來傳遞臨時資料
  };

  const container = document.getElementById('app');

  // helper: fetch fragment html, inject, execute scripts
  async function loadFragment(name, params = {}) {
    const url = `fragments/${name}.html`;
    const res = await fetch(url);
    if (!res.ok) {
      container.innerHTML = `<div class="card">載入失敗：${url}</div>`;
      return;
    }
    const text = await res.text();

    // 解析並執行 scripts safely
    const div = document.createElement('div');
    div.innerHTML = text;

    // extract scripts
    const scripts = Array.from(div.querySelectorAll('script'));
    scripts.forEach(s => s.parentNode.removeChild(s));

    // inject remaining html
    container.innerHTML = '';
    Array.from(div.childNodes).forEach(node => container.appendChild(node));

    // execute scripts sequentially
    for (const s of scripts) {
      const script = document.createElement('script');
      if (s.src) {
        script.src = s.src;
        await new Promise((resolve, reject) => {
          script.onload = resolve; script.onerror = resolve;
          document.body.appendChild(script);
        });
      } else {
        script.textContent = s.textContent;
        document.body.appendChild(script);
      }
      // remove executed script tag to keep DOM clean
      document.body.removeChild(script);
    }

    // dispatch event to notify fragment loaded
    const ev = new CustomEvent('app:navigate', { detail: { page: name, params } });
    window.dispatchEvent(ev);
  }

  // navigation with history
  function navigate(page, params = {}, opts = {}) {
    const url = `${page}.html`;
    if (opts.replace) {
      history.replaceState({ page, params }, '', url);
    } else {
      history.pushState({ page, params }, '', url);
    }
    return loadFragment(page, params);
  }

  // handle back/forward
  window.addEventListener('popstate', (e) => {
    const st = e.state;
    if (st && st.page) loadFragment(st.page, st.params || {});
  });

  // API to send data between fragments
  function sendData(key, value) {
    state.temp[key] = value;
  }
  function getData(key) {
    return state.temp[key];
  }
  function clearData(key) {
    if (key) delete state.temp[key];
    else state.temp = {};
  }

  // expose state accessor
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
