/**
 * 装備解析（外部呼び出し用）
 * マスターコアの state や ui が存在するか確認しながら実行します。
 */
async function syncEquipDisplay() {
    // マスターコアの変数が存在するかチェック（依存関係のガード）
    if (typeof state === 'undefined') {
        console.error("マスターコアの state が見つかりません。");
        return;
    }

    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

    console.log("一括愛用設定ページを走査中...");

    try {
        while (nextUrl) {
            const response = await fetch(nextUrl);
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const presets = doc.querySelectorAll('dl.preset');
            presets.forEach(dl => {
                const nameEl = dl.querySelector('.preset-name-belt');
                const equipBtn = dl.querySelector('a[href^="https://tantora.jp/snapshot/equip-confirm?type=combination&set_id="]');

                if (nameEl && equipBtn) {
                    const name = nameEl.textContent.replace('▼　', '').trim();
                    const url = new URL(equipBtn.href);
                    const setId = url.searchParams.get('set_id');

                    if (setId) {
                        newList.push({ id: setId, name: name });
                    }
                }
            });

            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }

        // 取得したリストをマスターコアの state に反映
        if (newList.length > 0) {
            // 前回のリストと異なる場合のみ更新
            if (JSON.stringify(state.equipList) !== JSON.stringify(newList)) {
                state.equipList = newList;
                
                // DOM更新関数が存在するか確認して実行
                if (typeof updateEquipSelectorDOM === 'function') {
                    updateEquipSelectorDOM();
                }
                
                // 保存関数が存在するか確認して実行
                if (typeof save === 'function') {
                    save();
                }
                
                console.log(`同期完了: ${newList.length} 件のセットを保存しました。`);
            } else {
                console.log("装備リストに変更はありません。");
            }
        }
    } catch (e) {
        console.error("走査中にエラーが発生しました:", e);
    }
}

/**
 * セレクトボックスのDOMを更新する
 */
function updateEquipSelectorDOM() {
    // ui 変数やセレクトボックスが存在しない場合はスキップ
    if (typeof ui === 'undefined' || !ui.eqSel) return;
    
    ui.eqSel.innerHTML = '<option value="">-- 選択 --</option>';
    state.equipList.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        if (item.id === state.targetEquipValue) opt.selected = true;
        ui.eqSel.appendChild(opt);
    });
}

// 読み込みと同時に実行
syncEquipDisplay();
