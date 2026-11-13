(() => {
  'use strict';

  // ===================================================================
  // 설정 & 저장소
  // ===================================================================
  const cfg = window.MEMO_CONFIG || {};
  const CONFIGURED = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const KEY_STORAGE = 'memo-secret-key';
  const VIEW_STORAGE = 'memo-view';
  const LOCAL_DATA = 'memo-local-v1';

  const storage = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
  };

  // ---- Supabase (비밀 키로 보호되는 DB 함수 호출) ----
  let sb = null;
  let secret = null;

  async function rpc(fn, args = {}) {
    const { data, error } = await sb.rpc(fn, { p_key: secret, ...args });
    if (error) {
      if (/invalid key/i.test(error.message || '')) {
        error.badKey = true;
        onBadKey();
      }
      throw error;
    }
    return data;
  }

  const cloudStore = {
    list: () => rpc('memo_list'),
    create: (m) => rpc('memo_create', { p_date: m.memo_date, p_title: m.title, p_content: m.content }),
    update: (id, m) => rpc('memo_update', { p_id: id, p_date: m.memo_date, p_title: m.title, p_content: m.content }),
    remove: (id) => rpc('memo_delete', { p_id: id }),
  };

  // ---- 로컬 모드 (Supabase 설정 전, 이 브라우저에만 저장) ----
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const localStore = {
    read() {
      try { return JSON.parse(storage.get(LOCAL_DATA)) || []; } catch { return []; }
    },
    write(list) {
      if (!storage.set(LOCAL_DATA, JSON.stringify(list))) throw new Error('브라우저 저장소를 사용할 수 없어요');
    },
    async list() { return this.read(); },
    async create(m) {
      const now = new Date().toISOString();
      const memo = { id: uid(), created_at: now, updated_at: now, ...m };
      this.write([...this.read(), memo]);
      return memo;
    },
    async update(id, m) {
      const list = this.read();
      const i = list.findIndex((x) => x.id === id);
      if (i < 0) throw new Error('메모를 찾을 수 없어요');
      list[i] = { ...list[i], ...m, updated_at: new Date().toISOString() };
      this.write(list);
      return list[i];
    },
    async remove(id) { this.write(this.read().filter((x) => x.id !== id)); },
  };

  let store = localStore;

  // ===================================================================
  // 유틸
  // ===================================================================
  const $ = (s) => document.querySelector(s);
  const WD = ['일', '월', '화', '수', '목', '금', '토'];
  const pad = (n) => String(n).padStart(2, '0');
  const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => toKey(new Date());
  const monthOf = (k) => { const d = fromKey(k); return new Date(d.getFullYear(), d.getMonth(), 1); };
  const fmtDay = (k) => { const d = fromKey(k); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
  const fmtDayShort = (k) => { const d = fromKey(k); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
  const errMsg = (e) => (e && (e.message || e.error_description)) || String(e);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) if (c != null && c !== false) node.append(c);
    return node;
  }

  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    (document.querySelector('dialog[open]') || document.body).append(t); // 열린 대화상자 위에도 보이도록
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function fail(prefix, err) {
    if (err && err.badKey) return; // 키 화면으로 이미 전환됨
    console.error(err);
    toast(`${prefix}: ${errMsg(err)}`);
  }
  const setLoading = (on) => document.body.classList.toggle('loading', on);

  // ===================================================================
  // 상태
  // ===================================================================
  const state = {
    memos: [],
    view: storage.get(VIEW_STORAGE) === 'list' ? 'list' : 'calendar',
    month: monthOf(todayKey()),
    selected: todayKey(),
    query: '',     // 소문자, 비교용
    rawQuery: '',  // 화면 표시용
  };

  function sortMemos() {
    state.memos.sort((a, b) =>
      b.memo_date.localeCompare(a.memo_date) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  }
  function groupByDate(memos) {
    const map = new Map();
    for (const m of memos) {
      if (!map.has(m.memo_date)) map.set(m.memo_date, []);
      map.get(m.memo_date).push(m);
    }
    return map;
  }

  // ===================================================================
  // 검색 도우미
  // ===================================================================
  const matches = (m, q) => (m.title || '').toLowerCase().includes(q) || (m.content || '').toLowerCase().includes(q);

  function highlight(text, q) {
    if (!q) return [text];
    const lower = text.toLowerCase();
    const out = [];
    let i = 0;
    for (;;) {
      const j = lower.indexOf(q, i);
      if (j < 0) { out.push(text.slice(i)); break; }
      if (j > i) out.push(text.slice(i, j));
      out.push(el('mark', {}, text.slice(j, j + q.length)));
      i = j + q.length;
    }
    return out;
  }

  function snippet(content, q, len = 90) {
    const text = (content || '').replace(/\s+/g, ' ').trim();
    if (!q) return text.slice(0, len);
    const j = text.toLowerCase().indexOf(q);
    if (j < 0) return text.slice(0, len);
    const start = Math.max(0, j - 24);
    return (start > 0 ? '…' : '') + text.slice(start, start + len);
  }

  // ===================================================================
  // 렌더링
  // ===================================================================
  function render() {
    document.querySelectorAll('.seg button').forEach((b) =>
      b.classList.toggle('active', b.dataset.view === state.view));
    let content;
    if (state.query) content = renderSearch();
    else if (state.view === 'calendar') content = renderCalendar();
    else content = renderList();
    $('#main').replaceChildren(content);
  }

  function memoItem(m) {
    const q = state.query;
    const title = (m.title || '').trim();
    const snip = snippet(m.content, q);
    return el('button', { class: 'memo-item', type: 'button', onclick: () => openEditor(m) },
      el('div', { class: title ? 'memo-title' : 'memo-title untitled' }, ...highlight(title || '(제목 없음)', title ? q : '')),
      snip ? el('div', { class: 'memo-snippet' }, ...highlight(snip, q)) : null);
  }

  function groupedList(memos) {
    const today = todayKey();
    return el('div', {}, [...groupByDate(memos)].map(([date, items]) =>
      el('section', { class: 'group' },
        el('h3', { class: date === today ? 'group-date today' : 'group-date' }, fmtDay(date) + (date === today ? ' · 오늘' : '')),
        el('div', { class: 'group-items' }, items.map(memoItem)))));
  }

  const empty = (text) => el('p', { class: 'empty' }, text);

  function renderSearch() {
    const results = state.memos.filter((m) => matches(m, state.query));
    return el('section', { class: 'panel' },
      el('div', { class: 'panel-head' },
        el('h2', {}, `‘${state.rawQuery}’ 검색 결과`),
        el('span', { class: 'count' }, `${results.length}개`)),
      results.length ? groupedList(results) : empty('일치하는 메모가 없어요.'));
  }

  function renderList() {
    return el('section', { class: 'panel' },
      el('div', { class: 'panel-head' },
        el('h2', {}, '전체 메모'),
        el('span', { class: 'count' }, `${state.memos.length}개`)),
      state.memos.length ? groupedList(state.memos) : empty('아직 메모가 없어요. + 버튼으로 첫 메모를 남겨 보세요.'));
  }

  function renderCalendar() {
    const map = groupByDate(state.memos);
    const y = state.month.getFullYear();
    const mo = state.month.getMonth();
    const first = new Date(y, mo, 1);
    const last = new Date(y, mo + 1, 0);
    const start = new Date(y, mo, 1 - first.getDay());
    const end = new Date(y, mo, last.getDate() + (6 - last.getDay()));
    const today = todayKey();

    const grid = el('div', { class: 'cal-grid' }, WD.map((w, i) => el('div', { class: `cal-wd wd-${i}` }, w)));
    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = toKey(d);
      const items = map.get(key) || [];
      const cls = ['cell', `wd-${d.getDay()}`];
      if (d.getMonth() !== mo) cls.push('other');
      if (key === today) cls.push('today');
      if (key === state.selected) cls.push('selected');
      grid.append(el('button', {
        type: 'button',
        class: cls.join(' '),
        'aria-label': `${fmtDay(key)}, 메모 ${items.length}개`,
        'aria-pressed': key === state.selected ? 'true' : 'false',
        onclick: () => selectDay(key),
      },
      el('span', { class: 'daynum' }, String(d.getDate())),
      el('div', { class: 'cell-titles' },
        items.slice(0, 3).map((m) => el('div', { class: 'cell-title' }, (m.title || '').trim() || '(제목 없음)')),
        items.length > 3 ? el('div', { class: 'cell-more' }, `+${items.length - 3}개`) : null),
      items.length ? el('div', { class: 'cell-dots' },
        el('span', { class: 'dot' }),
        items.length > 1 ? el('span', { class: 'cell-count' }, String(items.length)) : null) : null));
    }

    // 휴대폰에서 좌우로 밀어 달 이동
    let touchX = null;
    grid.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    grid.addEventListener('touchend', (e) => {
      if (touchX == null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 60) shiftMonth(dx < 0 ? 1 : -1);
    });

    const dayItems = map.get(state.selected) || [];
    return el('div', { class: 'cal-layout' },
      el('section', { class: 'panel' },
        el('div', { class: 'cal-head' },
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': '이전 달', onclick: () => shiftMonth(-1) }, '‹'),
          el('h2', { class: 'cal-title' }, `${y}년 ${mo + 1}월`),
          el('button', { class: 'icon-btn', type: 'button', 'aria-label': '다음 달', onclick: () => shiftMonth(1) }, '›'),
          el('button', { class: 'btn ghost small', type: 'button', onclick: goToday }, '오늘')),
        grid),
      el('section', { class: 'panel day-panel' },
        el('div', { class: 'panel-head' },
          el('h2', {}, fmtDayShort(state.selected)),
          el('button', { class: 'btn small', type: 'button', onclick: () => openEditor(null, state.selected) }, '+ 메모')),
        dayItems.length ? el('div', { class: 'group-items' }, dayItems.map(memoItem)) : empty('이 날의 메모가 없어요.')));
  }

  function selectDay(key) {
    state.selected = key;
    state.month = monthOf(key);
    render();
  }
  function shiftMonth(n) {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + n, 1);
    const today = todayKey();
    state.selected = monthOf(today).getTime() === state.month.getTime() ? today : toKey(state.month);
    render();
  }
  function goToday() { selectDay(todayKey()); }

  // ===================================================================
  // 데이터 불러오기
  // ===================================================================
  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    setLoading(true);
    try {
      const list = await store.list();
      if (seq !== loadSeq) return;
      state.memos = Array.isArray(list) ? list : [];
      sortMemos();
      render();
      backup.syncSilently(); // 다른 기기에서 바뀐 내용도 백업 파일에 반영 (PC)
    } catch (err) {
      fail('불러오기 실패', err);
    } finally {
      if (seq === loadSeq) setLoading(false);
    }
  }

  // ===================================================================
  // 편집기
  // ===================================================================
  const dlg = $('#editor');
  let editing = null;
  let snapshot = '';
  const formValue = () => JSON.stringify([$('#ed-date').value, $('#ed-title').value, $('#ed-content').value]);

  function openEditor(memo, dateKey) {
    editing = memo;
    const fallbackDate = state.view === 'calendar' && !state.query ? state.selected : todayKey();
    $('#ed-date').value = memo ? memo.memo_date : (dateKey || fallbackDate);
    $('#ed-title').value = memo ? memo.title || '' : '';
    $('#ed-content').value = memo ? memo.content || '' : '';
    $('#ed-delete').hidden = !memo;
    snapshot = formValue();
    dlg.showModal();
    if (!memo) $('#ed-title').focus();
    else $('#ed-content').scrollTop = 0;
  }

  function closeEditor(force = false) {
    if (!dlg.open) return;
    if (!force && formValue() !== snapshot && !confirm('저장하지 않은 내용이 있어요. 닫을까요?')) return;
    dlg.close();
    editing = null;
  }

  function setEditorBusy(on) {
    for (const id of ['#ed-save', '#ed-delete', '#ed-cancel']) $(id).disabled = on;
  }

  async function saveEditor() {
    const payload = {
      memo_date: $('#ed-date').value,
      title: $('#ed-title').value.trim(),
      content: $('#ed-content').value.replace(/\s+$/, ''),
    };
    if (!payload.memo_date) return toast('날짜를 선택하세요');
    if (!payload.title && !payload.content.trim()) return toast('제목이나 내용을 입력하세요');

    setEditorBusy(true);
    try {
      await backup.prepare(); // 버튼을 누른 직후에 백업 파일 권한 확보
      if (editing) {
        const updated = await store.update(editing.id, payload);
        state.memos = state.memos.map((m) => (m.id === updated.id ? updated : m));
      } else {
        state.memos.push(await store.create(payload));
      }
      sortMemos();
      state.selected = payload.memo_date;
      state.month = monthOf(payload.memo_date);
      closeEditor(true);
      render();
      toast('저장했어요' + (await backup.afterChange()));
    } catch (err) {
      fail('저장 실패', err);
    } finally {
      setEditorBusy(false);
    }
  }

  async function deleteEditing() {
    if (!editing || !confirm('이 메모를 삭제할까요?')) return;
    setEditorBusy(true);
    try {
      await backup.prepare();
      await store.remove(editing.id);
      const id = editing.id;
      state.memos = state.memos.filter((m) => m.id !== id);
      closeEditor(true);
      render();
      toast('삭제했어요' + (await backup.afterChange()));
    } catch (err) {
      fail('삭제 실패', err);
    } finally {
      setEditorBusy(false);
    }
  }

  // ===================================================================
  // 백업 (giho_memo_backup.txt)
  //  - PC Chrome/Edge: 처음 고른 위치의 파일을 계속 덮어씀 (File System Access API)
  //  - 그 외(Android 등): 다운로드 폴더로 파일 내려받기
  // ===================================================================
  const BACKUP_NAME = 'giho_memo_backup.txt';
  const BK_AUTO = 'memo-backup-auto';
  const BK_LAST = 'memo-backup-last';
  const BK_HASH = 'memo-backup-hash';
  const FS_SUPPORTED = typeof window.showSaveFilePicker === 'function';

  // 파일 위치(핸들)는 localStorage에 못 넣어서 IndexedDB에 보관
  const idb = {
    open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('memo-app', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async run(mode, fn) {
      // 브라우저 저장소가 응답하지 않아도(사생활 보호 모드 등) 앱이 멈추지 않도록 시간 제한
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('IndexedDB 응답 없음')), 2000));
      const job = (async () => {
        const db = await this.open();
        return new Promise((resolve, reject) => {
          const req = fn(db.transaction('kv', mode).objectStore('kv'));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      })();
      return Promise.race([job, timeout]);
    },
    get(k) { return this.run('readonly', (s) => s.get(k)); },
    set(k, v) { return this.run('readwrite', (s) => s.put(v, k)); },
    del(k) { return this.run('readwrite', (s) => s.delete(k)); },
  };

  const fmtStamp = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return `${toKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  function hashMemos(memos) {
    const s = JSON.stringify(memos.map((m) => [m.id, m.memo_date, m.title, m.content, m.updated_at]));
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return `${memos.length}-${h.toString(16)}`;
  }

  function buildBackupText(memos) {
    const line = '='.repeat(60);
    const thin = '-'.repeat(60);
    const out = [
      'giho 메모 백업',
      `백업 시각: ${fmtStamp(new Date())}`,
      `메모 수: ${memos.length}개`,
      line,
    ];
    for (const m of memos) {
      out.push(
        '',
        `[${fmtDay(m.memo_date)}] ${(m.title || '').trim() || '(제목 없음)'}`,
        `작성: ${fmtStamp(m.created_at)}  /  수정: ${fmtStamp(m.updated_at)}`,
        thin,
        (m.content || '').replace(/\r?\n/g, '\r\n'),
        '',
        line,
      );
    }
    return '﻿' + out.join('\r\n') + '\r\n'; // BOM: 메모장 등에서 한글 깨짐 방지
  }

  function downloadText(text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = el('a', { href: url, download: BACKUP_NAME, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  const backup = {
    handle: null,
    auto: storage.get(BK_AUTO) !== 'off',
    note: '',
    ready: Promise.resolve(),

    async init() {
      if (!FS_SUPPORTED) return;
      try { this.handle = (await idb.get('backupHandle')) || null; } catch { this.handle = null; }
    },

    setAuto(on) {
      this.auto = on;
      storage.set(BK_AUTO, on ? 'on' : 'off');
      renderBackupDialog();
    },

    async pickLocation() {
      const handle = await window.showSaveFilePicker({
        suggestedName: BACKUP_NAME,
        startIn: 'downloads',
        types: [{ description: '텍스트 파일', accept: { 'text/plain': ['.txt'] } }],
      });
      this.handle = handle;
      idb.set('backupHandle', handle).catch(() => { /* 이번 세션만 유지 */ });
      renderBackupDialog();
      return handle;
    },

    async hasPermission(interactive) {
      if (!this.handle) return false;
      const opts = { mode: 'readwrite' };
      if ((await this.handle.queryPermission(opts)) === 'granted') return true;
      if (!interactive) return false;
      return (await this.handle.requestPermission(opts)) === 'granted';
    },

    // 저장/삭제 버튼을 누른 직후(사용자 동작이 살아 있을 때) 호출해 위치·권한을 미리 확보
    async prepare() {
      this.note = '';
      await this.ready;
      if (!this.auto || !FS_SUPPORTED) return;
      try {
        if (!this.handle) await this.pickLocation();
        else await this.hasPermission(true);
      } catch (err) {
        if (err && err.name === 'AbortError') {
          this.setAuto(false);
          this.note = ' · 백업 위치를 정하지 않아 자동 백업을 껐어요 (백업 메뉴에서 다시 켤 수 있어요)';
        }
      }
    },

    // 실제 백업. 백업했으면 true, 건너뛰었으면 false. 실패하면 throw.
    async run({ manual = false } = {}) {
      await this.ready;
      const text = buildBackupText(state.memos);
      if (FS_SUPPORTED) {
        if (!this.handle) {
          if (!manual) return false;
          await this.pickLocation();
        }
        if (!(await this.hasPermission(manual))) {
          if (!manual) return false;
          throw new Error('백업 파일에 쓸 권한이 없어요');
        }
        try {
          const w = await this.handle.createWritable();
          await w.write(new Blob([text], { type: 'text/plain;charset=utf-8' }));
          await w.close();
        } catch (err) {
          if (err && err.name === 'NotFoundError') {
            this.handle = null;
            idb.del('backupHandle').catch(() => {});
            renderBackupDialog();
            throw new Error('백업 파일을 찾을 수 없어요. 백업 메뉴에서 위치를 다시 정해 주세요');
          }
          throw err;
        }
      } else {
        downloadText(text);
      }
      storage.set(BK_LAST, new Date().toISOString());
      storage.set(BK_HASH, hashMemos(state.memos));
      renderBackupDialog();
      return true;
    },

    // 메모 추가/수정/삭제 직후 호출. 토스트 뒤에 붙일 문구를 돌려줌
    async afterChange() {
      if (this.note) { const n = this.note; this.note = ''; return n; }
      if (!this.auto) return '';
      try {
        return (await this.run()) ? ' · 백업 완료' : ' · 백업 건너뜀 (백업 메뉴 확인)';
      } catch (err) {
        console.error(err);
        return ` · 백업 실패: ${errMsg(err)}`;
      }
    },

    // 앱을 열거나 다시 돌아왔을 때: 내용이 바뀌었으면 조용히 백업 파일 갱신 (권한이 이미 있는 PC만)
    async syncSilently() {
      await this.ready;
      if (!FS_SUPPORTED || !this.auto || !this.handle) return;
      if (storage.get(BK_HASH) === hashMemos(state.memos)) return;
      try {
        if (await this.hasPermission(false)) await this.run();
      } catch (err) {
        console.warn('자동 백업 동기화 실패', err);
      }
    },
  };

  function renderBackupDialog() {
    const dlgEl = $('#backup-dlg');
    if (!dlgEl || !dlgEl.open) return;
    $('#bk-desc').textContent = FS_SUPPORTED
      ? `처음 한 번 저장 위치를 고르면, 그 위치의 ${BACKUP_NAME} 파일에 모든 메모를 덮어써서 저장해요. 다른 기기에서 바뀐 내용은 이 기기에서 앱을 열 때 반영돼요.`
      : `이 기기의 다운로드 폴더에 ${BACKUP_NAME}로 모든 메모를 저장해요. 이 브라우저는 기존 파일 덮어쓰기를 지원하지 않아서, 같은 이름의 파일이 있으면 번호가 붙을 수 있어요. 가장 최근 파일이 최신 백업이에요.`;
    $('#bk-file').textContent = FS_SUPPORTED
      ? (backup.handle ? `${backup.handle.name} (위치 지정됨)` : '아직 위치를 정하지 않았어요')
      : `다운로드 폴더 / ${BACKUP_NAME}`;
    const last = storage.get(BK_LAST);
    $('#bk-last').textContent = last ? fmtStamp(last) : '아직 없음';
    $('#bk-auto').checked = backup.auto;
    $('#bk-pick').hidden = !FS_SUPPORTED;
    $('#bk-pick').textContent = backup.handle ? '저장 위치 변경' : '저장 위치 선택';
  }

  function openBackupDialog() {
    $('#backup-dlg').showModal();
    renderBackupDialog();
  }

  async function manualBackup() {
    const btn = $('#bk-now');
    btn.disabled = true;
    try {
      await backup.run({ manual: true });
      toast(FS_SUPPORTED ? `${BACKUP_NAME}에 백업했어요` : `다운로드 폴더에 ${BACKUP_NAME}를 저장했어요`);
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 위치 선택 취소
      fail('백업 실패', err);
    } finally {
      btn.disabled = false;
    }
  }

  // ===================================================================
  // 화면 전환 & 비밀 키
  // ===================================================================
  function showApp() {
    $('#auth').hidden = true;
    $('#app').hidden = false;
    render();
  }

  function showKeyScreen(message = '', isError = false) {
    $('#app').hidden = true;
    $('#auth').hidden = false;
    const msg = $('#auth-msg');
    msg.textContent = message;
    msg.classList.toggle('error', isError);
    $('#auth-key').focus();
  }

  function onBadKey() {
    secret = null;
    storage.del(KEY_STORAGE);
    state.memos = [];
    closeEditor(true);
    showKeyScreen('비밀 키가 맞지 않거나 바뀌었어요. 다시 입력하세요.', true);
  }

  async function submitKey(e) {
    e.preventDefault();
    const input = $('#auth-key');
    const key = input.value;
    const msg = $('#auth-msg');
    if (!key) { msg.textContent = '비밀 키를 입력하세요.'; msg.classList.add('error'); return; }

    $('#auth-submit').disabled = true;
    msg.textContent = '확인 중…';
    msg.classList.remove('error');
    try {
      secret = key;
      const ok = await rpc('memo_check');
      if (!ok) {
        secret = null;
        msg.textContent = '비밀 키가 맞지 않아요.';
        msg.classList.add('error');
        return;
      }
      if (!storage.set(KEY_STORAGE, key)) toast('브라우저에 키를 저장하지 못해서 다음에 다시 입력해야 해요');
      input.value = '';
      showApp();
      await load();
    } catch (err) {
      secret = null;
      msg.textContent = `연결 실패: ${errMsg(err)}`;
      msg.classList.add('error');
    } finally {
      $('#auth-submit').disabled = false;
    }
  }

  function lock() {
    if (!confirm('이 기기에서 비밀 키를 지울까요?\n다시 쓰려면 비밀 키를 입력해야 해요.')) return;
    secret = null;
    storage.del(KEY_STORAGE);
    state.memos = [];
    showKeyScreen();
  }

  // ===================================================================
  // 이벤트 연결
  // ===================================================================
  function bindUI() {
    // 보기 전환
    document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      state.view = b.dataset.view;
      storage.set(VIEW_STORAGE, state.view);
      if (state.query) { state.query = state.rawQuery = ''; $('#search').value = ''; }
      render();
    }));

    // 검색
    const search = $('#search');
    let searchTimer;
    search.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.rawQuery = search.value.trim();
        state.query = state.rawQuery.toLowerCase();
        render();
      }, 120);
    });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && search.value) {
        search.value = '';
        state.query = state.rawQuery = '';
        render();
      }
    });
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
      if (e.key === '/' && !typing && !dlg.open && !$('#app').hidden) { e.preventDefault(); search.focus(); }
    });

    // 새 메모, 잠금
    $('#fab').addEventListener('click', () => openEditor(null));
    $('#lock-btn').addEventListener('click', lock);

    // 편집기
    $('#editor-form').addEventListener('submit', (e) => { e.preventDefault(); saveEditor(); });
    $('#ed-delete').addEventListener('click', deleteEditing);
    $('#ed-cancel').addEventListener('click', () => closeEditor());
    $('#ed-close').addEventListener('click', () => closeEditor());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeEditor(); }); // Esc / 뒤로가기
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeEditor(); }); // 바깥 클릭
    dlg.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#editor-form').requestSubmit(); }
    });
    $('#ed-title').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('#ed-content').focus(); }
    });

    // 백업
    const bkDlg = $('#backup-dlg');
    $('#backup-btn').addEventListener('click', openBackupDialog);
    $('#bk-close').addEventListener('click', () => bkDlg.close());
    bkDlg.addEventListener('click', (e) => { if (e.target === bkDlg) bkDlg.close(); });
    $('#bk-now').addEventListener('click', manualBackup);
    $('#bk-pick').addEventListener('click', async () => {
      try { await backup.pickLocation(); toast('저장 위치를 정했어요'); } catch (err) {
        if (!err || err.name !== 'AbortError') fail('위치 선택 실패', err);
      }
    });
    $('#bk-auto').addEventListener('change', async (e) => {
      const on = e.target.checked;
      if (on && FS_SUPPORTED && !backup.handle) {
        try { await backup.pickLocation(); } catch {
          e.target.checked = false;
          return;
        }
      }
      backup.setAuto(on);
    });

    // 비밀 키
    $('#auth-form').addEventListener('submit', submitKey);

    // 다른 기기에서 고친 내용 반영: 앱으로 돌아올 때 새로고침
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && store === cloudStore && secret && !dlg.open) load();
    });
  }

  // ===================================================================
  // 시작
  // ===================================================================
  async function init() {
    bindUI();
    backup.ready = backup.init(); // 화면 표시를 기다리게 하지 않음

    if (!CONFIGURED) {
      store = localStore;
      $('#local-banner').hidden = false;
      showApp();
      load();
      return;
    }

    if (!window.supabase) {
      showKeyScreen('Supabase 라이브러리를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침하세요.', true);
      $('#auth-submit').disabled = true;
      return;
    }

    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    store = cloudStore;
    $('#lock-btn').hidden = false;

    const saved = storage.get(KEY_STORAGE);
    if (saved) {
      secret = saved;
      showApp();
      load();
    } else {
      showKeyScreen();
    }
  }

  init();
})();
