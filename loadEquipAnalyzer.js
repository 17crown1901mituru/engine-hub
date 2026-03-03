/**
 * 装備解析エンジン本体 (GitHub用)
 * 実行されると自動で全ページを走査し、マスターコアと同期します。
 */
(async function() {
    "use strict";

    // マスターコアの変数が存在するかチェック
    if (typeof state === 'undefined') {
        console.error("マスターコアの state が見つかりません。");
        return;
    }

    // UI更新用の補助関数を内部に定義（スコープの確保）
    const refreshSelector = () => {
        const sel = document.querySelector('select[name="equip_set"]') || (typeof ui !== 'undefined' && ui.eqSel);
        if (!sel) return;
        
        sel.innerHTML = '<option value="">-- 選択 --</option>';
        state.equipList.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.textContent = item.name;
            if (item.id === state.targetEquipValue) opt.selected = true;
            sel.appendChild(opt);
        });
    };

    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

    console.log("装備セットの走査を開始します...");

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
                    if (setId) newList.push({ id: setId, name: name });
                }
            });

            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }

        // リストの反映
        if (newList.length > 0) {
            if (JSON.stringify(state.equipList) !== JSON.stringify(newList)) {
                state.equipList = newList;
                
                // UIを更新
                refreshSelector();
                
                // マスターコアの保存関数を実行
                if (typeof save === 'function') save();

                alert("同期完了: " + newList.length + "件のセットを取得しました。");
            } else {
                alert("装備リストはすでに最新です。");
            }
        } else {
            alert("装備セットが見つかりませんでした。ログイン状態を確認してください。");
        }
    } catch (e) {
        console.error("解析中にエラーが発生しました:", e);
        alert("解析エラーが発生しました。コンソールを確認してください。");
    }
})();
