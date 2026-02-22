(function () {
  const resources = [
    {
      name: 'SheetJS',
      global: 'XLSX',
      cdn: 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      local: 'vendor/xlsx.full.min.js'
    },
    {
      name: 'Sortable',
      global: 'Sortable',
      cdn: 'https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.0/Sortable.min.js',
      local: 'vendor/Sortable.min.js'
    }
  ];

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = () => resolve(src);
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }

  async function loadWithFallback(res) {
    if (window[res.global]) return 'existing';

    try {
      await loadScript(res.cdn);
      if (window[res.global]) return 'cdn';
      throw new Error(res.name + ' not found after CDN load');
    } catch (cdnErr) {
      try {
        await loadScript(res.local);
        if (window[res.global]) return 'local';
        throw new Error(res.name + ' not found after local load');
      } catch (localErr) {
        throw new Error(
          res.name + ' load failed. CDN: ' + cdnErr.message + '; Local: ' + localErr.message
        );
      }
    }
  }

  function showFatal(message) {
    const node = document.createElement('div');
    node.style.cssText = [
      'position:fixed',
      'left:12px',
      'right:12px',
      'top:12px',
      'z-index:9999',
      'background:#9A5A54',
      'color:#fff',
      'padding:10px 12px',
      'border-radius:8px',
      'font-size:13px',
      'line-height:1.45',
      'box-shadow:0 8px 20px rgba(0,0,0,0.2)'
    ].join(';');
    node.textContent = message;
    document.body.appendChild(node);
    console.error(message);
  }

  function startApp() {
    const inlineApp = document.getElementById('app-inline-code');
    if (inlineApp && inlineApp.textContent.trim()) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(inlineApp.textContent)();
      } catch (err) {
        showFatal('应用启动失败（内联代码执行失败）: ' + err.message);
      }
      return;
    }

    loadScript('app.js').catch((err) => {
      showFatal('应用脚本加载失败: ' + err.message);
    });
  }

  (async function bootstrap() {
    try {
      for (const res of resources) {
        await loadWithFallback(res);
      }
      startApp();
    } catch (err) {
      showFatal('依赖加载失败，请检查网络或本地 vendor 文件: ' + err.message);
    }
  })();
})();
