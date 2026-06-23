'use strict';

// ============================================================
// YUUEKi.com Ver.0.2 — app.js
// ============================================================

// ===== データモデル =====

let userManual = {
  profile: {
    nickname: ''
  },
  discomfort: {
    dislikes: [],
    ngTopics: [],
    okTopics: [],
    sensitiveWords: [],
    conversationStyle: {
      temperature: 0.5,
      directness: 0.5,
      humorTolerance: 0.5
    }
  },
  obasan: {
    preferredInterventionLevel: 'help',  // watch / help / active / full
    emergencyExitPreferred: true
  },
  intents: [],
  learning: {
    feedbacks: [],
    incidents: []
  }
};

let roomBoundary = {
  strictestRules: {},
  sharedOkTopics: [],
  blockedTopics: [],
  obasanMode: 'watching',
  emergencyEnabled: true
};

// メッセージファクトリ
function createMessage(role, text, meta) {
  return {
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    role: role,  // 'user' | 'partner' | 'obasan' | 'system' | 'sponsor'
    text: text,
    rawInput: text,
    timestamp: Date.now(),
    meta: Object.assign({
      systemGenerated: false,
      interventionType: null,
      boundaryFlag: null,
      relatedToMessageId: null
    }, meta || {})
  };
}

// ===== 画面遷移状態 =====
const state = {
  history: [],
  // トリセツ
  torisetsuAnswers: {},
  torisetsuCurrentQ: 0,
  interventionLevel: null,
  // ルーム
  selectedPartnerKey: null,
  roomStarted: false,
  obasanInRoom: true,
  roomMessages: [],
  roomFirstMessageSent: false,
  roomCalledObasan: false,
  // ふりかえり
  reviewAnswers: {}
};

// ===== 仮想相手プリセット =====
const partnerPresets = {
  gentle: {
    key: 'gentle',
    name: 'やさしめさん',
    emoji: '🌸',
    desc: '穏やかで聞き上手。話すペースはゆっくり。',
    torisetsu: {
      ngTopics: ['過去の恋愛', '収入'],
      okTopics: ['趣味', '日常のこと', '食べ物'],
      style: '丁寧で落ち着いた話し方を好む。',
      firstMessages: [
        'はじめまして。よろしくお願いします。',
        '…えっと、最近どんなことしてますか？'
      ]
    }
  },
  energetic: {
    key: 'energetic',
    name: 'ノリ強めさん',
    emoji: '🎉',
    desc: 'テンションが高め。話のペースが速い。',
    torisetsu: {
      ngTopics: ['重い話', '暗い話題'],
      okTopics: ['旅行', 'グルメ', 'エンタメ', 'スポーツ'],
      style: 'テンポよく話したい。笑いがあると嬉しい。',
      firstMessages: [
        'よろしく〜！最近どこか行った？',
        'ねえねえ、趣味とかある？'
      ]
    }
  },
  serious: {
    key: 'serious',
    name: '真面目さん',
    emoji: '📚',
    desc: '誠実で論理的。深い話を好む。',
    torisetsu: {
      ngTopics: ['軽い冗談', '外見の話'],
      okTopics: ['仕事', '将来のこと', '本・映画'],
      style: '丁寧に、内容のある会話をしたい。',
      firstMessages: [
        'はじめまして。どういうきっかけでここを使っているんですか？',
        '最近、何か印象に残っていることはありますか？'
      ]
    }
  },
  casual: {
    key: 'casual',
    name: '雑談さん',
    emoji: '☕',
    desc: '気軽に話したい。深い話は苦手。',
    torisetsu: {
      ngTopics: ['将来の話', '結婚', '仕事の詳細'],
      okTopics: ['天気', '食べ物', '最近見たもの'],
      style: '気楽に、軽い感じで話したい。',
      firstMessages: [
        'こんにちは〜。今日天気いいですね。',
        '最近、何かおいしいもの食べました？'
      ]
    }
  }
};

// ===== トリセツ質問データ =====
const torisetsuQuestions = [
  {
    id: 'dislikes',
    num: '質問 1',
    text: 'されたら嫌なことは？',
    chips: ['急かされる', '外見を言われる', '収入を聞かれる', '過去を掘られる', '特になし'],
    placeholder: '例：急に距離を縮めてくる、タメ口が嫌 など',
    ledgerLabel: 'されたら嫌なこと',
    multi: true
  },
  {
    id: 'ngTopics',
    num: '質問 2',
    text: '苦手な話題は？',
    chips: ['過去の恋愛', '家族・結婚', '仕事・収入', '外見・体型', '政治・宗教', '特になし'],
    placeholder: '例：結婚の話はまだ早い、宗教の話は避けたい など',
    ledgerLabel: 'NG話題',
    multi: true
  },
  {
    id: 'okTopics',
    num: '質問 3',
    text: 'OKな話題は？',
    chips: ['趣味', '食べ物・グルメ', '旅行', '映画・音楽', '日常のこと', '仕事（軽く）'],
    placeholder: '例：カフェ巡りや映画の話は好き など',
    ledgerLabel: 'OK話題',
    multi: true
  },
  {
    id: 'conversationTemp',
    num: '質問 4',
    text: '会話の温度感は？',
    chips: ['ゆっくり静かに', 'ほどほどに', 'わいわい楽しく', 'どちらでも'],
    placeholder: '例：最初はゆっくり話したい など',
    ledgerLabel: '会話の温度感'
  },
  {
    id: 'intents',
    num: '質問 5',
    text: '今の目的は？',
    chips: ['雑談', '友達', '恋愛', '趣味仲間', '仕事・求人', '相談', 'その他'],
    placeholder: '例：まずは友達から、将来的には恋愛も など',
    ledgerLabel: '目的',
    multi: true
  },
  {
    id: 'obasanNote',
    num: '質問 6',
    text: 'おばちゃんへの一言（任意）',
    chips: ['緊張しやすい', '最初は短めがいい', '話が続かなくなったら助けてほしい', '特になし'],
    placeholder: '例：人見知りなので最初だけ助けてほしい など',
    ledgerLabel: 'おばちゃんへのメモ',
    multi: true
  }
];

// ===== 画面遷移 =====
function goTo(screenId) {
  const current = document.querySelector('.screen.active');
  if (current) {
    state.history.push(current.id);
    current.classList.remove('active');
  }
  const next = document.getElementById(screenId);
  if (next) {
    next.classList.add('active');
    next.scrollTop = 0;
  }
}

function goBack() {
  if (state.history.length === 0) {
    goTo('screen-top');
    return;
  }
  const prev = state.history.pop();
  const current = document.querySelector('.screen.active');
  if (current) current.classList.remove('active');
  const prevScreen = document.getElementById(prev);
  if (prevScreen) {
    prevScreen.classList.add('active');
    prevScreen.scrollTop = 0;
  }
}

// ===== HTML エスケープ =====
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// トリセツ作成フロー
// ============================================================

function startTorisetsu() {
  state.torisetsuCurrentQ = 0;
  state.torisetsuAnswers = {};
  renderTorisetsuQuestion(0);
  goTo('screen-torisetsu-questions');
}

function renderTorisetsuQuestion(index) {
  const q = torisetsuQuestions[index];
  const container = document.getElementById('torisetsu-question-container');
  const progressLabel = document.getElementById('tq-progress-label');
  const progressFill = document.getElementById('tq-progress-fill');

  const pct = ((index + 1) / torisetsuQuestions.length) * 100;
  progressLabel.textContent = `質問 ${index + 1} / ${torisetsuQuestions.length}`;
  progressFill.style.width = pct + '%';

  const existingAnswer = state.torisetsuAnswers[q.id] || '';

  const chipsHtml = q.chips.map(chip => {
    const isSelected = existingAnswer.includes(chip) ? ' selected' : '';
    return `<button class="chip${isSelected}" onclick="toggleTorisetsuChip(this, '${q.id}', '${chip}', ${!!q.multi})">${chip}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="question-block">
      <div class="question-num">${q.num}</div>
      <div class="question-text">${q.text}</div>
      <div class="option-chips" id="tq-chips-${q.id}">
        ${chipsHtml}
      </div>
      <textarea
        class="free-input"
        id="tq-free-${q.id}"
        placeholder="${q.placeholder}"
        oninput="onTorisetsuFreeInput('${q.id}', this.value)"
        rows="2"
      >${existingAnswer && !q.chips.includes(existingAnswer) ? existingAnswer : ''}</textarea>
    </div>
    <div class="q-actions">
      ${index < torisetsuQuestions.length - 1
        ? `<button class="btn btn-primary" style="flex:2;" onclick="nextTorisetsuQuestion(${index})">次へ</button>`
        : `<button class="btn btn-primary" style="flex:2;" onclick="finishTorisetsuQuestions()">確認する</button>`
      }
      <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="skipTorisetsuQuestion('${q.id}', ${index})">あとで答える</button>
    </div>
  `;
}

function toggleTorisetsuChip(el, qId, value, isMulti) {
  const textarea = document.getElementById('tq-free-' + qId);
  if (isMulti) {
    el.classList.toggle('selected');
    const selected = Array.from(document.querySelectorAll(`#tq-chips-${qId} .chip.selected`))
      .map(c => c.textContent);
    state.torisetsuAnswers[qId] = selected.join('、');
    if (textarea) textarea.value = '';
  } else {
    document.querySelectorAll(`#tq-chips-${qId} .chip`).forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    state.torisetsuAnswers[qId] = value;
    if (textarea) textarea.value = '';
  }
}

function onTorisetsuFreeInput(qId, value) {
  document.querySelectorAll(`#tq-chips-${qId} .chip`).forEach(c => c.classList.remove('selected'));
  state.torisetsuAnswers[qId] = value;
}

function nextTorisetsuQuestion(currentIndex) {
  const q = torisetsuQuestions[currentIndex];
  if (!state.torisetsuAnswers[q.id]) {
    state.torisetsuAnswers[q.id] = '';
  }
  state.torisetsuCurrentQ = currentIndex + 1;
  renderTorisetsuQuestion(currentIndex + 1);
  document.getElementById('screen-torisetsu-questions').scrollTop = 0;
}

function skipTorisetsuQuestion(qId, currentIndex) {
  state.torisetsuAnswers[qId] = 'あとで答える';
  if (currentIndex < torisetsuQuestions.length - 1) {
    nextTorisetsuQuestion(currentIndex);
  } else {
    finishTorisetsuQuestions();
  }
}

function finishTorisetsuQuestions() {
  // userManualに反映（「あとで答える」は除外）
  const a = state.torisetsuAnswers;
  const notSkipped = v => v && v !== 'あとで答える';
  if (notSkipped(a.dislikes)) userManual.discomfort.dislikes = a.dislikes.split('、').filter(v => v && v !== 'あとで答える');
  if (notSkipped(a.ngTopics)) userManual.discomfort.ngTopics = a.ngTopics.split('、').filter(v => v && v !== 'あとで答える');
  if (notSkipped(a.okTopics)) userManual.discomfort.okTopics = a.okTopics.split('、').filter(v => v && v !== 'あとで答える');
  if (notSkipped(a.intents))  userManual.intents = a.intents.split('、').filter(v => v && v !== 'あとで答える');

  // 温度感をスコアに変換
  const tempMap = { 'ゆっくり静かに': 0.2, 'ほどほどに': 0.5, 'わいわい楽しく': 0.8, 'どちらでも': 0.5 };
  if (a.conversationTemp) {
    userManual.discomfort.conversationStyle.temperature = tempMap[a.conversationTemp] || 0.5;
  }

  buildTorisetsuConfirm();
  goTo('screen-intervention-level');
}

// ===== 介入度選択 =====
let selectedInterventionCard = null;

function selectInterventionLevel(card, level) {
  if (selectedInterventionCard) selectedInterventionCard.classList.remove('selected');
  card.classList.add('selected');
  selectedInterventionCard = card;
  state.interventionLevel = level;
  userManual.obasan.preferredInterventionLevel = level;

  const btn = document.getElementById('intervention-next-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

// ===== トリセツ確認画面 =====
function buildTorisetsuConfirm() {
  const container = document.getElementById('torisetsu-blocks');
  const memoEl = document.getElementById('torisetsu-obasan-memo');
  if (!container) return;

  const blocks = [
    { label: 'されたら嫌なこと', qId: 'dislikes',        fallback: '特になし' },
    { label: 'NG話題',          qId: 'ngTopics',         fallback: '特になし' },
    { label: 'OK話題',          qId: 'okTopics',         fallback: '特になし' },
    { label: '会話の温度感',    qId: 'conversationTemp', fallback: '未記入' },
    { label: '目的',            qId: 'intents',          fallback: '未記入' },
    { label: 'おばちゃんへのメモ', qId: 'obasanNote',   fallback: '特になし' },
  ];

  container.innerHTML = blocks.map(block => {
    const a = state.torisetsuAnswers[block.qId];
    const value = (a && a !== 'あとで答える') ? a : block.fallback;
    return `
      <div class="ledger-block">
        <div class="ledger-block-label">${block.label}</div>
        <div class="ledger-block-value">${escapeHtml(value)}</div>
      </div>
    `;
  }).join('');

  // おばちゃんメモ生成
  const ngList = (userManual.discomfort.ngTopics || []).filter(v => v && v !== 'あとで答える');
  const okList = (userManual.discomfort.okTopics || []).filter(v => v && v !== 'あとで答える');
  let memo = 'あんたのトリセツ、ちゃんと預かったよ。';
  if (ngList.length > 0) memo += `\nNG話題（${ngList.join('・')}）は避けるようにするわ。`;
  if (okList.length > 0) memo += `\n${okList[0]}の話から始めると楽そうやね。`;
  if (ngList.length === 0 && okList.length === 0) memo += '\nまたゆっくり教えてな。';
  if (memoEl) memoEl.textContent = memo;
}

function saveTorisetsuAndProceed() {
  buildTorisetsuConfirm();
  goTo('screen-partner-select');
  renderPartnerPresets();
}

// ============================================================
// 仮想相手選択
// ============================================================

function renderPartnerPresets() {
  const container = document.getElementById('partner-preset-list');
  if (!container) return;

  container.innerHTML = Object.values(partnerPresets).map(p => `
    <div class="partner-preset-card" id="partner-card-${p.key}" onclick="selectPartner('${p.key}')">
      <div class="partner-preset-check">✓</div>
      <div class="partner-preset-emoji">${p.emoji}</div>
      <div class="partner-preset-info">
        <div class="partner-preset-name">${p.name}</div>
        <div class="partner-preset-desc">${p.desc}</div>
        <div class="partner-preset-ok">OK: ${p.torisetsu.okTopics.slice(0, 3).join('・')}</div>
        <div class="partner-preset-ng">NG: ${p.torisetsu.ngTopics.join('・')}</div>
      </div>
    </div>
  `).join('');
}

let selectedPartnerCard = null;

function selectPartner(key) {
  if (selectedPartnerCard) selectedPartnerCard.classList.remove('selected');
  const card = document.getElementById('partner-card-' + key);
  if (card) {
    card.classList.add('selected');
    selectedPartnerCard = card;
  }
  state.selectedPartnerKey = key;

  const btn = document.getElementById('partner-next-btn');
  btn.disabled = false;
  btn.style.opacity = '1';
}

// ============================================================
// roomBoundary 合成
// ============================================================

function buildRoomBoundary(partnerKey) {
  const partner = partnerPresets[partnerKey];
  if (!partner) return;

  const userNG = userManual.discomfort.ngTopics || [];
  const partnerNG = partner.torisetsu.ngTopics || [];
  const allNG = Array.from(new Set([...userNG, ...partnerNG]));

  const userOK = userManual.discomfort.okTopics || [];
  const partnerOK = partner.torisetsu.okTopics || [];
  // 両者のOKが重なるもの（なければユーザーのOKを使う）
  const sharedOK = userOK.filter(t => partnerOK.includes(t));
  const displayOK = sharedOK.length > 0 ? sharedOK : userOK.slice(0, 3);

  const levelMap = { watch: 'watching', help: 'on_call', active: 'active', full: 'full' };

  roomBoundary = {
    strictestRules: {},
    sharedOkTopics: displayOK,
    blockedTopics: allNG,
    obasanMode: levelMap[userManual.obasan.preferredInterventionLevel] || 'watching',
    emergencyEnabled: true
  };
}

// ============================================================
// 一対一ルーム
// ============================================================

function startVirtualRoom() {
  const partnerKey = state.selectedPartnerKey;
  if (!partnerKey) return;

  // roomBoundary合成
  buildRoomBoundary(partnerKey);

  // state初期化
  state.roomStarted = true;
  state.obasanInRoom = true;
  state.roomMessages = [];
  state.roomFirstMessageSent = false;
  state.roomCalledObasan = false;

  // 画面移動
  goTo('screen-room');

  // DOMリセット
  const container = document.getElementById('chat-container');
  if (container) container.innerHTML = '';
  const choiceList = document.getElementById('room-choice-list');
  if (choiceList) { choiceList.innerHTML = ''; choiceList.classList.add('hidden'); }
  const endArea = document.getElementById('room-end-area');
  if (endArea) endArea.classList.add('hidden');

  // ルーム情報バー更新
  updateRoomInfoBar();

  // 初期状態：おばちゃん在室中
  const callWrap  = document.getElementById('call-obasan-wrap');
  const inputArea = document.getElementById('room-input-area');
  if (callWrap)  callWrap.classList.add('hidden');
  if (inputArea) inputArea.classList.add('hidden');
  updateStatusBar('おばちゃんが場を整えています…');

  // テキストエリアリセット
  const textarea = document.getElementById('room-input-textarea');
  if (textarea) textarea.value = '';

  // ヘッダータイトル
  const partner = partnerPresets[partnerKey];
  const titleEl = document.getElementById('room-header-title');
  if (titleEl && partner) titleEl.textContent = `${partner.emoji} ${partner.name} との部屋`;

  // おばちゃんモード表示
  const modeEl = document.getElementById('room-obasan-mode');
  const modeLabels = { watching: 'そっと見守る', on_call: '困った時だけ助ける', active: 'ちょいちょい間に入る', full: 'かなりおせっかいに支える' };
  if (modeEl) modeEl.textContent = modeLabels[roomBoundary.obasanMode] || '見守り中';

  // スポンサー表示
  const sponsorEl = document.getElementById('sponsor-bar-room');
  if (sponsorEl) sponsorEl.classList.remove('hidden');

  // メッセージを順番に表示
  addMessage('obasan',
    `ほな、${partner.name}との部屋を用意したよ。\nお二人とも、今日はよろしくな。`,
    600
  ).then(() => {
    const okDisplay = roomBoundary.sharedOkTopics.filter(v => v && v !== 'あとで答える').join('・') || 'なんでも';
    const ngDisplay = roomBoundary.blockedTopics.filter(v => v && v !== 'あとで答える').join('・') || '特になし';
    return addMessage('obasan',
      `この部屋のルールを確認しとくね。\nOK話題：${okDisplay}\nNG話題：${ngDisplay}`,
      2000
    );
  }).then(() => {
    return addMessage('obasan',
      'ほな、おばちゃんはいったん下がるわ。\n困ったら「おばちゃんを呼ぶ」ボタンを押してな。',
      4000
    );
  }).then(() => {
    // 相手の最初のメッセージ
    const firstMsg = partner.torisetsu.firstMessages[0];
    return addMessage('partner', firstMsg, 5200);
  }).then(() => {
    setRoomUIState(false);
  });
}

function updateRoomInfoBar() {
  const okEl = document.getElementById('room-ok-topics');
  const ngEl = document.getElementById('room-ng-topics');
  const cleanOk = roomBoundary.sharedOkTopics.filter(v => v && v !== 'あとで答える');
  const cleanNg = roomBoundary.blockedTopics.filter(v => v && v !== 'あとで答える');
  if (okEl) okEl.textContent = cleanOk.join('・') || '—';
  if (ngEl) ngEl.textContent = cleanNg.join('・') || '—';
}

// ----- メッセージ追加ヘルパー -----
function addMessage(type, text, delay) {
  return new Promise(resolve => {
    setTimeout(() => {
      const container = document.getElementById('chat-container');
      if (!container) { resolve(); return; }

      const msgEl = document.createElement('div');
      msgEl.className = 'message message-' + type;

      const iconMap   = { obasan: '👵🏻', user: '💬', partner: '👤', system: '🔔', sponsor: '📢' };
      const labelMap  = { obasan: 'つながろおばちゃん', user: '自分', partner: partnerPresets[state.selectedPartnerKey]?.name || 'お相手', system: 'システム', sponsor: 'スポンサー' };

      const icon  = iconMap[type]  || '';
      const label = labelMap[type] || type;

      const safeText = escapeHtml(text);
      const formattedText = safeText.replace(/\n/g, '<br>');

      msgEl.innerHTML = `
        <div class="message-header">
          <span class="message-icon">${icon}</span>
          <span class="message-label">${label}</span>
        </div>
        <div class="message-body">${formattedText}</div>
      `;

      const msg = createMessage(type, text, { systemGenerated: type !== 'user' });
      state.roomMessages.push(msg);

      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
      resolve();
    }, delay || 0);
  });
}

// ----- 状態バー更新 -----
function updateStatusBar(text) {
  const el = document.getElementById('room-status-text');
  if (el) el.textContent = text;
}

// ----- UI表示切り替え（クラスのみで制御） -----
function setRoomUIState(obasanIn) {
  state.obasanInRoom = obasanIn;

  const callWrap   = document.getElementById('call-obasan-wrap');
  const inputArea  = document.getElementById('room-input-area');
  const choiceList = document.getElementById('room-choice-list');
  const endArea    = document.getElementById('room-end-area');

  if (obasanIn) {
    callWrap.classList.add('hidden');
    inputArea.classList.add('hidden');
    updateStatusBar('おばちゃんが場を整えています');
  } else {
    callWrap.classList.remove('hidden');
    inputArea.classList.remove('hidden');
    updateStatusBar('あとはお二人で');
  }

  choiceList.classList.add('hidden');
  choiceList.innerHTML = '';
  endArea.classList.add('hidden');
}

// ----- 選択肢表示 -----
function showChoices(choices) {
  const list = document.getElementById('room-choice-list');
  if (!list) return;
  list.innerHTML = '';
  list.classList.remove('hidden');

  choices.forEach(choice => {
    const btn = document.createElement('button');
    btn.className = 'room-choice-btn';
    btn.textContent = choice.label;
    btn.onclick = () => {
      list.classList.add('hidden');
      list.innerHTML = '';
      choice.action();
    };
    list.appendChild(btn);
  });

  const container = document.getElementById('chat-container');
  if (container) container.scrollTop = container.scrollHeight;
}

// ----- 自分のメッセージ送信 -----
function sendMyMessage() {
  const textarea = document.getElementById('room-input-textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) return;

  // NGワードチェック
  const ngHit = roomBoundary.blockedTopics.find(ng => text.includes(ng));
  if (ngHit) {
    addMessage('obasan',
      `ちょっと待って。「${ngHit}」はこの部屋ではNG話題やったね。\n別の話題にしてみよか？`,
      0
    );
    return;
  }

  textarea.value = '';
  addMessage('user', text, 0);

  // 初回送信時のみ相手のモック返信
  if (!state.roomFirstMessageSent) {
    state.roomFirstMessageSent = true;
    const partner = partnerPresets[state.selectedPartnerKey];
    if (partner) {
      const reply = partner.torisetsu.firstMessages[1] || 'そうなんですね。';
      setTimeout(() => addMessage('partner', reply, 0), 1600);
    }
  }
}

// ----- おばちゃんを呼ぶ -----
function callObasan() {
  if (state.roomCalledObasan) return;
  state.roomCalledObasan = true;

  const callBtn = document.getElementById('call-obasan-btn');
  if (callBtn) callBtn.disabled = true;

  const inputArea = document.getElementById('room-input-area');
  if (inputArea) inputArea.classList.add('hidden');

  updateStatusBar('おばちゃんが戻ってきました');

  addMessage('obasan',
    '呼んでくれてありがとう。\n今どんな感じやろか。\n話題を変える？\nそれとも、このまま少し見守ろか？',
    400
  ).then(() => {
    showChoices([
      {
        label: '話題を変える',
        action: () => {
          const okTopics = roomBoundary.sharedOkTopics;
          const suggestion = okTopics.length > 0 ? okTopics[0] : '日常のこと';
          addMessage('obasan',
            `ほな、${suggestion}の話から始めてみよか。\n重たい話はまだええからな。`,
            300
          ).then(() => {
            state.roomCalledObasan = false;
            if (callBtn) callBtn.disabled = false;
            setRoomUIState(false);
          });
        }
      },
      {
        label: '今日はここまでにする',
        action: () => {
          addMessage('obasan',
            '今日はここまでで大丈夫。\n無理に続けることはありません。\nふりかえりをしてみよか？',
            300
          ).then(() => {
            updateStatusBar('今日はここまで');
            const callWrap = document.getElementById('call-obasan-wrap');
            if (callWrap) callWrap.classList.add('hidden');
            if (inputArea) inputArea.classList.add('hidden');
            const endArea = document.getElementById('room-end-area');
            if (endArea) endArea.classList.remove('hidden');
            const container = document.getElementById('chat-container');
            if (container) container.scrollTop = container.scrollHeight;
          });
        }
      },
      {
        label: 'もう少しだけ見守ってもらう',
        action: () => {
          addMessage('obasan',
            'わかった。おばちゃん、もう少しここにおるわ。\n焦らんでええからな。',
            300
          ).then(() => {
            state.roomCalledObasan = false;
            if (callBtn) callBtn.disabled = false;
            if (inputArea) inputArea.classList.remove('hidden');
            updateStatusBar('おばちゃん、見守っています');
            const container = document.getElementById('chat-container');
            if (container) container.scrollTop = container.scrollHeight;
          });
        }
      }
    ]);
  });
}

// ============================================================
// ふりかえり Ver.0.3-A
// ============================================================

// モヤモヤ理由マスター
const FEEDBACK_REASONS = [
  { id: 'topic',      label: '話題・内容が合わなかった' },
  { id: 'tone',       label: '言い方・言葉遣いが気になった' },
  { id: 'pace',       label: '会話のテンポ・ペースが合わなかった' },
  { id: 'distance',   label: '距離感が近すぎた' },
  { id: 'appearance', label: '外見や体型に触れられた' },
  { id: 'heavy',      label: '重い話になった' },
  { id: 'personal',   label: '急に個人情報を聞かれた' },
  { id: 'external',   label: '外部サイトや別アプリに誘導された' },
  { id: 'money',      label: 'お金の話が出た' },
  { id: 'other',      label: 'その他' }
];

// feedbackState
let feedbackState = {
  overallOk: null,
  targetMessageIds: [],
  reasons: [],
  note: '',
  reflectToManual: false
};

let reviewCurrentStep = 1;

function goReviewStep(step) {
  const current = document.getElementById('review-step-' + reviewCurrentStep);
  if (current) current.classList.add('hidden');
  const next = document.getElementById('review-step-' + step);
  if (next) next.classList.remove('hidden');
  reviewCurrentStep = step;

  document.querySelectorAll('.review-step-dot').forEach(dot => {
    const s = parseInt(dot.dataset.step);
    dot.classList.toggle('active', s === step);
    dot.classList.toggle('done', s < step);
  });

  if (step === 2) renderReviewMessageList();
  if (step === 3) renderReviewReasonsGrid();

  const screenEl = document.getElementById('screen-review');
  if (screenEl) screenEl.scrollTop = 0;
}

function selectReviewStep1(choice) {
  feedbackState.overallOk = choice;
  if (choice === 'ok') {
    feedbackState.reasons = ['none'];
    goReviewStep(4);
  } else {
    goReviewStep(2);
  }
}

function renderReviewMessageList() {
  const container = document.getElementById('review-message-list');
  if (!container) return;
  container.innerHTML = '';

  const msgs = state.roomMessages.filter(m => m.role === 'partner' || m.role === 'user');
  if (msgs.length === 0) {
    container.innerHTML = '<p class="review-step-note">会話ログがありません。</p>';
    return;
  }

  msgs.forEach(msg => {
    const el = document.createElement('div');
    el.className = 'review-msg-item';
    el.dataset.msgId = msg.id;
    const partnerName = state.selectedPartnerKey && partnerPresets[state.selectedPartnerKey]
      ? partnerPresets[state.selectedPartnerKey].name : '相手';
    const roleLabel = msg.role === 'partner' ? ('👤 ' + partnerName) : '💬 自分';
    el.innerHTML =
      '<div class="review-msg-role">' + roleLabel + '</div>' +
      '<div class="review-msg-text">' + escapeHtml(msg.text) + '</div>';
    el.addEventListener('click', () => toggleReviewMessage(el, msg.id));
    container.appendChild(el);
  });
}

function toggleReviewMessage(el, msgId) {
  el.classList.toggle('selected');
  if (el.classList.contains('selected')) {
    if (!feedbackState.targetMessageIds.includes(msgId)) feedbackState.targetMessageIds.push(msgId);
  } else {
    feedbackState.targetMessageIds = feedbackState.targetMessageIds.filter(id => id !== msgId);
  }
}

function renderReviewReasonsGrid() {
  const container = document.getElementById('review-reasons-grid');
  if (!container) return;
  container.innerHTML = '';
  FEEDBACK_REASONS.forEach(reason => {
    const btn = document.createElement('button');
    btn.className = 'review-reason-btn';
    btn.dataset.reasonId = reason.id;
    btn.textContent = reason.label;
    btn.addEventListener('click', () => toggleReviewReason(btn, reason.id));
    container.appendChild(btn);
  });
}

function toggleReviewReason(btn, reasonId) {
  if (reasonId === 'none') {
    document.querySelectorAll('.review-reason-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    feedbackState.reasons = ['none'];
  } else {
    const noneBtn = document.querySelector('.review-reason-btn[data-reason-id="none"]');
    if (noneBtn) noneBtn.classList.remove('selected');
    feedbackState.reasons = feedbackState.reasons.filter(r => r !== 'none');
    btn.classList.toggle('selected');
    if (btn.classList.contains('selected')) {
      if (!feedbackState.reasons.includes(reasonId)) feedbackState.reasons.push(reasonId);
    } else {
      feedbackState.reasons = feedbackState.reasons.filter(r => r !== reasonId);
    }
  }
}

function onReflectCheckChange(checkbox) {
  feedbackState.reflectToManual = checkbox.checked;
}

function saveReviewAndFinish() {
  const memoEl = document.getElementById('review-free-memo');
  if (memoEl) feedbackState.note = memoEl.value.trim();

  const cf = {
    id: 'cf_' + Date.now(),
    roomId: 'room_' + (state.selectedPartnerKey || 'unknown'),
    targetMessageIds: feedbackState.targetMessageIds.slice(),
    reasons: feedbackState.reasons.length > 0 ? feedbackState.reasons.slice() : ['none'],
    note: feedbackState.note,
    reflectToManual: feedbackState.reflectToManual,
    createdAt: Date.now()
  };

  // 会話セッションのふりかえり生データとして保存
  if (!userManual.learning.feedbacks) userManual.learning.feedbacks = [];
  userManual.learning.feedbacks.push(cf);

  if (feedbackState.reflectToManual) {
    const incident = {
      id: 'inc_' + Date.now(),
      source: 'conversationFeedback',
      targetMessageIds: cf.targetMessageIds,
      types: cf.reasons.filter(r => r !== 'none'),
      note: cf.note,
      createdAt: Date.now()
    };
    userManual.learning.incidents.push(incident);

    // Ver.0.3-Aでは、NG話題や苦手ワードへの自動昇格はまだ行わない。
    // まずは learning.incidents に記録し、トリセツが育つ体験だけを見せる。
  }

  const msgEl = document.getElementById('review-step6-message');
  const btnEl = document.getElementById('review-step6-btn');
  const isOk = feedbackState.overallOk === 'ok' || cf.reasons[0] === 'none';

  if (msgEl) {
    if (isOk) {
      msgEl.innerHTML = 'それはよかった！<br>あんたが心地よく過ごせたのが一番や。<br>今回のノリを「ちょうどええ感じ」として、トリセツの土台に覚えさせておくね。';
    } else {
      msgEl.innerHTML = '教えてくれておおきに。<br>選んでくれた内容をもとに、次からは似たようなノリに少し気をつけるようにするね。<br>あんたのトリセツ、ちょっと強くなったで🍵';
    }
  }
  if (btnEl) {
    btnEl.textContent = isOk ? 'トリセツに今のノリを記憶して戻る' : '次回のトリセツに反映して部屋を閉じる';
  }

  goReviewStep(6);
}

function startReview() {
  feedbackState = { overallOk: null, targetMessageIds: [], reasons: [], note: '', reflectToManual: false };
  reviewCurrentStep = 1;

  for (let i = 1; i <= 6; i++) {
    const panel = document.getElementById('review-step-' + i);
    if (panel) panel.classList.toggle('hidden', i !== 1);
  }

  document.querySelectorAll('.review-step-dot').forEach(dot => {
    dot.classList.toggle('active', parseInt(dot.dataset.step) === 1);
    dot.classList.remove('done');
  });

  const cb = document.getElementById('review-reflect-checkbox');
  if (cb) cb.checked = false;
  const memo = document.getElementById('review-free-memo');
  if (memo) memo.value = '';

  goTo('screen-review');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// 初期化
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('screen-top').classList.add('active');
  renderPartnerPresets();
});
