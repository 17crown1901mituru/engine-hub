// HUB: Loader承認チェック + Engine(CDN) + 辞書(GitHub)
(async function(){
  // Loader承認フラグ確認
  if(!window.__loaderAuthorized){
    console.error("Loader経由でないため処理を中止");
    return;
  }

  console.log("HUB起動: Loader承認済み");

  // Engine読み込み（CDN）
  const engineScript = document.createElement('script');
  engineScript.src = "https://cdn.jsdelivr.net/gh/17crown1901mituru/x7q9r2v/engine.recovery.min.js";
  document.body.appendChild(engineScript);

  // 辞書読み込み（GitHub Pages）
  try {
    const recoveryItems = await fetch("https://17crown1901mituru.github.io/x7q9r2v/recovery_items.item4.json")
      .then(r=>r.json());

    // HUBが集めて渡すだけ
    window.recoveryItems = recoveryItems.items;
    console.log("辞書統合完了、Engineに譲渡", window.recoveryItems.length, "件");
  } catch(e){
    console.warn("辞書読み込み失敗", e);
  }
})();