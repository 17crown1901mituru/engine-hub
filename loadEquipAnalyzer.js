(async function() {
    "use strict";

    // 1. ローカルストレージから最新のデータを取得
    const rawData = localStorage.getItem('tora_master_sync');
    if (!rawData) {
        console.error("tora_master_sync が見つかりません");
        return;
    }

    let masterData = JSON.parse(rawData);
    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

    try {
        // 2. ページ走査
        while (nextUrl) {
            const response = await fetch(nextUrl);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const presets = doc.querySelectorAll('dl.preset');
            presets.forEach(dl => {
                const nameEl = dl.querySelector('.preset-name-belt');
                const equipBtn = dl.querySelector('a[href*="set_id="]');

                if (nameEl && equipBtn) {
                    const name = nameEl.textContent.replace('▼　', '').trim();
                    const url = new URL(equipBtn.href);
                    const setId = url.searchParams.get('set_id');
                    if (setId) {
                        // ログの形式に合わせて保存
                        newList.push({ id: setId, name: name });
                    }
                }
            });

            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }

        // 3. データの更新と保存
        if (newList.length > 0) {
            masterData.equipList = newList;
            masterData.lastUpdate = Date.now();
            
            // ストレージへ書き戻し（これが重要です）
            localStorage.setItem('tora_master_sync', JSON.stringify(masterData));

            // 画面上のセレクトボックスを即時更新
            updateEquipSelectorDOM(newList);
            
            alert("同期成功: " + newList.length + "件の装備を読み込みました。");
        } else {
            alert("装備セットが見つかりませんでした。ログインを確認してください。");
        }
    } catch (e) {
        console.error("解析エラー:", e);
    }
})();

// 補助関数：セレクトボックスの書き換え
function updateEquipSelectorDOM(list) {
    const sel = document.querySelector('select[name="equip_set"]') || document.querySelector('select');
    if (!sel) return;

    sel.innerHTML = '<option value="">-- 選択 --</option>';
    list.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        sel.appendChild(opt);
    });
}
