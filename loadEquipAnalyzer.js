(async function() {
    "use strict";
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
                    if (setId) newList.push({ id: setId, name: name });
                }
            });
            const nextBtn = doc.querySelector('a.common-page-button-next');
            nextUrl = nextBtn ? nextBtn.href : null;
        }
        if (newList.length > 0) {
            state.equipList = newList;
            if (typeof updateEquipSelectorDOM === 'function') updateEquipSelectorDOM();
            if (typeof save === 'function') save();
            alert("同期完了: " + newList.length + "件");
        }
    } catch (e) {
        console.error("解析エラー:", e);
    }
})();

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
