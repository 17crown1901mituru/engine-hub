(async function() {
    "use strict";

    // 1. マスターコアの定数と状態を特定
    const MASTER_KEY = 'tora_master_sync';
    const rawData = localStorage.getItem(MASTER_KEY);
    
    if (!rawData) {
        alert("マスターコアの起動が確認できません。");
        return;
    }

    let masterState = JSON.parse(rawData);
    let newList = [];
    let nextUrl = 'https://tantora.jp/snapshot?type=combination';

    console.log("解析エンジン：装備スナップショットの走査を開始...");

    try {
        // 2. 装備セットの巡回解析
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
                        // マスターコアの equipList 形式に合わせる
                        newList.push({ id: setId, name: name });
                    }
                }
            });

            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }

        // 3. マスターコアのデータ構造を更新して保存
        if (newList.length > 0) {
            // 既存のstateを保持しつつ、装備リストのみ差し替え
            masterState.equipList = newList;
            masterState.lastUpdate = Date.now();
            
            // マスターコアが利用しているストレージキーに書き戻し
            localStorage.setItem(MASTER_KEY, JSON.stringify(masterState));

            // UI側への強制反映（マスターコアのUI部品を直接操作）
            const sel = document.querySelector('#tmx-master-ui select') || document.querySelector('select');
            if (sel) {
                sel.innerHTML = '<option value="">-- 選択 --</option>';
                newList.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.id;
                    opt.textContent = item.name;
                    if (item.id === masterState.targetEquipValue) opt.selected = true;
                    sel.appendChild(opt);
                });
            }

            alert("マスターコア同期完了: " + newList.length + "件の装備を読み込みました。");
        } else {
            alert("装備セットが見つかりませんでした。ログイン状態を確認してください。");
        }
    } catch (e) {
        console.error("解析エンジンエラー:", e);
        alert("同期中にエラーが発生しました。");
    }
})();
