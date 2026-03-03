// ==UserScript==
// @name         Tora Master Core (Integrated v14.7.1)
// @namespace    https://tantora.jp/
// @version      3.4.0
// @description  エンジンハブ：1分前準備・突入・連動ステータス管理
// @match        https://tantora.jp/*
// @run-at       document-start
// @grant        none
// @noframes     true
// ==/UserScript==

(function() {
    "use strict";

    const CONFIG = {
        MASTER_KEY:            'tora_master_sync',
        BACKEND_KEY:           'tora_engine_sync_backend',
        WAR_TID_KEY:           'active_war_tid',
        WAR_START_KEY:         'war_start_time',
        WAR_START_RAW:         'war_start_raw_text',
        WAR_TID_CONFIRMED_KEY: 'war_tid_confirmed' // member-listから取得した確定tid済みフラグ
    };

    const WAR_DURATION_MS = 60 * 60 * 1000; // 抗争時間は最大60分

    const state = {
        masterActive: false, atkActive: false, healActive: false,
        targetEquipValue: "", currentEquipName: "",
        specialActive: false, hideoutActive: false,
        targetOrder: "TOP", atkWait: 150,
        repairEnabled: false, equipMode: "N", targetHpName: "FREE", hpIndex: 0,
        availableItems: [], targetQueue: [], equipList: [],
        pos: { top: 10, left: window.innerWidth - 85 }
    };

    let ui = {};
    let entryIfr = null;
    let isParentMigrated = false;
    let hasAutoPrepped = false;

    // --- 1. データ管理 ---
    function save() {
        localStorage.setItem(CONFIG.MASTER_KEY, JSON.stringify({...state, lastUpdate: Date.now()}));
        refreshUI();
    }

    function load() {
        const s = localStorage.getItem(CONFIG.MASTER_KEY);
        if (s) try { Object.assign(state, JSON.parse(s)); } catch(e) {}
        const b = localStorage.getItem(CONFIG.BACKEND_KEY);
        if (b) try { state.availableItems = JSON.parse(b); } catch(e) {}
    }

    // --- 2. iframe管理 ---
    // 変数とDOM両方で確認し、なければ作る・あれば再利用
    function createEntryIframe() {
    if (!entryIfr) {
        entryIfr = document.getElementById('tmx-engine-ifr');
    }
    if (!entryIfr) {
        entryIfr = document.createElement('iframe');
        entryIfr.id   = 'tmx-engine-ifr';
        entryIfr.name = 'attack_supporter'; // ← 生成時に必ずセット
        entryIfr.style.cssText = "position:absolute; width:0; height:0; border:0; left:-9999px;";
        document.body.appendChild(entryIfr);
    }
    // nameが抜けていたら補完（DOM再利用時の保険）
    if (!entryIfr.name) entryIfr.name = 'attack_supporter';
}

    // --- 3. 抗争監視 ---
    function checkWarWatcher() {
        if (!document.body) return;

        const now = Date.now();
        const st  = parseInt(localStorage.getItem(CONFIG.WAR_START_KEY) || '0');

        // 抗争終了判定（開戦から60分超）→ 確定フラグを折る
        const warOver = st > 0 && (now - st) > WAR_DURATION_MS;
        if (warOver) {
            localStorage.removeItem(CONFIG.WAR_TID_CONFIRMED_KEY);
            isParentMigrated = false;
            hasAutoPrepped   = false;
        }

        // === 手動突入ルート：親ページが直接 /war/member-list を開いた場合 ===
        if (location.pathname.includes('/war/member-list')) {
            const tidMatch = location.search.match(/team_id=(\d+)/);
            if (tidMatch && !localStorage.getItem(CONFIG.WAR_TID_CONFIRMED_KEY)) {
                // 確定tidフラグが未セットの時だけ保存（1回だけ）
                localStorage.setItem(CONFIG.WAR_TID_KEY, tidMatch[1]);
                localStorage.setItem(CONFIG.WAR_TID_CONFIRMED_KEY, '1');
            }
            // iframeはなければ作る・あれば再利用（動作中を邪魔しない）
            createEntryIframe();
            if (!entryIfr.name) entryIfr.name = 'attack_supporter';
            if (!entryIfr.src || entryIfr.src !== location.href) {
                entryIfr.src = location.href;
            }
            return;
        }

        // /war/ 配下（抗争中）は以降の処理不要
        if (location.pathname.startsWith('/war/')) return;

        // === テロップ勃発リンクから tid・開戦時刻を取得（通常ルート） ===
        const warLink = document.querySelector('a[href*="team/other?"][href*="linkfrom=my_telop"]');
        if (!warLink) return;

        const tidMatch = warLink.href.match(/team_id=(\d+)/);
        if (!tidMatch) return;
        const newTid = tidMatch[1];

        // 新しい抗争のTIDが変わった場合は古いデータを掃除・確定フラグも折る
        const oldTid = localStorage.getItem(CONFIG.WAR_TID_KEY);
        if (newTid !== oldTid) {
            localStorage.removeItem(CONFIG.WAR_TID_KEY);
            localStorage.removeItem(CONFIG.WAR_START_KEY);
            localStorage.removeItem(CONFIG.WAR_START_RAW);
            localStorage.removeItem(CONFIG.WAR_TID_CONFIRMED_KEY);
            localStorage.removeItem('tmx_prep_step');
            localStorage.removeItem('tmx_last_action');
        }
        localStorage.setItem(CONFIG.WAR_TID_KEY, newTid);

        // 開戦時間取得：<br>タグを除去してからマッチ
        const rawText = warLink.innerHTML.replace(/<[^>]+>/g, ' ');
        const timeMatch = rawText.match(/(\d{2})\/(\d{2})\s(\d{2})時(\d{2})分開戦/);
        if (!timeMatch) return;

        const curTimeText = timeMatch[0];
        if (curTimeText === localStorage.getItem(CONFIG.WAR_START_RAW)) return;

        const startTime = new Date(
            new Date().getFullYear(),
            parseInt(timeMatch[1]) - 1,
            parseInt(timeMatch[2]),
            parseInt(timeMatch[3]),
            parseInt(timeMatch[4])
        ).getTime();

        localStorage.setItem(CONFIG.WAR_START_KEY, startTime.toString());
        localStorage.setItem(CONFIG.WAR_START_RAW, curTimeText);
    }

    // --- 4. 準備フロー ---
    async function executePreparation() {
        const setId = state.targetEquipValue;
        if (!setId || setId === "0") return;
        hasAutoPrepped = true;
        localStorage.setItem('tmx_prep_step', '1');
        location.href = `https://tantora.jp/snapshot/equip-confirm?type=combination&set_id=${setId}`;
    }

    function resumePreparation() {
        const step = localStorage.getItem('tmx_prep_step');
        if (!step) return;

        if (step === '1') {
            if (!location.pathname.includes('equip-confirm')) return;
            const form = document.querySelector('form[action*="equip-exec"]');
            if (form) {
                localStorage.setItem('tmx_prep_step', '2');
                form.submit();
            }
            return;
        }
        if (step === '2') {
            if (location.pathname.includes('equip-confirm') ||
                location.pathname.includes('equip-exec')) return;
            localStorage.setItem('tmx_prep_step', '3');
            location.href = 'https://tantora.jp/my/';
            return;
        }
        if (step === '3') {
            if (!location.pathname.startsWith('/my')) return;
            const readyLink = document.querySelector('a[href*="war/ready"]');
            if (readyLink) {
                localStorage.setItem('tmx_prep_step', '4');
                location.href = readyLink.href;
            }
            return;
        }
        if (step === '4') {
            if (location.pathname.startsWith('/my')) return;
            localStorage.removeItem('tmx_prep_step');
            location.href = 'https://tantora.jp/my/';
            return;
        }
    }

    // --- 5. 突入 ---
    function startWarEntry(tid) {
        if (isParentMigrated) return;
        createEntryIframe();
        entryIfr.name = 'attack_supporter';
        entryIfr.src  = `https://tantora.jp/war/member-list?team_id=${tid}`;
        isParentMigrated = true;
    }

    // --- 6. メインループ（可変頻度） ---
    function mainLoop() {
        load();
        checkWarWatcher();
        syncEquipDisplay();

        const now = Date.now();
        const tid = localStorage.getItem(CONFIG.WAR_TID_KEY);
        const st  = parseInt(localStorage.getItem(CONFIG.WAR_START_KEY) || "0");
        const rem = st - now;

        resumePreparation();

        // 15分前自動準備
        if (state.masterActive && rem <= 900000 && rem > 0 && !hasAutoPrepped) {
            if (location.pathname.startsWith('/my')) {
                executePreparation();
            }
        }

        // 残り時間に応じた更新間隔
        let nextTick;
        if (rem > 3660000) {
            nextTick = 60000;
        } else if (rem > 900000) {
            nextTick = 10000;
        } else if (rem > 2000) {
            nextTick = 1000;
        } else if (rem > -5000) {
            nextTick = 400;
            if (state.masterActive && tid && !isParentMigrated) {
                if (!window.lastEntryTry || now - window.lastEntryTry > 400) {
                    window.lastEntryTry = now;
                    startWarEntry(tid);
                }
            }
        } else {
            hasAutoPrepped   = false;
            isParentMigrated = false;
            nextTick = 10000;
        }

        updateDynamicDisplay(rem, tid);
        refreshUI();
        setTimeout(mainLoop, nextTick);
    }

    // --- 7. UI ---
    function updateDynamicDisplay(rem, tid) {
        if (!ui.mBtn) return;
        const tidStr = `<span style="color:#0f0; font-size:9px;">TID:${tid || '不明'}</span>`;

        if (location.pathname.includes('/war/')) {
            ui.mBtn.innerHTML = `抗争中<br>${tidStr}`;
            ui.mBtn.style.background = "rgba(120, 0, 0, 0.9)";
            return;
        }

        ui.mBtn.style.background = "rgba(0,0,0,0.85)";

        if (rem > 3660000) {
            ui.mBtn.innerHTML = `${Math.floor(rem / 3600000)}h<br>${tidStr}`;
        } else if (rem > 900000) {
            ui.mBtn.innerHTML = `${Math.floor(rem / 60000)}m<br>${tidStr}`;
        } else if (rem > 0) {
            const m = Math.floor(rem / 60000);
            const s = Math.floor((rem % 60000) / 1000);
            ui.mBtn.innerHTML = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}<br>${tidStr}`;
            if (rem < 5000) ui.mBtn.style.background = "#800";
        } else if (rem > -5000) {
            ui.mBtn.innerHTML = `突入中!!<br>${tidStr}`;
            ui.mBtn.style.background = "#f00";
        } else {
            ui.mBtn.innerHTML = `MASTER<br><span style="color:${state.masterActive ? '#0f0' : '#fff'}">${state.masterActive ? 'ON' : 'OFF'}</span>`;
        }
    }

    function syncEquipDisplay() {
        if (!location.pathname.includes('battle')) return;
        const sel = document.querySelector('form[name="favorite_combination"] select[name="set"]');
        if (!sel) return;

        const newList = Array.from(sel.options)
            .map(o => ({ id: o.value, name: o.textContent.replace('▼　','').trim() }))
            .filter(i => i.id !== "" && i.id !== "0");

        if (newList.length > 0 && JSON.stringify(state.equipList) !== JSON.stringify(newList)) {
            state.equipList = newList;
            updateEquipSelectorDOM();
            save();
        }
    }

    const STYLES = {
        container: "position:fixed; z-index:2147483647; display:flex; flex-direction:column; gap:3px; font-family:sans-serif; touch-action:none; user-select:none;",
        btn: "width:75px; min-height:40px; padding:2px 0; border:1px solid #555; color:#fff; font-size:10px; display:flex; align-items:center; justify-content:center; text-align:center; border-radius:3px; cursor:pointer; background:rgba(0,0,0,0.85); line-height:1.1;"
    };

    function initUI() {
        if (document.getElementById('tmx-master-ui') || !document.body) return;
        const c = document.createElement('div');
        c.id = 'tmx-master-ui';
        c.style.cssText = STYLES.container;
        c.style.top  = state.pos.top  + "px";
        c.style.left = state.pos.left + "px";

        ui.mBtn   = createPart('div', STYLES.btn + "background:#444; font-weight:bold;", "MASTER");
        ui.subBox = createPart('div', "display:none; flex-direction:column; gap:3px;");

        ui.atkBtn  = createPart('div', STYLES.btn + "background:#311;", "ATK");
        ui.atkSub  = createPart('div', "display:none; flex-direction:column; gap:3px;");
        ui.eqSel   = createPart('select', "width:75px; height:24px; font-size:9px; background:#000; color:#fff; border:1px solid #555; padding:0;");
        ui.specBtn = createPart('div', STYLES.btn, "奥義");
        ui.hideBtn = createPart('div', STYLES.btn, "アジト");
        ui.ordBtn  = createPart('div', STYLES.btn, "順:TOP");
        ui.spdBtn  = createPart('div', STYLES.btn, "高速");
        ui.atkSub.append(ui.eqSel, ui.specBtn, ui.hideBtn, ui.ordBtn, ui.spdBtn);

        ui.healBtn = createPart('div', STYLES.btn + "background:#131;", "HEAL");
        ui.healSub = createPart('div', "display:none; flex-direction:column; gap:3px;");
        ui.repBtn  = createPart('div', STYLES.btn, "Rep");
        ui.modBtn  = createPart('div', STYLES.btn, "Mod");
        ui.itmBtn  = createPart('div', STYLES.btn, "Item");
        ui.cntLbl  = createPart('div', "width:75px; height:20px; background:#000; color:#0f0; font-size:11px; font-weight:bold; display:flex; align-items:center; justify-content:center; border:1px solid #444;", "--");
        ui.healSub.append(ui.repBtn, ui.modBtn, ui.itmBtn, ui.cntLbl);

        ui.subBox.append(ui.atkBtn, ui.atkSub, ui.healBtn, ui.healSub);
        c.append(ui.mBtn, ui.subBox);
        document.body.appendChild(c);

        makeDraggable(c, ui.mBtn);
        attachEvents();
        updateEquipSelectorDOM();
        refreshUI();
    }

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

    function refreshUI() {
        if (!ui.mBtn) return;
        ui.subBox.style.display  = state.masterActive ? "flex" : "none";
        ui.atkSub.style.display  = (state.masterActive && state.atkActive)  ? "flex" : "none";
        ui.healSub.style.display = (state.masterActive && state.healActive) ? "flex" : "none";

        ui.specBtn.style.color = state.specialActive ? "#f0f" : "#666";
        ui.hideBtn.style.color = state.hideoutActive ? "#ff0" : "#666";
        ui.ordBtn.innerText    = `順:${{TOP:"上",BTM:"下",RND:"乱"}[state.targetOrder]}`;
        ui.spdBtn.innerText    = {150:"高速",450:"中速",750:"低速",0:"最速!!"}[state.atkWait] || "高速";
        ui.repBtn.style.color  = state.repairEnabled ? "#5bc" : "#666";
        ui.modBtn.innerHTML    = `Mod:<span style="color:${state.equipMode!=='N'?'#ff0':'#fff'}">${state.equipMode}</span>`;
        ui.itmBtn.innerHTML    = fmt(state.targetHpName);

        const itm = state.availableItems[state.hpIndex];
        ui.cntLbl.innerText = itm ? (itm.remaining || itm.count || '--') : '--';
    }

    function attachEvents() {
        ui.mBtn.onclick    = () => { state.masterActive = !state.masterActive; save(); };
        ui.atkBtn.onclick  = () => { state.atkActive    = !state.atkActive;    save(); };
        ui.healBtn.onclick = () => { state.healActive   = !state.healActive;   save(); };
        ui.eqSel.onchange  = (e) => {
            state.targetEquipValue = e.target.value;
            state.currentEquipName = e.target.options[e.target.selectedIndex].text;
            localStorage.setItem('targetEquipValue', e.target.value);
            save();
        };
        ui.specBtn.onclick = () => { state.specialActive = !state.specialActive; save(); };
        ui.hideBtn.onclick = () => { state.hideoutActive = !state.hideoutActive; save(); };
        ui.ordBtn.onclick  = () => {
            state.targetOrder = ["TOP","BTM","RND"][(["TOP","BTM","RND"].indexOf(state.targetOrder)+1)%3];
            save();
        };
        ui.spdBtn.onclick  = () => {
            state.atkWait = [150,450,750,0][([150,450,750,0].indexOf(state.atkWait)+1)%4];
            save();
        };
        ui.repBtn.onclick  = () => { state.repairEnabled = !state.repairEnabled; save(); };
        ui.modBtn.onclick  = () => { state.equipMode = {"N":"A","A":"B","B":"N"}[state.equipMode]; save(); };

        ui.itmBtn.onclick  = () => {
            if (state.targetHpName === 'FREE') {
                if (state.availableItems.length) {
                    state.hpIndex = 0;
                    state.targetHpName = state.availableItems[0].name;
                    save();
                }
            } else {
                const nextIndex = state.hpIndex + 1;
                if (nextIndex >= state.availableItems.length) {
                    state.hpIndex = 0;
                    state.targetHpName = 'FREE';
                } else {
                    state.hpIndex = nextIndex;
                    state.targetHpName = state.availableItems[nextIndex].name;
                }
                save();
            }
        };
    }

    function makeDraggable(el, handle) {
        let isD = false, sx, sy, it, il;
        handle.onpointerdown = (e) => { if(state.masterActive) return; isD=true; handle.setPointerCapture(e.pointerId); sx=e.clientX; sy=e.clientY; it=el.offsetTop; il=el.offsetLeft; };
        handle.onpointermove = (e) => { if(isD){ state.pos.top=it+(e.clientY-sy); state.pos.left=il+(e.clientX-sx); el.style.top=state.pos.top+"px"; el.style.left=state.pos.left+"px"; } };
        handle.onpointerup   = () => { if(isD){ isD=false; save(); } };
    }

    function createPart(t, s, h="") { const e = document.createElement(t); e.style.cssText = s; e.innerHTML = h; return e; }

    function fmt(t, useBr = true) {
        if(!t || ["FREE","待機中","OFF"].includes(t)) return t || "--";
        let c = t.replace(/[0-9０-９:：\s]/g, '').replace('▼', '').trim().substring(0, useBr ? 10 : 7);
        return (useBr && c.length > 4) ? c.substring(0, 4) + "<br>" + c.substring(4) : c;
    }

    // --- 8. 起動 ---
    load();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initUI(); mainLoop(); });
    } else {
        initUI();
        mainLoop();
    }

})();