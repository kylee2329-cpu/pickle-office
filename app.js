/* =========================================================
   합동 비서실 · Shared Pickle Office
   Vanilla JS · 로컬 데모 모드 + Firebase Realtime Database REST
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- helpers ---------------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  // 답글(인용)에 싣는 원문 요약 길이 — 80자 내외
  const SUMMARY_LEN = 80;
  const summarize = (s) => {
    const one = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return one.length > SUMMARY_LEN ? one.slice(0, SUMMARY_LEN - 1).trimEnd() + '…' : one;
  };
  const timeHM = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dayKey = (ts) => new Date(ts).toDateString();
  const dayLabel = (ts) => {
    const d = new Date(ts), now = new Date();
    if (d.toDateString() === now.toDateString()) return '오늘';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return '어제';
    return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
  };

  const LS = {
    msgs: 'po.messages.v1',
    seats: 'po.seats.v1',
    fb: 'po.fb.v1',
    demo: 'po.demo.v1',
    client: 'po.client.v1',
    // v2: '대표님'(owner)이 기본 발신자가 되면서 키를 올렸습니다. (v1에 'reika'가 남아 있어도 새 기본값 적용)
    sender: 'po.sender.v2',
  };

  // 합동 비서실 공용 Realtime Database — 저장된 다른 URL이 없으면 이 주소로 바로 연결합니다.
  const DEFAULT_FB = 'https://pickle-office-c7e87-default-rtdb.firebaseio.com';
  // 이 DB에는 인덱스 규칙이 없어 limitToLast에는 orderBy가 함께 있어야 합니다.
  const MSG_QUERY = '/messages.json?orderBy=%22%24key%22&limitToLast=300';
  const readJSON = (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (_) { return fallback; }
  };
  const writeJSON = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch (_) {} };

  /* ---------------- data ---------------- */
  const ROOMS = {
    main: {
      name: '메인 오피스', en: 'MAIN OFFICE', icon: '🗂', color: '#5c6b8a',
      desc: '여섯 비서가 하루 업무를 나누고 서로의 상태를 확인하는 중심 공간이에요.',
    },
    meet: {
      name: '회의실', en: 'MEETING ROOM', icon: '📋', color: '#7a5aa8',
      desc: '안건을 모아 결정하는 방. 큰 테이블과 스크린이 있어요.',
    },
    work: {
      name: '작업실', en: 'WORKSTATION', icon: '🖥', color: '#2f7d6c',
      desc: '모니터와 장비를 두고 실제 작업을 처리하는 실행 공간이에요.',
    },
    lounge: {
      name: '라운지', en: 'LOUNGE', icon: '☕', color: '#a9773f',
      desc: '소파와 커피, 잠깐 숨을 고르는 자리예요.',
    },
  };
  const ROOM_ORDER = ['main', 'meet', 'work', 'lounge'];

  // /agents/<id>.json 의 status 값
  const STATUS = {
    working: { label: '작업 중', icon: '🖥' },
    meeting: { label: '회의 중', icon: '📋' },
    idle: { label: '대기', icon: '💤' },
    resting: { label: '휴식', icon: '☕' },
  };
  const defaultStatus = (room) => (room === 'meet' ? 'meeting' : room === 'lounge' ? 'resting' : 'working');
  // 다른 피클이 쓴 이름도 같은 캐릭터로 받아 줍니다.
  const AGENT_ALIASES = {
    kyle: 'kyle', cloie: 'cloie', chloe: 'cloie',
    aika: 'aika', peika: 'peika',
    reika: 'reika', leika: 'reika', laika: 'reika',
    seika: 'seika',
  };

  // 자리 좌표는 SVG 평면도 좌표계(1000 x 640) 기준
  const SLOTS = {
    main: [[120, 218], [240, 218], [356, 218], [150, 290], [268, 290], [378, 290]],
    meet: [[542, 206], [856, 206], [690, 124], [790, 124], [690, 296], [790, 296]],
    work: [[290, 478], [190, 478], [368, 470], [240, 552], [330, 552], [152, 530]],
    lounge: [[600, 548], [712, 556], [792, 548], [556, 470], [884, 472], [770, 452]],
  };

  const CHARS = [
    {
      id: 'kyle', name: 'KYLE', rank: 1, title: '총괄 PM', color: '#4a5a7a', size: 84, room: 'main',
      role: '일정과 우선순위를 총괄하고, 팀의 결과를 최종 검수해 보고합니다.',
      quote: '오늘 우선순위부터 정리할게요.',
      paths: ['M38 30H82V92', 'M38 61H82'], stroke: 15, eyes: [[53, 78, 4.4], [69, 78, 4.4]], mouth: [61, 87],
      lines: ['오늘 우선순위부터 정리할게요.', '보고는 한 장으로 부탁해요.', '일정 충돌 없는지 확인 중입니다.', '좋아요, 그 순서로 갑시다.'],
      replies: ['확인했습니다. 우선순위에 올려 둘게요.', '일정 확인하고 다시 알려 드릴게요.', '좋은데요. 제가 최종 검수까지 볼게요.'],
    },
    {
      id: 'cloie', name: '클로이', rank: 2, title: '비서실장', color: '#c9506f', size: 78, room: 'main',
      role: '업무를 나누고 인수인계를 챙기며, 팀의 결과물 품질을 점검합니다.',
      quote: '인수인계 노트 업데이트했어요.',
      paths: ['M64 14V26', 'M40 38H88', 'M64 38V50', 'M64 50 40 94', 'M64 50 88 94'], stroke: 15,
      eyes: [[57, 74, 4.2], [71, 74, 4.2]], mouth: [64, 83],
      lines: ['인수인계 노트 업데이트했어요.', '회의실 10분 뒤에 비워 둘게요.', '품질 점검 끝났습니다.', '새로 온 업무는 저에게 주세요.'],
      replies: ['네, 인수인계 노트에 적어 둘게요.', '제가 팀에 나눠서 진행할게요.', '확인했어요. 회의실에서 정리해요.'],
    },
    {
      id: 'aika', name: '아이카', rank: 3, title: '마케팅·기획', color: '#0f9d78', size: 76, room: 'meet',
      role: '콘텐츠를 기획하고 캠페인을 실행해요. 지표를 보고 다음 수를 제안합니다.',
      quote: '이번 주 콘텐츠 초안 나왔어요.',
      circle: [64, 60, 30, 15], belly: true,
      eyes: [[56, 56, 4.6], [72, 56, 4.6]], mouth: [64, 67], blush: [[48, 64], [80, 64]],
      lines: ['이번 주 콘텐츠 초안 나왔어요.', '캠페인 지표 같이 보실래요?', '기획안 두 개 비교 중이에요.'],
      replies: ['초안 두 개로 준비해 둘게요.', '지표 먼저 확인하고 말씀드릴게요.', '좋아요, 그 방향으로 기획해 볼게요.'],
    },
    {
      id: 'peika', name: '페이카', rank: 4, title: '운영 지원', color: '#e08a1e', size: 78, room: 'work',
      role: '데이터를 정리하고 리포트를 만들며 반복 업무를 자동화합니다.',
      quote: '데이터 정리해서 올렸어요.',
      paths: ['M36 34V96', 'M92 34V96', 'M22 34H106', 'M22 96H106'], stroke: 15,
      eyes: [[56, 60, 4.8], [72, 60, 4.8]], mouth: [64, 72], blush: [[48, 72], [80, 72]],
      lines: ['데이터 정리해서 올렸어요.', '자동화 스크립트 돌려볼게요.', '리포트 마감 맞출게요.'],
      replies: ['숫자로 정리해서 올려 둘게요.', '자동화로 돌려 놓고 결과 알려 드릴게요.', '리포트에 반영해 둘게요.'],
    },
    {
      id: 'reika', name: '레이카', rank: 5, title: '에그만 운영', color: '#7048e8', size: 82, room: 'main',
      role: '에그만 주문·CS·재고를 확인하고 평일 브리핑을 올립니다.',
      quote: '에그만 주문 확인하고 있어요.',
      paths: ['M64 24 26 100', 'M64 24 102 100'], stroke: 16,
      eyes: [[57, 72, 4.2], [71, 72, 4.2]], mouth: [64, 82], blush: [[48, 84], [80, 84]],
      lines: ['에그만 주문 확인하고 있어요.', '오늘 브리핑 준비 중이에요.', '@레이카 로 부르면 바로 답할게요.'],
      replies: ['네, 확인하고 바로 정리해서 올릴게요.', '에그만 쪽은 제가 보고 있어요. 조금만 기다려 주세요.', '브리핑에 넣어 둘게요!'],
    },
    {
      id: 'seika', name: '세이카', rank: 6, title: '리서치·모니터링', color: '#1c8fc4', size: 74, room: 'lounge',
      role: '시장과 이슈를 살피고 키워드 알림으로 팀에 먼저 알려 줍니다.',
      quote: '시장 동향 스캔 중입니다.',
      paths: ['M64 12V23', 'M38 37H90'], circle: [64, 72, 25, 14], belly: true,
      eyes: [[56, 68, 4.2], [72, 68, 4.2]], mouth: [64, 79], blush: [[50, 76], [78, 76]],
      lines: ['시장 동향 스캔 중입니다.', '키워드 알림 걸어 뒀어요.', '경쟁사 업데이트 정리했어요.'],
      replies: ['키워드로 계속 지켜보고 알려 드릴게요.', '관련 소식 찾아서 정리해 둘게요.', '좋은 타이밍이에요. 자료 준비할게요.'],
    },
  ];

  const byId = Object.fromEntries(CHARS.map((c) => [c.id, c]));

  // 채팅 발신자 전용 '대표님'. 오피스 맵 캐릭터(CHARS)에는 넣지 않아 지도/자리/말풍선에는 나타나지 않습니다.
  const OWNER = { id: 'owner', name: '대표님', color: 'var(--owner-ink)' };
  const DEFAULT_SENDER = OWNER.id;
  const SENDERS = [OWNER, ...CHARS];
  const senderOf = (id) => (id === OWNER.id ? OWNER : (byId[id] || null));
  const TABS = [
    { id: 'all', label: '#전체' },
    { id: 'meet', label: '#회의실' },
    { id: 'work', label: '#작업실' },
  ];

  /* ---------------- state ---------------- */
  const state = {
    tab: 'all',
    sender: localStorage.getItem(LS.sender) || DEFAULT_SENDER,
    selected: null,
    seats: {},
    demoMsgs: [],
    liveMsgs: [],
    conn: 'demo',        // demo | live | error
    fb: null,
    agents: {},
    agentSig: {},
    agentBubble: {},
    agentLocalAt: {},
    online: {},
    unread: { all: 0, meet: 0, work: 0 },
    seenLive: new Set(),
    ownIds: new Set(),
    renderedKeys: new Set(),
    replyTo: null,
    bubbleIdx: 0,
    pollTimer: null,
    presenceTimer: null,
    presencePollTimer: null,
    agentPollTimer: null,
  };

  const agentIdOf = (key) => {
    const k = String(key == null ? '' : key).trim();
    if (!k) return null;
    if (byId[k]) return k;
    return AGENT_ALIASES[k.toLowerCase()] || null;
  };
  const clientId = (() => {
    let id = localStorage.getItem(LS.client);
    if (!id) { id = 'c-' + uid(); try { localStorage.setItem(LS.client, id); } catch (_) {} }
    return id;
  })();

  const currentMsgs = () => (state.conn === 'live' ? state.liveMsgs : state.demoMsgs);
  const seatOf = (id) => state.seats[id] || { room: 'main', idx: 0 };

  /* ---------------- glyphs ---------------- */
  function glyphSVG(c) {
    const blinkDelay = -((c.id.charCodeAt(0) * 7) % 55) / 10;
    const eyes = (c.eyes || []).map(([x, y, r]) => `
      <g>
        <ellipse class="eye" cx="${x}" cy="${y}" rx="${r}" ry="${r * 1.12}" fill="#2b2620" style="--blink:${blinkDelay.toFixed(1)}s"/>
        <circle cx="${x + 1.1}" cy="${y - 1.7}" r="${(r * 0.34).toFixed(2)}" fill="#ffffff" opacity=".9"/>
      </g>`).join('');
    const mouth = c.mouth
      ? `<path d="M${c.mouth[0] - 3.6} ${c.mouth[1]} q3.6 4.2 7.2 0" stroke="#2b2620" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : '';
    const blush = (c.blush || []).map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="3.1" fill="#ff8fa3" opacity=".5"/>`).join('');
    const belly = c.belly ? `<circle cx="${c.circle[0]}" cy="${c.circle[1]}" r="${c.circle[2] - c.circle[3] / 2 - 1}" fill="#ffffff" opacity=".62"/>` : '';
    const lines = c.paths ? c.paths.map((d) => `<path d="${d}"/>`).join('') : '';
    const ring = c.circle
      ? `<circle cx="${c.circle[0]}" cy="${c.circle[1]}" r="${c.circle[2]}" fill="none"/>`
      : '';
    return `<svg class="glyph" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse class="glyph-shadow" cx="64" cy="112" rx="30" ry="5.5"/>
      ${belly}
      <g class="glyph-lines" stroke="${c.color}" stroke-width="${c.stroke || 15}" stroke-linecap="round" stroke-linejoin="round" fill="none">${lines}${ring}</g>
      ${eyes}${mouth}${blush}
    </svg>`;
  }

  /* ---------------- seats & map ---------------- */
  function initSeats() {
    const saved = readJSON(LS.seats, null) || {};
    const seats = {};
    CHARS.forEach((c) => {
      const s = saved[c.id];
      seats[c.id] = (s && ROOMS[s.room] && Number.isInteger(s.idx))
        ? { room: s.room, idx: s.idx }
        : { room: c.room, idx: 0 };
    });
    // 같은 방 안의 자리 중복 정리
    CHARS.forEach((c) => {
      const room = seats[c.id].room;
      const used = new Set(
        Object.entries(seats)
          .filter(([id, v]) => id !== c.id && v.room === room)
          .map(([, v]) => v.idx)
      );
      if (used.has(seats[c.id].idx)) {
        let idx = 0;
        while (idx < 6 && used.has(idx)) idx++;
        seats[c.id].idx = idx % 6;
      }
    });
    state.seats = seats;
  }

  function seatPos(id) {
    const s = seatOf(id);
    const [x, y] = SLOTS[s.room][s.idx % 6];
    return { x: +(x / 10).toFixed(2), y: +(y / 6.4).toFixed(2) };
  }

  function freeSlot(room, exceptId) {
    const used = new Set(
      Object.entries(state.seats).filter(([id, v]) => id !== exceptId && v.room === room).map(([, v]) => v.idx)
    );
    let idx = 0;
    while (idx < 6 && used.has(idx)) idx++;
    return idx % 6;
  }

  function renderCritters() {
    const el = $('#critters');
    el.innerHTML = CHARS.map((c, i) => {
      const p = seatPos(c.id);
      return `<button class="critter" type="button" data-id="${c.id}"
        style="--x:${p.x}%;--y:${p.y}%;--size:${c.size}px;--delay:-${(i * 0.8).toFixed(1)}s"
        aria-label="${c.name} 비서 ${c.rank}순위, ${ROOMS[seatOf(c.id).room].name}, 역할 보기">
        <span class="bubble" data-bubble="${c.id}"></span>
        <span class="body">${glyphSVG(c)}</span>
        <span class="name-tag" style="--tag-c:${c.color}"><b>${c.name}</b></span>
      </button>`;
    }).join('');
    updateSelection();
  }

  function updateCritterPositions() {
    CHARS.forEach((c) => {
      const btn = $(`.critter[data-id="${c.id}"]`);
      if (!btn) return;
      const p = seatPos(c.id);
      btn.style.setProperty('--x', p.x + '%');
      btn.style.setProperty('--y', p.y + '%');
      btn.setAttribute('aria-label', `${c.name} 비서 ${c.rank}순위, ${ROOMS[seatOf(c.id).room].name}, 역할 보기`);
    });
  }

  function updateScale() {
    const map = $('#map');
    const w = map.clientWidth || 900;
    const cs = clamp(w / 900, 0.54, 1.12);
    $('.critters').style.setProperty('--cs', cs.toFixed(3));
  }

  /* ---------------- selection / detail ---------------- */
  function updateSelection() {
    $$('.critter').forEach((b) => b.classList.toggle('is-selected', b.dataset.id === state.selected));
    $$('.char-chip').forEach((b) => b.classList.toggle('is-selected', b.dataset.id === state.selected));
    $('#map').classList.toggle('selecting', !!state.selected);
    $('#stageHint').textContent = state.selected
      ? `${byId[state.selected].name} 비서를 선택했어요 · 이동할 방을 눌러 보세요.`
      : '비서를 눌러 역할을 보고, 방을 눌러 이동시키세요.';
  }

  function selectChar(id) {
    state.selected = state.selected === id ? null : id;
    updateSelection();
    renderDetail();
    if (state.selected) {
      const btn = $(`.critter[data-id="${id}"]`);
      btn?.classList.add('is-selected');
      setBubble(id, byId[id].quote, true);
    }
  }

  function renderDetail() {
    const box = $('#detail');
    if (state.selected) {
      const c = byId[state.selected];
      const room = seatOf(c.id).room;
      const ag = state.conn === 'live' ? (state.agents[c.id] || null) : null;
      const st = ag && STATUS[ag.status] ? STATUS[ag.status] : null;
      box.innerHTML = `
        <div class="detail-inner" style="--dc:${c.color}">
          <div class="detail-avatar">${glyphSVG(c)}</div>
          <div class="detail-main">
            <div class="detail-title">
              <span class="name">${c.name}</span>
              <span class="rank-chip">${c.rank}순위</span>
              <span class="room-chip">${ROOMS[room].icon} ${ROOMS[room].name}</span>
              ${st ? `<span class="status-chip">${st.icon} ${st.label}</span>` : ''}
            </div>
            <p class="detail-role"><b>${c.title}</b> · ${c.role}</p>
            ${ag && ag.task && st ? `<p class="detail-task">“${esc(ag.task)}”</p>` : ''}
            <div class="move-row"><span>이동</span>
              ${ROOM_ORDER.map((r) => `<button class="move-btn${r === room ? ' is-here' : ''}" type="button" data-move="${c.id}" data-room="${r}">${ROOMS[r].name}</button>`).join('')}
            </div>
          </div>
          <button class="detail-close" type="button" data-close-detail aria-label="닫기">✕</button>
        </div>`;
      box.hidden = false;
    } else if (state.roomInfo) {
      const r = state.roomInfo;
      const people = CHARS.filter((c) => seatOf(c.id).room === r);
      box.innerHTML = `
        <div class="detail-inner" style="--dc:${ROOMS[r].color}">
          <div class="detail-avatar" style="display:grid;place-items:center;font-size:26px">${ROOMS[r].icon}</div>
          <div class="detail-main">
            <div class="detail-title">
              <span class="name">${ROOMS[r].name}</span>
              <span class="room-chip">${people.length}명</span>
            </div>
            <p class="detail-role">${ROOMS[r].desc}</p>
            <div class="detail-people">
              ${people.length
                ? people.map((c) => `<span class="person-chip" style="--dc:${c.color}">${glyphSVG(c)}${c.name}</span>`).join('')
                : '<span class="person-chip">지금은 아무도 없어요</span>'}
            </div>
          </div>
          <button class="detail-close" type="button" data-close-detail aria-label="닫기">✕</button>
        </div>`;
      box.hidden = false;
    } else {
      box.hidden = true;
      box.innerHTML = '';
    }
  }

  /* ---------------- movement ---------------- */
  function moveChar(id, room, opts = {}) {
    const c = byId[id];
    if (!c || !ROOMS[room]) return;
    const cur = seatOf(id);
    if (cur.room === room) {
      if (!opts.silent) toast(`${c.name} 비서는 이미 ${ROOMS[room].name}에 있어요.`);
      return;
    }
    state.seats[id] = { room, idx: freeSlot(room, id) };
    writeJSON(LS.seats, state.seats);
    updateCritterPositions();
    renderLegend();
    renderCharBar();
    if (state.selected === id) renderDetail();
    if (!opts.silent) toast(`${c.name} → ${ROOMS[room].name}`);
    setBubble(id, `${ROOMS[room].name}로 이동!`, true);
    if (state.conn === 'live') {
      pushPresence();
      pushAgent(id, room);
    }
  }

  /* ---------------- bubbles ---------------- */
  const bubbleUntil = {};
  function setBubble(id, text, force) {
    const el = $(`[data-bubble="${id}"]`);
    if (!el) return;
    el.textContent = text;
    el.classList.add('is-on');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('is-on'), force ? 4200 : 6000);
  }

  function tickBubbles() {
    // 서로 다른 방의 두 비서만 말풍선을 띄웁니다 (겹침 방지)
    const pool = [...CHARS].sort(() => Math.random() - 0.5);
    const picked = [];
    pool.forEach((c) => {
      if (picked.length >= 2) return;
      if (picked.some((p) => seatOf(p.id).room === seatOf(c.id).room)) return;
      picked.push(c);
    });
    picked.forEach((c) => {
      const ag = state.conn === 'live' ? state.agents[c.id] : null;
      const line = (ag && ag.task) || c.lines[Math.floor(Math.random() * c.lines.length)];
      setBubble(c.id, line, false);
    });
  }

  /* ---------------- legend / char bar ---------------- */
  function renderLegend() {
    const el = $('#mapLegend');
    el.innerHTML = ROOM_ORDER.map((r) => {
      const n = CHARS.filter((c) => seatOf(c.id).room === r).length;
      const active = state.roomInfo === r && !state.selected;
      return `<button class="legend-item${active ? ' is-active' : ''}" type="button" data-room-info="${r}">
        <span class="ico">${ROOMS[r].icon}</span>${ROOMS[r].name}
        <span class="count">${n}</span>
      </button>`;
    }).join('');
  }

  function renderCharBar() {
    const el = $('#charBar');
    el.innerHTML = CHARS.map((c) => {
      const room = seatOf(c.id).room;
      const on = state.conn === 'live' && state.online[c.id];
      return `<button class="char-chip${state.selected === c.id ? ' is-selected' : ''}${on ? ' is-online' : ''}" type="button" data-id="${c.id}" style="--cc:${c.color}" aria-label="${c.name} 비서 상세 보기">
        <span class="mini">${glyphSVG(c)}</span>
        <span class="meta"><span class="nm">${c.name}</span><span class="rm">${c.rank}순위 · ${ROOMS[room].name}</span></span>
      </button>`;
    }).join('');
  }

  /* ---------------- messages ---------------- */
  const MENTION_RE = /@(전체|KYLE|클로이|아이카|페이카|레이카|세이카)/g;
  const NAME_TO_ID = { '전체': 'all', KYLE: 'kyle', '클로이': 'cloie', '아이카': 'aika', '페이카': 'peika', '레이카': 'reika', '세이카': 'seika' };

  function linkify(text) {
    return esc(text).replace(MENTION_RE, (m, n) => `<span class="mention${n === '전체' ? ' is-all' : ''}">@${n}</span>`);
  }

  function ownerAvatar(color, name) {
    return `<svg viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="16" fill="${color}" opacity=".18"/>
      <circle cx="20" cy="15.4" r="5.1" fill="${color}"/>
      <path d="M10.6 30.2c1.5-4.5 5.1-6.9 9.4-6.9s7.9 2.4 9.4 6.9" fill="none" stroke="${color}" stroke-width="2.7" stroke-linecap="round"/>
      <title>${esc(name)}</title>
    </svg>`;
  }

  /* ---------------- reply (답글·인용) ---------------- */
  // 다른 피클이 보낸 replyTo를 읽을 때 쓰는 안전한 정규화 — 없거나 깨져 있으면 null
  function normReply(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const text = summarize(raw.text);
    const author = raw.author ? String(raw.author).slice(0, 40) : '';
    const name = raw.name ? String(raw.name).slice(0, 40) : '';
    const key = raw.key ? String(raw.key).slice(0, 120) : '';
    const id = raw.id ? String(raw.id).slice(0, 80) : '';
    if (!text && !author && !name) return null;
    return { key, id, author, name, text };
  }

  // 보내는 메시지에 실을 답글 대상 (기존 6필드 + replyTo만 추가해 하위 호환 유지)
  function replyTargetFor(m) {
    const c = byId[m.author];
    const name = c ? c.name
      : m.author === OWNER.id ? (m.name || OWNER.name)
        : (m.name || m.author || '게스트');
    return {
      key: m.key ? String(m.key) : '',
      id: m.id ? String(m.id) : '',
      author: m.author ? String(m.author) : '',
      name,
      text: summarize(m.text),
    };
  }

  function isRendered(rt) {
    const keys = state.renderedKeys;
    if (!keys) return false;
    if (rt.key && keys.has('k:' + rt.key)) return true;
    if (rt.id && keys.has('i:' + rt.id)) return true;
    return false;
  }

  function replyQuoteHTML(rt) {
    const c = byId[rt.author];
    const qc = c ? c.color : (rt.author === OWNER.id ? OWNER.color : '#8a8173');
    const who = rt.name || rt.author || '알 수 없는 메시지';
    const inner = `<span class="rq-who">${esc(who)}</span><span class="rq-text">${esc(rt.text || '원문 미리보기 없음')}</span>`;
    if (!isRendered(rt)) {
      return `<div class="reply-quote" style="--qc:${qc}" title="원문 메시지를 이 화면에서 찾을 수 없어요">${inner}</div>`;
    }
    return `<button class="reply-quote is-link" type="button" style="--qc:${qc}"
      data-quote-key="${esc(rt.key)}" data-quote-id="${esc(rt.id)}"
      title="원문 메시지로 이동" aria-label="${esc(who)} 원문 메시지로 이동">${inner}</button>`;
  }

  function replyIcon() {
    return `<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" focusable="false">
        <path d="M9 6 4 11l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4 11h9a6 6 0 0 1 6 6v1" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
  }

  function renderReplyBar() {
    const bar = $('#replyBar');
    if (!bar) return;
    const rt = state.replyTo;
    bar.hidden = !rt;
    if (!rt) {
      $('#replyWho').textContent = '';
      $('#replyText').textContent = '';
      return;
    }
    $('#replyWho').textContent = rt.name || rt.author || '메시지';
    $('#replyText').textContent = rt.text || '원문 미리보기 없음';
  }

  function setReplyTarget(m) {
    if (!m) return;
    state.replyTo = replyTargetFor(m);
    $$('.msg.is-reply-src').forEach((el) => el.classList.remove('is-reply-src'));
    const box = $('#messages');
    const el = (m.key && box.querySelector(`[data-key="${CSS.escape(String(m.key))}"]`))
      || box.querySelector(`[data-mid="${CSS.escape(String(m.id))}"]`);
    if (el) el.classList.add('is-reply-src');
    renderReplyBar();
    const input = $('#input');
    input.focus();
    const n = input.value.length;
    try { input.setSelectionRange(n, n); } catch (_) {}
    const composer = $('#composer');
    if (window.innerWidth <= 720 && composer) composer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearReplyTarget(opts = {}) {
    if (!state.replyTo) return;
    state.replyTo = null;
    $$('.msg.is-reply-src').forEach((el) => el.classList.remove('is-reply-src'));
    renderReplyBar();
    if (!opts.silent) $('#input').focus();
  }

  function revealMessage(key, id) {
    const box = $('#messages');
    let el = null;
    if (key) el = box.querySelector(`[data-key="${CSS.escape(String(key))}"]`);
    if (!el && id) el = box.querySelector(`[data-mid="${CSS.escape(String(id))}"]`);
    if (!el) { toast('원문 메시지를 이 화면에서 찾을 수 없어요'); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('is-flash');
    void el.offsetWidth; // 애니메이션 재시작
    el.classList.add('is-flash');
    clearTimeout(el._flash);
    el._flash = setTimeout(() => el.classList.remove('is-flash'), 2000);
  }

  function msgHTML(m) {
    const c = byId[m.author];
    const isOwner = !c && m.author === OWNER.id;
    const color = c ? c.color : (isOwner ? OWNER.color : '#8a8173');
    const name = c ? c.name : (isOwner ? (m.name || OWNER.name) : (m.name || m.author || '게스트'));
    const avatar = c
      ? glyphSVG(c)
      : isOwner
        ? ownerAvatar(color, name)
        : `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="${color}" opacity=".22"/><text x="20" y="26" text-anchor="middle" font-size="17" font-weight="900" fill="${color}">${esc(name.slice(0, 1))}</text></svg>`;
    const roomTag = state.tab === 'all' && m.room && ROOMS[m.room]
      ? `<span class="room-tag">${ROOMS[m.room].name}</span>` : '';
    const rt = normReply(m.replyTo);
    return `<article class="msg${isOwner ? ' is-owner' : ''}" data-mid="${esc(m.id)}"${m.key ? ` data-key="${esc(m.key)}"` : ''} style="--ac:${color}">
      <div class="avatar">${avatar}</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="who">${esc(name)}</span>
          ${c && c.rank ? `<span class="rank">${c.rank}순위</span>` : isOwner ? `<span class="rank">대표</span>` : ''}
          ${roomTag}
          <time datetime="${new Date(m.ts).toISOString()}">${timeHM(m.ts)}</time>
        </div>
        ${rt ? replyQuoteHTML(rt) : ''}
        <span class="text">${linkify(m.text)}</span>
      </div>
      <button class="msg-reply" type="button" data-reply-id="${esc(m.id)}"
        aria-label="${esc(name)} 메시지에 답글 달기" title="답글">${replyIcon()}<span class="lbl">답글</span></button>
    </article>`;
  }

  function renderMessages(scroll = true) {
    const box = $('#messages');
    const list = currentMsgs()
      .filter((m) => state.tab === 'all' || m.room === state.tab)
      .sort((a, b) => a.ts - b.ts)
      .slice(-250);

    if (!list.length) {
      box.innerHTML = `<div class="day-divider">아직 메시지가 없어요</div>
        <p style="font-size:12px;color:var(--ink-3);text-align:center;padding:8px 20px 20px;line-height:1.6">
          아래 <b>@전체</b>·<b>@이름</b> 버튼으로 비서를 부르거나, 첫 메시지를 보내 보세요.</p>`;
      state.renderedKeys = new Set();
      return;
    }

    // 인용 블록이 "원문이 이 화면에 있는지"를 렌더 시점에 판단할 수 있게 모아 둡니다.
    const renderedKeys = new Set();
    list.forEach((m) => {
      if (m.key) renderedKeys.add('k:' + m.key);
      if (m.id) renderedKeys.add('i:' + m.id);
    });
    state.renderedKeys = renderedKeys;

    let html = '';
    let lastDay = '';
    list.forEach((m) => {
      const dk = dayKey(m.ts);
      if (dk !== lastDay) {
        html += `<div class="day-divider">${dayLabel(m.ts)}</div>`;
        lastDay = dk;
      }
      html += msgHTML(m);
    });
    box.innerHTML = html;
    // 다시 그려지면 클래스가 사라지므로, 답글 대상 표시를 되살립니다.
    if (state.replyTo) {
      const rt = state.replyTo;
      const src = (rt.key && box.querySelector(`[data-key="${CSS.escape(String(rt.key))}"]`))
        || (rt.id && box.querySelector(`[data-mid="${CSS.escape(String(rt.id))}"]`));
      if (src) src.classList.add('is-reply-src');
    }
    if (scroll) box.scrollTop = box.scrollHeight;
  }

  function addMessage(msg, opts = {}) {
    const isOwn = state.ownIds.has(msg.id);
    if (state.conn === 'live') {
      if (state.seenLive.has(msg.id)) return;
      state.seenLive.add(msg.id);
      state.liveMsgs.push(msg);
      if (state.liveMsgs.length > 400) state.liveMsgs = state.liveMsgs.slice(-400);
    } else {
      if (state.demoMsgs.some((m) => m.id === msg.id)) return;
      state.demoMsgs.push(msg);
      if (state.demoMsgs.length > 300) state.demoMsgs = state.demoMsgs.slice(-300);
      writeJSON(LS.msgs, state.demoMsgs);
    }

    if (!isOwn && !opts.silent) {
      if (state.tab !== 'all') state.unread.all++;
      if (state.tab !== 'all' && state.tab !== msg.room) state.unread[msg.room] = (state.unread[msg.room] || 0) + 1;
      updateBadges();
      if (byId[msg.author] && Date.now() - msg.ts < 12000) setBubble(msg.author, msg.text, false);
    }

    if (state.tab === 'all' || state.tab === msg.room) renderMessages(opts.scroll !== false);
  }

  function updateBadges() {
    $$('.tab').forEach((t) => {
      const b = $('.badge', t);
      const n = state.unread[t.dataset.tab] || 0;
      b.hidden = n === 0;
      b.textContent = n > 9 ? '9+' : String(n);
    });
  }

  /* ---------------- typing ---------------- */
  let typingTimer = null;
  function showTyping(name) {
    const el = $('#typing');
    $('.typing-text', el).textContent = `${name} 님이 입력 중`;
    el.hidden = false;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { el.hidden = true; }, 4000);
  }
  function hideTyping() { $('#typing').hidden = true; clearTimeout(typingTimer); }

  /* ---------------- send ---------------- */
  function currentRoomForSend(sender) {
    if (state.tab === 'all') return sender.id === OWNER.id ? 'main' : seatOf(sender.id).room;
    return state.tab;
  }

  async function postMessage(msg) {
    if (state.conn === 'live' && state.fb) {
      state.ownIds.add(msg.id);
      state.seenLive.add(msg.id);
      state.liveMsgs.push(msg);
      renderMessages();
      try {
        const res = await fetch(`${state.fb}/messages.json`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } catch (err) {
        toast('전송 실패 · 연결을 확인해 주세요');
        setConnState('error');
      }
      return;
    }
    addMessage(msg, { silent: true, scroll: true });
    scheduleReplies(msg);
  }

  function scheduleReplies(msg) {
    const mentioned = [];
    const re = /@(전체|KYLE|클로이|아이카|페이카|레이카|세이카)/g;
    let mt;
    while ((mt = re.exec(msg.text))) {
      const id = NAME_TO_ID[mt[1]];
      if (id && !mentioned.includes(id)) mentioned.push(id);
    }
    if (!mentioned.length) return;

    let targets;
    if (mentioned.includes('all')) {
      // @전체 · 팀 전체 호출 → 보낸 사람을 뺀 비서 두 명이 짧게 확인 답변
      const pool = CHARS.filter((c) => c.id !== msg.author).map((c) => c.id);
      targets = pool.sort(() => Math.random() - 0.5).slice(0, 2);
      toast('@전체 · 여섯 비서에게 알렸어요');
    } else {
      targets = mentioned.slice(0, 2);
    }
    if (!targets.length) return;

    targets.forEach((id, i) => {
      const c = byId[id];
      const delay = 700 + i * 900 + Math.random() * 600;
      setTimeout(() => showTyping(c.name), 200);
      setTimeout(() => {
        hideTyping();
        const line = c.replies[Math.floor(Math.random() * c.replies.length)];
        addMessage({
          id: uid(),
          author: id,
          name: c.name,
          room: msg.room,
          text: line,
          ts: Date.now(),
        });
      }, delay + 1200);
    });
  }

  function sendFromInput() {
    const input = $('#input');
    const text = input.value.replace(/\s+$/, '');
    if (!text.trim()) return;
    const sender = senderOf(state.sender) || OWNER;
    const room = currentRoomForSend(sender);
    const msg = { id: uid(), author: sender.id, name: sender.name, room, text, ts: Date.now() };
    // 답글이면 기존 6개 필드는 그대로 두고 replyTo만 더해 보냅니다 (감시 스크립트 하위 호환).
    if (state.replyTo) msg.replyTo = { ...state.replyTo, text: summarize(state.replyTo.text) };
    input.value = '';
    input.style.height = 'auto';
    clearReplyTarget({ silent: true });
    postMessage(msg);
  }

  /* ---------------- demo seed ---------------- */
  const T = (minAgo) => Date.now() - minAgo * 60000;
  const SEED = [
    { author: 'reika', room: 'main', text: '합동 비서실에 오신 걸 환영해요! 지도에서 비서를 눌러 보거나, 아래 @레이카 로 불러 주세요.', ts: T(11) },
    { author: 'kyle', room: 'main', text: '오늘 우선순위는 재고 확인 → CS 순으로 갑니다.', ts: T(9) },
    { author: 'cloie', room: 'meet', text: '@레이카 오늘 브리핑은 몇 시에 올라와?', ts: T(7.5) },
    { author: 'reika', room: 'meet', text: '09:10에 에그만 데일리 브리핑 올릴게요. 회의실 안건은 제가 모아 둘게요.', ts: T(7) },
    { author: 'aika', room: 'work', text: '작업실에 캠페인 초안 올려 뒀어요. 한 번 봐 주세요.', ts: T(4) },
    { author: 'peika', room: 'work', text: '리포트 자동화 돌려 놨어요. 결과는 곧 정리해서 올릴게요.', ts: T(2) },
  ].map((m) => ({ id: uid(), name: byId[m.author].name, ...m }));

  function seedIfEmpty() {
    const saved = readJSON(LS.msgs, null);
    if (Array.isArray(saved) && saved.length) { state.demoMsgs = saved; return; }
    state.demoMsgs = SEED.slice();
    writeJSON(LS.msgs, state.demoMsgs);
  }

  /* ---------------- firebase REST ---------------- */
  function normBase(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    s = s.replace(/\/+$/, '');
    s = s.replace(/\/(messages|presence)(\.json)?$/i, '');
    s = s.replace(/\.json$/i, '');
    return s;
  }

  async function probe(base) {
    try {
      const res = await fetch(`${base}${MSG_QUERY}`, { cache: 'no-store' });
      if (res.status === 401 || res.status === 403) {
        return { ok: false, reason: '권한이 없습니다 · Realtime Database 규칙에서 messages 읽기/쓰기를 허용해 주세요.' };
      }
      if (res.status === 404) return { ok: false, reason: '데이터베이스를 찾을 수 없습니다 · URL을 확인해 주세요.' };
      if (!res.ok) return { ok: false, reason: 'HTTP ' + res.status + ' · URL과 규칙을 확인해 주세요.' };
      const data = await res.json();
      const n = data ? Object.keys(data).length : 0;
      return { ok: true, reason: `연결됨 · 기존 메시지 ${n}개` };
    } catch (err) {
      return { ok: false, reason: '연결할 수 없습니다 · 주소 또는 네트워크(CORS)를 확인해 주세요.' };
    }
  }

  function setConnState(mode) {
    state.conn = mode;
    const pill = $('#connPill');
    pill.classList.toggle('is-live', mode === 'live');
    pill.classList.toggle('is-error', mode === 'error');
    $('#connLabel').textContent = mode === 'live' ? '실시간 연결' : mode === 'error' ? '연결 오류' : '데모 모드';
    $('#chatLive').innerHTML = mode === 'live'
      ? `<span class="dot" aria-hidden="true"></span>실시간 · ${Object.keys(state.online).length || 1}명 접속`
      : `<span class="dot" aria-hidden="true"></span>이 브라우저에 저장`;
    if (mode !== 'live') {
      stopSync();
    }
    renderCharBar();
  }

  async function loadLiveMessages() {
    if (!state.fb) return;
    try {
      const res = await fetch(`${state.fb}${MSG_QUERY}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!data) return;
      const added = [];
      const atBottom = isAtBottom();
      Object.entries(data).forEach(([key, v]) => {
        if (!v || typeof v !== 'object' || !v.text) return;
        const id = v.id || key;
        if (state.seenLive.has(id)) return;
        state.seenLive.add(id);
        const msg = {
          id, key,
          author: v.author || 'guest',
          name: v.name || v.author || '게스트',
          room: ROOMS[v.room] ? v.room : 'main',
          text: String(v.text),
          ts: Number(v.ts) || Date.now(),
          replyTo: normReply(v.replyTo),
        };
        state.liveMsgs.push(msg);
        added.push(msg);
      });
      if (state.liveMsgs.length > 400) state.liveMsgs = state.liveMsgs.slice(-400);
      if (added.length) {
        state.liveMsgs.sort((a, b) => a.ts - b.ts);
        added.forEach((m) => {
          if (state.ownIds.has(m.id)) return;
          if (state.tab !== 'all') state.unread.all++;
          if (state.tab !== 'all' && state.tab !== m.room) state.unread[m.room] = (state.unread[m.room] || 0) + 1;
          if (byId[m.author] && Date.now() - m.ts < 15000) setBubble(m.author, m.text, false);
        });
        updateBadges();
        renderMessages(atBottom);
      }
    } catch (err) {
      toast('동기화가 잠시 멈췄어요 · 연결을 확인해 주세요');
    }
  }

  async function pushPresence() {
    if (!state.fb || state.conn !== 'live') return;
    const sender = senderOf(state.sender) || OWNER;
    const room = sender.id === OWNER.id ? 'main' : seatOf(sender.id).room;
    try {
      await fetch(`${state.fb}/presence/${clientId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: sender.id, name: sender.name, room, ts: Date.now() }),
      });
    } catch (_) {}
  }

  async function pollPresence() {
    if (!state.fb || state.conn !== 'live') return;
    try {
      const res = await fetch(`${state.fb}/presence.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() || {};
      const now = Date.now();
      const online = {};
      Object.values(data).forEach((p) => {
        if (p && p.author && now - Number(p.ts || 0) < 70000) online[p.author] = true;
      });
      state.online = online;
      renderCharBar();
      $('#chatLive').innerHTML = `<span class="dot" aria-hidden="true"></span>실시간 · ${Math.max(1, Object.keys(online).length)}명 접속`;
    } catch (_) {}
  }

  /* ---------------- agents (/agents/<id>.json) ---------------- */
  function applyAgents(data) {
    const agents = {};
    const raw = (data && typeof data === 'object') ? data : {};
    Object.entries(raw).forEach(([key, v]) => {
      const id = agentIdOf(key);
      if (!id || !v || typeof v !== 'object') return;
      agents[id] = {
        room: ROOMS[v.room] ? v.room : '',
        status: STATUS[v.status] ? v.status : (v.status ? String(v.status) : ''),
        task: v.task ? String(v.task).slice(0, 160) : '',
        updatedAt: Number(v.updatedAt) || 0,
      };
    });
    state.agents = agents;

    let moved = false;
    const speak = [];
    Object.entries(agents).forEach(([id, a]) => {
      const sig = `${a.room}|${a.status}|${a.task}|${a.updatedAt}`;
      const prev = state.agentSig[id] || '';
      if (a.room && seatOf(id).room !== a.room && Date.now() - (state.agentLocalAt[id] || 0) > 4000) {
        state.seats[id] = { room: a.room, idx: freeSlot(a.room, id) };
        moved = true;
      }
      const fresh = !a.updatedAt || Date.now() - a.updatedAt < 6 * 60000;
      if (a.task && a.task !== state.agentBubble[id] && (sig !== prev || prev === '') && fresh) {
        speak.push({ id, task: a.task, updatedAt: a.updatedAt });
        state.agentBubble[id] = a.task;
      }
      state.agentSig[id] = sig;
    });

    if (moved) {
      writeJSON(LS.seats, state.seats);
      updateCritterPositions();
      renderLegend();
      renderCharBar();
      if (state.selected) renderDetail();
    }
    speak.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 2).forEach((s) => setBubble(s.id, s.task, true));
  }

  async function loadAgents() {
    if (!state.fb) return;
    if (state.conn !== 'live') return;
    try {
      const res = await fetch(`${state.fb}/agents.json`, { cache: 'no-store' });
      if (!res.ok) return;
      applyAgents(await res.json());
    } catch (_) {}
  }

  async function pushAgent(id, room) {
    if (!state.fb || state.conn !== 'live') return;
    const payload = {
      room,
      status: defaultStatus(room),
      task: `${ROOMS[room].name}로 이동했어요`,
      updatedAt: Date.now(),
    };
    // 다음 폴링에서 같은 값이 되돌아와도 말풍선을 다시 띄우지 않도록 먼저 기록해 둡니다.
    state.agents[id] = payload;
    state.agentSig[id] = `${payload.room}|${payload.status}|${payload.task}|${payload.updatedAt}`;
    state.agentBubble[id] = payload.task;
    state.agentLocalAt[id] = Date.now();
    if (state.selected === id) renderDetail();
    try {
      await fetch(`${state.fb}/agents/${encodeURIComponent(id)}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (_) {}
  }

  function startSync() {
    stopSync();
    state.pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadLiveMessages();
    }, 3000);
    pushPresence();
    pollPresence();
    loadAgents();
    state.presenceTimer = setInterval(pushPresence, 15000);
    state.presencePollTimer = setInterval(pollPresence, 10000);
    state.agentPollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') loadAgents();
    }, 3000);
  }

  function stopSync() {
    clearInterval(state.pollTimer);
    clearInterval(state.presenceTimer);
    clearInterval(state.presencePollTimer);
    clearInterval(state.agentPollTimer);
    state.pollTimer = state.presenceTimer = state.presencePollTimer = state.agentPollTimer = null;
  }

  async function connectLive(rawUrl, opts = {}) {
    const base = normBase(rawUrl);
    if (!/^https?:\/\/[^/\s]+/i.test(base)) {
      setStatus('err', 'URL 형식이 올바르지 않습니다.');
      return false;
    }
    setStatus('', '연결 확인 중…');
    const result = await probe(base);
    if (!result.ok) {
      setStatus('err', result.reason);
      if (state.conn === 'live') setConnState('error');
      return false;
    }
    state.fb = base;
    state.liveMsgs = [];
    state.seenLive = new Set();
    state.agents = {};
    state.agentSig = {};
    state.agentBubble = {};
    try {
      // 기본 공용 DB는 "기본값"으로 두고, 직접 지정한 URL만 저장합니다.
      if (base === DEFAULT_FB) localStorage.removeItem(LS.fb);
      else localStorage.setItem(LS.fb, base);
      localStorage.removeItem(LS.demo);
    } catch (_) {}
    setConnState('live');
    setStatus('ok', result.reason);
    refreshShareLink();
    await loadLiveMessages();
    await loadAgents();
    renderMessages();
    startSync();
    if (!opts.quiet) { toast('실시간 DB에 연결했어요'); closeModal(); }
    return true;
  }

  function goDemo(opts = {}) {
    stopSync();
    state.fb = null;
    state.liveMsgs = [];
    state.seenLive = new Set();
    state.agents = {};
    state.agentSig = {};
    state.agentBubble = {};
    state.online = {};
    try {
      localStorage.removeItem(LS.fb);
      localStorage.setItem(LS.demo, '1');
    } catch (_) {}
    setConnState('demo');
    setStatus('', '로컬 데모 모드로 돌아왔습니다.');
    refreshShareLink();
    renderMessages();
    if (!opts.quiet) toast('데모 모드로 돌아왔어요');
  }

  /* ---------------- settings UI ---------------- */
  function setStatus(kind, text) {
    const el = $('#settingsStatus');
    el.className = 'status-line' + (kind ? ' ' + kind : '');
    el.textContent = text;
  }
  function refreshShareLink() {
    const input = $('#shareLink');
    const base = state.fb || normBase($('#fbUrl').value);
    input.value = base
      ? `${location.origin}${location.pathname}#fb=${encodeURIComponent(base)}`
      : '연결된 DB가 없습니다 (데모 모드)';
  }

  function openModal() {
    $('#fbUrl').value = state.fb || '';
    refreshShareLink();
    setStatus('', state.conn === 'live' ? '실시간 연결됨' : '지금은 데모 모드입니다.');
    $('#settingsModal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => $('#fbUrl').focus(), 60);
  }
  function closeModal() {
    $('#settingsModal').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-on'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('is-on');
      setTimeout(() => { el.hidden = true; }, 260);
    }, 2400);
  }

  /* ---------------- wiring ---------------- */
  function wireMap() {
    $('#critters').addEventListener('click', (e) => {
      const btn = e.target.closest('.critter');
      if (btn) { selectChar(btn.dataset.id); }
    });

    $$('.room-hit').forEach((hit) => {
      hit.addEventListener('click', () => {
        const room = hit.dataset.room;
        if (state.selected) {
          moveChar(state.selected, room);
        } else {
          state.roomInfo = state.roomInfo === room ? null : room;
          renderLegend();
          renderDetail();
        }
      });
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
      });
      hit.setAttribute('tabindex', '0');
      hit.setAttribute('role', 'button');
      hit.setAttribute('aria-label', `${ROOMS[hit.dataset.room].name} 보기`);
    });

    $('#mapLegend').addEventListener('click', (e) => {
      const b = e.target.closest('[data-room-info]');
      if (!b) return;
      if (state.selected) { moveChar(state.selected, b.dataset.roomInfo); return; }
      state.roomInfo = state.roomInfo === b.dataset.roomInfo ? null : b.dataset.roomInfo;
      renderLegend();
      renderDetail();
    });

    $('#charBar').addEventListener('click', (e) => {
      const b = e.target.closest('.char-chip');
      if (!b) return;
      state.roomInfo = null;
      selectChar(b.dataset.id);
      $('#detail').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    $('#detail').addEventListener('click', (e) => {
      const move = e.target.closest('[data-move]');
      if (move) { moveChar(move.dataset.move, move.dataset.room); return; }
      if (e.target.closest('[data-close-detail]')) {
        state.selected = null;
        state.roomInfo = null;
        updateSelection();
        renderLegend();
        renderDetail();
      }
    });

    window.addEventListener('resize', updateScale);
    updateScale();
  }

  function wireChat() {
    $$('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        state.tab = t.dataset.tab;
        state.unread[t.dataset.tab] = 0;
        $$('.tab').forEach((x) => {
          x.classList.toggle('is-active', x === t);
          x.setAttribute('aria-selected', x === t ? 'true' : 'false');
        });
        updateBadges();
        renderMessages();
        hideTyping();
      });
    });

    const row = $('#mentionRow');
    row.innerHTML = `<button class="mention-btn is-all" type="button" data-mention="전체" title="여섯 비서 모두에게 알림">@전체</button>`
      + CHARS.map((c) => `<button class="mention-btn" type="button" data-mention="${c.name}" style="--mc:${c.color}">@${c.name}</button>`).join('');
    row.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mention]');
      if (!b) return;
      insertMention(b.dataset.mention);
    });

    const sel = $('#sender');
    sel.innerHTML = SENDERS.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    if (!senderOf(state.sender)) state.sender = DEFAULT_SENDER;
    sel.value = state.sender;
    state.sender = sel.value;
    try { localStorage.setItem(LS.sender, state.sender); } catch (_) {}
    sel.addEventListener('change', () => {
      state.sender = sel.value;
      try { localStorage.setItem(LS.sender, state.sender); } catch (_) {}
      if (state.conn === 'live') pushPresence();
    });

    const input = $('#input');
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.replyTo) {
        e.preventDefault();
        clearReplyTarget();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendFromInput();
      }
    });

    // 말풍선 맨 위의 답글 버튼 · 인용 블록 클릭 (메시지 목록은 다시 그려지지만 리스너는 컨테이너에 둡니다)
    $('#messages').addEventListener('click', (e) => {
      const quote = e.target.closest('[data-quote-key], [data-quote-id]');
      if (quote) {
        revealMessage(quote.dataset.quoteKey, quote.dataset.quoteId);
        return;
      }
      const btn = e.target.closest('[data-reply-id]');
      if (btn) {
        const target = currentMsgs().find((m) => String(m.id) === String(btn.dataset.replyId));
        if (target) setReplyTarget(target);
      }
    });

    $('#replyCancel').addEventListener('click', () => clearReplyTarget());

    $('#composer').addEventListener('submit', (e) => {
      e.preventDefault();
      sendFromInput();
    });

    $('#messages').addEventListener('scroll', () => { /* auto-scroll only on render */ }, { passive: true });
  }

  function insertMention(name) {
    const input = $('#input');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const insert = `${pad}@${name} `;
    input.value = before + insert + after;
    const caret = (before + insert).length;
    input.setSelectionRange(caret, caret);
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  function wireSettings() {
    $('#openSettings').addEventListener('click', openModal);
    $('#connPill').addEventListener('click', openModal);
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#settingsModal').hidden) closeModal();
    });

    $('#fbUrl').addEventListener('input', refreshShareLink);

    $('#btnTest').addEventListener('click', async () => {
      const base = normBase($('#fbUrl').value);
      if (!base) { setStatus('err', 'URL을 입력해 주세요.'); return; }
      setStatus('', '연결 확인 중…');
      const r = await probe(base);
      setStatus(r.ok ? 'ok' : 'err', r.reason);
    });

    $('#btnConnect').addEventListener('click', () => {
      const v = $('#fbUrl').value;
      if (!normBase(v)) { setStatus('err', 'URL을 입력해 주세요.'); return; }
      connectLive(v);
    });

    $('#btnDemo').addEventListener('click', () => { goDemo(); });

    $('#btnCopy').addEventListener('click', async () => {
      const val = $('#shareLink').value;
      try {
        await navigator.clipboard.writeText(val);
        toast('공유 링크를 복사했어요');
      } catch (_) {
        $('#shareLink').select();
        toast('링크를 선택했어요 · 복사해 주세요');
      }
    });

    $('#btnReset').addEventListener('click', () => {
      state.demoMsgs = SEED.slice();
      writeJSON(LS.msgs, state.demoMsgs);
      if (state.conn !== 'live') renderMessages();
      toast('데모 대화를 초기화했어요');
    });
  }

  function isAtBottom() {
    const box = $('#messages');
    return box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  }

  /* ---------------- boot ---------------- */
  function boot() {
    // 예전 발신자 키(v1, 기본 'reika')는 지워서 '대표님' 기본값이 적용되게 합니다.
    try { localStorage.removeItem('po.sender.v1'); } catch (_) {}
    initSeats();
    seedIfEmpty();
    renderCritters();
    renderLegend();
    renderCharBar();
    wireMap();
    wireChat();
    wireSettings();
    setConnState('demo');
    renderMessages();

    // 첫 방문 느낌: 잠시 뒤 인사 버블
    setTimeout(() => setBubble('reika', '지도에서 저를 눌러 보세요!', true), 900);

    $('#chatLive').innerHTML = '<span class="dot" aria-hidden="true"></span>이 브라우저에 저장';

    // 해시 > 직접 저장한 URL > 기본 공용 DB 순으로 자동 연결 (데모 모드를 고른 적이 있으면 데모 유지)
    const hash = location.hash.match(/fb=([^&]+)/);
    const saved = localStorage.getItem(LS.fb);
    const demoChosen = localStorage.getItem(LS.demo) === '1';
    const target = hash ? decodeURIComponent(hash[1]) : (saved || (demoChosen ? '' : DEFAULT_FB));
    if (target) {
      $('#fbUrl').value = target;
      refreshShareLink();
      connectLive(target, { quiet: true }).then((ok) => {
        if (ok) toast('실시간 DB에 연결됐어요');
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.conn === 'live') {
        loadLiveMessages();
        loadAgents();
      }
    });

    setTimeout(tickBubbles, 1900);
    setInterval(tickBubbles, 7000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
