/**
 * 一括愛用（コンビネーション）全ページを走査して同期するメイン関数
 */
async function syncEquipDisplay() {
    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

    console.log("一括愛用設定ページを走査中...");

    try {
        while (nextUrl) {
            const response = await fetch(nextUrl);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            // ページ内の各セット(dl.preset)をループ
            const presets = doc.querySelectorAll('dl.preset');
            presets.forEach(dl => {
                const nameEl = dl.querySelector('.preset-name-belt');
                
                // ご提示いただいた「装備ボタン」のURL構造を厳格に指定
                // https://tantora.jp/snapshot/equip-confirm?type=combination&set_id=...
                const equipBtn = dl.querySelector('a[href^="https://tantora.jp/snapshot/equip-confirm?type=combination&set_id="]');

                if (nameEl && equipBtn) {
                    const name = nameEl.textContent.replace('▼　', '').trim();
                    
                    // URLオブジェクトを使用して、確実に set_id パラメータの値のみを抽出
                    const url = new URL(equipBtn.href);
                    const setId = url.searchParams.get('set_id');

                    if (setId) {
                        newList.push({ id: setId, name: name });
                    }
                }
            });

            // 「次へ」ボタン
            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }

        // データの比較と保存
        if (newList.length > 0 && JSON.stringify(state.equipList) !== JSON.stringify(newList)) {
            state.equipList = newList;
            updateEquipSelectorDOM();
            save(); // ローカルストレージへ保存
            console.log(`同期完了: ${newList.length} 件のセットを厳格なURL照合で保存しました。`);
        }
    } catch (e) {
        console.error("走査中にエラーが発生しました:", e);
    }
}syncEquipDisplay();
/**
 * セレクトボックスのDOMを更新する
 */
function updateEquipSelectorDOM() {
    if (!ui.eqSel) return;
    ui.eqSel.innerHTML = '<option value="">-- 選択 --</option>';
    state.equipList.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        if (item.id === state.targetEquipValue) opt.selected = true;
        ui.eqSel.appendChild(opt);
    });
}