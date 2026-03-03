// ==UserScript==
// @name         Tora Battle Engine (Master Sync v2.4.0)
// @namespace    https://tantora.jp/
// @version      3.1.0
// @description  バトル・アジトページ専任。着替え・攻撃・回復のみ。判断はしない。
// @match        https://tantora.jp/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    "use strict";

    // --- 1. 定数 ---
    const MASTER_KEY = 'tora_master_sync';

    const getMaster = () => {
        try { return JSON.parse(localStorage.getItem(MASTER_KEY) || '{}'); }
        catch(e) { return {}; }
    };

    const getVal = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return -1;
        const m = el.innerText.replace(/,/g, '').match(/\d+/);
        return m ? parseInt(m[0]) : -1;
    };

    // --- 2. 着替え処理 ---
    // セレクターの value を変更して change イベントを発火。
    // ゲーム側の equipSnapshot('combination') が自動で着替え処理をする。
    function checkEquip() {
        const pending = localStorage.getItem('targetEquipValue');
        if (!pending) return false;

        const combi = document.querySelector('form[name="favorite_combination"] select[name="set"]');
        if (!combi || combi.value === pending) return false;

        // 実行前に命令を消してループ防止
        localStorage.removeItem('targetEquipValue');
        localStorage.setItem('tmx_last_action', 'other');
        combi.value = pending;
        combi.dispatchEvent(new Event('change'));
        return true;
    }

    // --- 3. アイテム使用処理 ---
    function useItem(staminaOnly) {
        const trigger = document.getElementById('acordionTrigger');
        const tree    = document.getElementById('acordionTree');
        if (trigger && tree && !tree.offsetParent) trigger.click();

        const items  = Array.from(document.querySelectorAll('.itemList li, #acordionTree li, #item li'));
        const target = items.find(li => {
            if (staminaOnly) return li.classList.contains('itemSTAMINA');
            return getVal('.stamina') === 0
                ? li.classList.contains('itemSTAMINA')
                : li.classList.contains('itemSPIRIT');
        });
        if (!target) return;

        localStorage.setItem('tmx_last_action', 'other');
        target.click();
        setTimeout(() => {
            const allBtns  = Array.from(document.querySelectorAll('.btn_blue, .btn_red, a[class*="btn"]'));
            const multiBtn = allBtns.find(b => b.innerText.includes('まとめて'));
            const useBtn   = document.querySelector('.btn_red, .btn_use');
            if (multiBtn) multiBtn.click();
            else if (useBtn) useBtn.click();
        }, 150);
    }

    // --- 4. 攻撃実行（atkWait制御） ---
    // 攻撃→攻撃の連続時のみatkWaitを挟む。着替え・回復後は即攻撃。
    function executeAttack(targetEl, data) {
        const lastAction = localStorage.getItem('tmx_last_action');
        const wait = (lastAction === 'attack') ? (data.atkWait || 0) : 0;
        localStorage.setItem('tmx_last_action', 'attack');
        if (wait > 0) {
            setTimeout(() => targetEl.click(), wait);
        } else {
            targetEl.click();
        }
    }

    // --- 5. メインポンプ ---
    function attackPump() {
        if (!document.body) return;

        const data = getMaster();

        // ON/OFFチェックのみ。状況判断は他エンジンに任せる。
        if (!data.masterActive || !data.atkActive) return;

        const url          = window.location.href;
        const isBattlePage = url.includes('war/battle');
        const isAjitoPage  = url.includes('attack-ajito');

        // バトル・アジトページ以外は何もしない
        if (!isBattlePage && !isAjitoPage) return;

        const s1        = document.getElementById('Skill_1');
        const s1Active  = s1 && s1.classList.contains('on') && !s1.querySelector('img[src*="_off"]');
        const actionBtn = document.querySelector('#Action a');
        const st        = getVal('.stamina');

        // --- A. アジト攻撃 ---
        // アジトは弱いので通常攻撃最優先。着替え・奥義は不要。
        if (isAjitoPage) {
            if (st === 0) { useItem(true); return; }
            if (actionBtn) { executeAttack(actionBtn, data); }
            return;
        }

        // --- B. 対人戦 ---
        if (isBattlePage) {
            if (checkEquip()) return;

            const ws = document.querySelector('img[src*="warskill"][src*="_on"]');

            if (st === 0 || !s1Active) {
                if (!data.healActive) useItem(false);
                return;
            }

            if (data.specialActive && ws) { executeAttack(ws, data); return; }

            const s1Btn = s1.querySelector('a');
            if (s1Btn) executeAttack(s1Btn, data);
        }
    }

    // --- 6. 起動 ---
    // 攻撃クリック → リロード → 即attackPump のサイクルで自走する。
    // setInterval不要。atkWaitは着替え・回復後に同一ページで攻撃する場合のガード。
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attackPump);
    } else {
        attackPump();
    }

})();