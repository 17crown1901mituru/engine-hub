/**
 * 装備解析エンジン本体
 * 依存関係をチェックし、一括愛用設定から装備セットを抽出します
 */
(async function() {
    "use strict";

    // マスターコアの変数が存在するかチェック
    if (typeof state === 'undefined') {
        console.error("stateが見つかりません");
        return;
    }

    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

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

        if (newList.length > 0) {
            // 前回のリストと異なる場合のみ更新
            if (JSON.stringify(state.equipList) !== JSON.stringify(newList)) {
                state.equipList = newList;
                
                // DOM更新（セレクトボックスの書き換え）
                if (typeof updateEquipSelectorDOM === 'function') {
                    updateEquipSelectorDOM();
                } else {
                    // 予備のDOM更新処理
                    const sel = document.querySelector('select[name="equip_set"]');
                    if (sel) {
                        sel.innerHTML = '<option value="">-- 選択 --</option>';
                        newList.forEach(item => {
                            const opt = document.createElement('option');
                            opt.value = item.id;
                            opt.textContent = item.name;
                            sel.appendChild(opt);
                        });
                    }
                }

                // 保存
                if (typeof save === 'function') {
                    save();
                }

                alert("同期完了: " + newList.length + "件");
            } else {
                alert("変更はありません");
            }
        }
    } catch (e) {
        console.error("解析エラー:", e);
        alert("解析中にエラーが発生しました");
    }
})();

/**
 * UIのセレクトボックスを再構築する関数
 */
function updateEquipSelectorDOM() {
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
