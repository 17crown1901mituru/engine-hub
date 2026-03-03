// ==UserScript==
// @name         Tora Recovery Engine (Master Sync v1.7.3)
// @namespace    https://tantora.jp/
// @version      1.7.3
// @description  attack_supporterIframe限定。入院検知→修理→回復→帰還をすべて担当。マスターコア完全連動。
// @match        https://tantora.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    // --- 1. ガード ---
    if (window.name !== 'attack_supporter') return;

    // --- 2. 定数 ---
    const CONFIG = {
        MASTER_KEY:  'tora_master_sync',
        BACKEND_KEY: 'tora_engine_sync_backend',
        WAR_TID_KEY: 'active_war_tid'
    };

    const bState = {
        repairEnabled: false,
        equipMode:     "N",
        targetHpName:  "FREE",
        healActive:    false,
        hasRepaired:   false  // 同一入院中の二重修理防止
    };

    // --- 3. マスターコア連動 ---
    function syncFromMaster() {
        try {
            const data = JSON.parse(localStorage.getItem(CONFIG.MASTER_KEY) || '{}');
            bState.repairEnabled = !!data.repairEnabled;
            bState.equipMode     = data.equipMode     || "N";
            bState.targetHpName  = data.targetHpName  || "FREE";
            bState.healActive    = !!data.healActive;
        } catch(e) {}
    }

    // UI操作をリアルタイムに反映
    window.addEventListener('storage', (e) => {
        if (e.key === CONFIG.MASTER_KEY) syncFromMaster();
    });

    // 在庫状況をマスターコアのUIへ報告
    // 修正①：items が空でも常に書き込み、古いキャッシュが残らないようにする
    function reportToMaster(items) {
        localStorage.setItem(CONFIG.BACKEND_KEY, JSON.stringify(items));
    }

    // 帰還先URLを生成
    // 修正④：tid が null の場合はパラメータなしで遷移
    function buildReturnUrl() {
        const tid = localStorage.getItem(CONFIG.WAR_TID_KEY);
        return tid ? `/war/member-list?team_id=${tid}` : `/war/member-list`;
    }

    // --- 4. メインポンプ ---
    async function recoveryPump() {
        if (!bState.healActive || !document.body) return;

        const path = location.pathname;
        const isHospitalized = document.body.innerHTML.includes('<blink>入院中</blink>');

        // 入院中でも修理画面でもない → 回復完了。フラグをリセットして待機。
        if (!isHospitalized && !path.includes('repair-confirm')) {
            bState.hasRepaired = false;
            return;
        }

        // --- A. 修理画面フェーズ ---
        if (path.includes('repair-confirm')) {
            const submitBtn = document.querySelector('input[type="submit"]');
            if (submitBtn) {
                submitBtn.click();
            } else {
                // 修理完了 or 修理不要 → 抗争メンバーリストへ帰還
                location.href = buildReturnUrl();
            }
            return;
        }

        // --- B. 入院中フェーズ ---
        if (isHospitalized) {

            // B-1. 修理（1回のみ）
            if (bState.repairEnabled && !bState.hasRepaired) {
                bState.hasRepaired = true;
                location.href = '/item/repair-confirm';
                return;
            }

            // B-2. 回復ポップアップを開く
            const pop = document.querySelector('.popupWindowContents');
            if (!pop) {
                const healBtn = document.querySelector('img[src*="footer_heal"]')?.parentElement;
                if (healBtn) {
                    healBtn.click();
                    // 修正③：クリック直後の二重発火を防ぐため200msクールダウン
                    isPumping = true;
                    setTimeout(() => { isPumping = false; }, 200);
                }
                return;
            }

            // B-3. 在庫スキャン → マスターコアUIへ報告
            const items = Array.from(pop.querySelectorAll('li.itemHP')).map(li => ({
                name:      li.querySelector('p')?.innerText || '不明',
                remaining: parseInt(li.innerText.match(/残り(\d+)/)?.[1] || '0')
            }));
            reportToMaster(items);

            // B-4. 装備プリセット(Mod)選択
            const mIdx = { A: 0, B: 1, N: 2 }[bState.equipMode] ?? 2;
            const radios = pop.querySelectorAll('input[name="selectpresetradio"]');
            if (radios[mIdx] && !radios[mIdx].checked) {
                radios[mIdx].click();
            }

            // B-5. アイテム使用
            // 修正②：完全一致を優先し、なければ部分一致にフォールバック
            const target = bState.targetHpName === 'FREE'
                ? items[0]
                : (items.find(i => i.name === bState.targetHpName)
                   ?? items.find(i => i.name.includes(bState.targetHpName)));

            if (target && target.remaining > 0) {
                const liEl = Array.from(pop.querySelectorAll('li.itemHP'))
                    .find(el => el.innerText.includes(target.name));
                if (!liEl) return;

                const isFull = liEl.innerText.includes('全回復');
                liEl.click();

                setTimeout(() => {
                    const submitBtn = isFull
                        ? pop.querySelector('input[type="submit"]')
                        : pop.querySelector('a.multi-form-submit');
                    if (submitBtn) submitBtn.click();
                }, 100);

            } else {
                // アイテム切れ → 帰還してサポートエンジンに次の遷移を委ねる
                location.href = buildReturnUrl();
            }
        }
    }

    // --- 5. 起動 ---
    syncFromMaster();

    let isPumping = false;

    async function recoveryPumpSafe() {
        if (isPumping) return;
        isPumping = true;
        try { await recoveryPump(); } finally { isPumping = false; }
    }

    // 修正⑤：1回限りの呼び出しから軽量ポーリングに変更
    //         ポップアップの遅延表示など非同期な変化にも対応
    setInterval(recoveryPumpSafe, 800);

})();
