// ==UserScript==
// @name         Tora Battle Support Engine (Master Sync v1.7.0)
// @namespace    https://tantora.jp/
// @version      2.1.0
// @description  遷移専任。sid変数保持・リザルト検知・再リダイレクト。マスターコア完全連動。
// @match        https://tantora.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    const CONFIG = {
        MASTER_KEY:    'tora_master_sync',
        WAR_START_KEY: 'war_start_time'
    };

    if (window.name !== 'attack_supporter') return;

    const getMaster = () => {
        try { return JSON.parse(localStorage.getItem(CONFIG.MASTER_KEY) || '{}'); }
        catch(e) { return {}; }
    };

    const parentWin = window.parent;

    // --- 2. 停止条件チェック ---
    function shouldStop(data) {
        if (!data.masterActive || !data.atkActive) return true;
        const warStart = parseInt(localStorage.getItem(CONFIG.WAR_START_KEY) || '0');
        const rem = warStart - Date.now();
        if (rem > -2000 && rem < 1000) return true;
        return false;
    }

    // --- 3. sid取得 ---
    function loadSid(data) {
        if (!location.href.includes('war/member-list')) return null;
        if (document.body.innerHTML.includes('<blink>入院中</blink>')) return null;

        const links = Array.from(document.querySelectorAll('a.memberListLink[href*="other_id="]'));
        const sids = links
            .map(a => a.href.match(/other_id=(\d+)/)?.[1])
            .filter(Boolean);
        if (sids.length === 0) return null;

        if (data.targetOrder === 'BTM')      return sids[sids.length - 1];
        else if (data.targetOrder === 'RND') return sids[Math.floor(Math.random() * sids.length)];
        else                                 return sids[0]; // TOP
    }

    // --- 4. 遷移実行 ---
    function searchAndJump(data, sid) {
        const parentUrl = parentWin.location.href;
        const parentDoc = parentWin.document;

        const isResultPage = !!(
            parentDoc.querySelector('a[onclick*="war/member-list"], a[onclick*="\\/war"]') ||
            parentDoc.querySelector('div.basic_dialog_OK')
        );
        const isMemberListPage = parentUrl.includes('war/member-list');
        const isBattlePage     = parentUrl.includes('war/battle');

        // バトル以外・リザルト以外・メンバーリスト以外 → 再リダイレクト
        if (!isBattlePage && !isResultPage && !isMemberListPage) {
            if (sid) {
                parentWin.location.href = `https://tantora.jp/war/battle?other_id=${sid}`;
                return;
            }
            if (data.hideoutActive) {
                const ajito = document.querySelector('a[href*="war/attack-ajito"]');
                if (ajito) { parentWin.location.href = ajito.href; return; }
            }
            return;
        }

        // リザルトまたはメンバーリスト → sidでバトルへ
        if (isResultPage || isMemberListPage) {
            if (sid) {
                parentWin.location.href = `https://tantora.jp/war/battle?other_id=${sid}`;
                return;
            }
            // sidなし（全員非活性）→ アジトへ
            if (data.hideoutActive) {
                const ajito = document.querySelector('a[href*="war/attack-ajito"]');
                if (ajito) { parentWin.location.href = ajito.href; return; }
            }
        }
    }

    // --- 5. 起動 ---
    const main = () => {
        const data = getMaster();
        if (shouldStop(data)) return;

        const sid = loadSid(data);
        searchAndJump(data, sid);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', main);
    } else {
        main();
    }

})();