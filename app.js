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

// ===== おばちゃんアクション定義（Ver.0.3-C）=====
// 非常口ボタン（おばちゃんを呼ぶ）用
const OBASAN_ACTIONS = [
  { id: 'wait_reply',   label: 'ちょっと待って！' },
  { id: 'change_topic', label: '話題をちょっと変える' },
  { id: 'obasan_join',  label: 'おばちゃん、間に入って' },
  { id: 'close_today',  label: '今日はここまでにする' }
];

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

// ===== オノノケ縁側システム（Ver.0.5-A）=====

const CHARACTER_REGISTRY = {
  obasan: {
    id: 'obasan',
    name: 'つながろおばちゃん',
    emoji: '👵🏻',
    role: 'decompression',
    description: '初対面や気まずさをゆるめる'
  },
  safety: {
    id: 'safety',
    name: '安全さん',
    emoji: '🦺',
    role: 'boundary',
    description: '同意・境界線・断る自由を確認する'
  },
  manual: {
    id: 'manual',
    name: 'トリセツくん',
    emoji: '📄',
    role: 'intent_sorting',
    description: '目的や関係性の希望を整理する'
  }
};

const ISSUE_TO_CHARACTER = {
  awkward:       'obasan',
  waiting_reply: 'obasan',
  close_today:   'obasan',
  safety_check:  'safety',
  purpose:       'manual'
};

// 状態ボタン定義
const ISSUE_BUTTONS = [
  { issueType: 'awkward',       label: '😳 気まずい / 沈黙' },
  { issueType: 'waiting_reply', label: '⏳ 返事を待ってもらいたい' },
  { issueType: 'purpose',       label: '🔥 目的をはっきりさせたい' },
  { issueType: 'safety_check',  label: '🦺 安全確認したい' },
  { issueType: 'close_today',   label: '🚪 今日はここまでにしたい' }
];

// キャラごとの固定メッセージ
const CHARACTER_MESSAGES = {
  awkward: {
    characterId: 'obasan',
    text: '呼んでくれてありがとうな。\nちょっと言葉が詰まってもうた？\n\n大丈夫。\nネットの会話なんて、間が空くこともあるで。\n\nおばちゃんが少し間を持っとくから、\n今すぐ返事せんでも大丈夫やで🍵'
  },
  waiting_reply: {
    characterId: 'obasan',
    text: 'ちょっと待ってもらおか。\n\n今、言葉を選んでるところやから、\n急いで返事せんでも大丈夫。\n\nおばちゃんが少し間を持っとくで🍵'
  },
  purpose: {
    characterId: 'manual',
    text: '呼んでくれてありがとう。\n\nちょっと期待値のズレが出そうかな。\n\n僕は審判じゃないから、どっちの目的が正しいかは決めないよ。\n\nただ、お互いの目的を曖昧にしたまま進むと、あとで気まずくなりやすい。\n\nいまは、何を求めて話しているのかを、少しだけ整理してみよう。'
  },
  safety_check: {
    characterId: 'safety',
    text: '呼んでくれて助かる。\n\nちょっと流れが早くなってきたかもしれないな。\n\n誰かを責めるためじゃなくて、\nお互いの足場を確認しよう。\n\n個人情報、連絡先、会う場所、同意、断る自由。\nここは焦らず、ひとつずつ確認していこう。'
  },
  close_today: {
    characterId: 'obasan',
    text: '今日はここまでにしよか。\n\n目的やノリがちょっと違っただけやから、\n誰も悪うないで。\n\nおばちゃんがこの部屋、やわらかく閉じておくね。\n\nこのあと、ふりかえり部屋で次回の作戦会議しよか。'
  }
};

// ===== Room Status Bar コピー（Ver.0.5-B）=====
const ISSUE_STATUS_COPY = {
  waiting_reply: {
    label: '🍵 お茶タイム中',
    description: '今は、言葉を選んでいる時間です。急いで返事しなくて大丈夫です。',
    peerVisibleText: '少し思案中です。返信は急がなくてOKです。'
  },
  awkward: {
    label: '👵🏻 間を持っています',
    description: '会話の沈黙や気まずさを、おばちゃんが少し預かっています。無理に話さなくて大丈夫です。',
    peerVisibleText: '今は少しリラックス中です。のんびりいきましょう。'
  },
  purpose: {
    label: '📄 目的整理中',
    description: '目的のズレを調整中です。どちらの目的が正しいかを決める時間ではありません。',
    peerVisibleText: 'お互いの目的を再確認中です。期待値を合わせるためです。'
  },
  safety_check: {
    label: '🦺 安全確認中',
    description: '安全な距離感を確認中です。誰かを責めるためではありません。',
    peerVisibleText: '安全な距離感の確認中です。双方が心地よく過ごすための確認です。'
  },
  close_today: {
    label: '🚪 終了準備中',
    description: '責めずに部屋を閉じる準備をしています。目的やノリが違っただけです。',
    peerVisibleText: '今日はここまで。お互いに良い時間になりますように。'
  }
};

// ===== おばちゃんヘルパーアクション定義（Ver.0.4-A）=====
// 通常メニュー（迷ったら整理棚）用
const OBASAN_HELP_ACTIONS = [
  { id: 'sort_choice',   label: '迷ったら整理してもらう' },
  { id: 'light_lottery', label: '軽いくじで決める' },
  { id: 'safety_check',  label: '安全だけ確認する' }
];

// ===== ルーム状態（Ver.0.4-A）=====
let room = {
  mode: 'normal'  // 'normal' | 'decompressing' | 'waiting_reply' | 'choice_sorting' | 'choice_lottery' | 'character_assist' | 'closing'
};

let uiState = {
  obasan: {
    summoned: false,
    mode: 'idle',       // 'idle' | 'decompressing' | 'helper'
    selectedAction: null,
    helperMode: null    // null | 'sorting' | 'lottery'
  },
  assistantTeam: {
    activeCharacterId: null,
    activeIssueType: null,
    lastCharacterId: null,
    statusVisible: false
  }
};

// ===== あみだデータモデル（Ver.0.4-A）=====
let lotteryChoice = {
  id: null,
  title: 'どれにしようかな',
  choices: [],
  riskLevel: 'low',
  allowedForLottery: true,
  result: null
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

  // room / uiState 初期化（Ver.0.3-C / Ver.0.5-A）
  room.mode = 'normal';
  uiState.obasan.summoned = false;
  uiState.obasan.mode = 'idle';
  uiState.obasan.selectedAction = null;
  uiState.obasan.helperMode = null;
  uiState.assistantTeam.activeCharacterId = null;
  uiState.assistantTeam.activeIssueType   = null;
  uiState.assistantTeam.lastCharacterId   = null;
  uiState.assistantTeam.statusVisible     = false;
  const statusCardEl = document.getElementById('assistant-status-card');
  if (statusCardEl) { statusCardEl.classList.add('hidden'); statusCardEl.innerHTML = ''; }

  // 画面移動
  goTo('screen-room');

  // DOMリセット
  const container = document.getElementById('chat-container');
  if (container) container.innerHTML = '';
  const choiceList = document.getElementById('room-choice-list');
  if (choiceList) { choiceList.innerHTML = ''; choiceList.classList.add('hidden'); }
  const endArea = document.getElementById('room-end-area');
  if (endArea) endArea.classList.add('hidden');
  // 状態バーのモードクラスリセット
  const statusBar = document.getElementById('room-status-bar');
  if (statusBar) statusBar.classList.remove('mode-decompressing', 'mode-waiting', 'mode-closing');
  // 状態ボタンパネルリセット（Ver.0.5-A）
  const issuePanel = document.getElementById('issue-button-panel');
  if (issuePanel) issuePanel.classList.add('hidden');
  // ヘルパーメニューリセット
  const helperPanel = document.getElementById('helper-menu-panel');
  if (helperPanel) helperPanel.classList.add('hidden');
  // あみだパネルリセット
  hideAllAmidaPanels();

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
// type: 'user' | 'partner' | 'obasan' | 'system' | 'sponsor' | 'character'
// charOpts: { characterId, characterName, characterEmoji, issueType } (ロールが'character'の時のみ必要)
function addMessage(type, text, delay, metaOrCharOpts) {
  return new Promise(resolve => {
    setTimeout(() => {
      const container = document.getElementById('chat-container');
      if (!container) { resolve(); return; }

      const msgEl = document.createElement('div');

      let icon, label;

      if (type === 'character') {
        // キャラメッセージ専用バブル
        const charId    = metaOrCharOpts?.characterId || 'obasan';
        const charData  = CHARACTER_REGISTRY[charId] || CHARACTER_REGISTRY.obasan;
        icon  = charData.emoji;
        label = charData.name;
        msgEl.className = 'message message-character message-character--' + charId;
      } else {
        const iconMap  = { obasan: '👵🏻', user: '💬', partner: '👤', system: '🔔', sponsor: '📢' };
        const labelMap = { obasan: 'つながろおばちゃん', user: '自分', partner: partnerPresets[state.selectedPartnerKey]?.name || 'お相手', system: 'システム', sponsor: 'スポンサー' };
        icon  = iconMap[type]  || '';
        label = labelMap[type] || type;
        msgEl.className = 'message message-' + type;
      }

      const safeText = escapeHtml(text);
      const formattedText = safeText.replace(/\n/g, '<br>');

      msgEl.innerHTML = `
        <div class="message-header">
          <span class="message-icon">${icon}</span>
          <span class="message-label">${label}</span>
        </div>
        <div class="message-body">${formattedText}</div>
      `;

      // createMessageのメタ情報を構築
      let msgMeta;
      if (type === 'character') {
        const charId = metaOrCharOpts?.characterId || 'obasan';
        msgMeta = {
          systemGenerated: true,
          issueType: metaOrCharOpts?.issueType || null,
          decisionByAI: false,
          userCanOverride: true,
          characterId: charId,
          characterName: CHARACTER_REGISTRY[charId]?.name || '',
          characterEmoji: CHARACTER_REGISTRY[charId]?.emoji || ''
        };
      } else {
        msgMeta = Object.assign({ systemGenerated: type !== 'user' }, metaOrCharOpts || {});
      }

      const msg = createMessage(type, text, msgMeta);
      state.roomMessages.push(msg);

      container.appendChild(msgEl);
      container.scrollTop = container.scrollHeight;
      resolve();
    }, delay || 0);
  });
}

// ----- 状態バー更新 -----
// 状態バー更新（最小表示：モード名のみ、詳細説明なし）
function updateStatusBar(text) {
  const el = document.getElementById('room-status-text');
  if (el) el.textContent = text;
  // 状態バーのモードクラスを切り替え
  const bar = document.getElementById('room-status-bar');
  if (bar) {
    bar.classList.remove('mode-decompressing', 'mode-waiting', 'mode-closing', 'mode-character');
    if (room.mode === 'decompressing') bar.classList.add('mode-decompressing');
    else if (room.mode === 'waiting_reply') bar.classList.add('mode-waiting');
    else if (room.mode === 'closing') bar.classList.add('mode-closing');
    else if (room.mode === 'character_assist') bar.classList.add('mode-character');
  }
}

// ----- UI表示切り替え（クラスのみで制御） -----
function setRoomUIState(obasanIn) {
  state.obasanInRoom = obasanIn;

  const callWrap    = document.getElementById('call-obasan-wrap');
  const inputArea   = document.getElementById('room-input-area');
  const choiceList  = document.getElementById('room-choice-list');
  const endArea     = document.getElementById('room-end-area');
  const issuePanel  = document.getElementById('issue-button-panel');

  if (obasanIn) {
    callWrap.classList.add('hidden');
    inputArea.classList.add('hidden');
    if (issuePanel) issuePanel.classList.add('hidden');
    updateStatusBar('おばちゃんが場を整えています');
  } else {
    callWrap.classList.remove('hidden');
    inputArea.classList.remove('hidden');
    if (issuePanel) issuePanel.classList.remove('hidden');
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

  choices.forEach((choice, idx) => {
    const btn = document.createElement('button');
    // OBASAN_ACTIONSの4択の場合、最後の「今日はここまで」は控えめの色
    const isLastGhost = (choices.length === 4 && idx === 3);
    btn.className = 'room-choice-btn' + (isLastGhost ? ' btn-ghost-choice' : '');
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

// ----- おばちゃんを呼ぶ（Ver.0.3-C）-----
function callObasan() {
  if (state.roomCalledObasan) return;
  state.roomCalledObasan = true;

  // room.mode と uiState を更新
  room.mode = 'decompressing';
  uiState.obasan.summoned = true;
  uiState.obasan.mode = 'decompressing';
  uiState.obasan.selectedAction = null;

  const callBtn = document.getElementById('call-obasan-btn');
  if (callBtn) callBtn.disabled = true;

  const inputArea = document.getElementById('room-input-area');
  if (inputArea) inputArea.classList.add('hidden');

  updateStatusBar('👵🏻 おばちゃん介入中');

  // 初動メッセージ（仕様通り）
  addMessage('obasan',
    '呼んでくれてありがとうな。\nちょっとここでお茶でも飲んで、流れをゆるめよか。\n\n今すぐ言葉を探さなくて大丈夫。\nまずは落ち着いてな。\n\nこの中から、今いちばん近いやつを選んでみて。',
    400,
    { systemGenerated: true, interventionType: 'summoned', boundaryFlag: null, relatedToMessageId: null }
  ).then(() => {
    // OBASAN_ACTIONSから4択を生成
    showChoices(OBASAN_ACTIONS.map(a => ({
      label: a.label,
      action: () => handleObasanAction(a.id)
    })));
  });
}

// ----- おばちゃんアクション処理（Ver.0.3-C）-----
function handleObasanAction(actionId) {
  const callBtn = document.getElementById('call-obasan-btn');
  const inputArea = document.getElementById('room-input-area');

  uiState.obasan.selectedAction = actionId;

  if (actionId === 'wait_reply') {
    // ちょっと待って！
    room.mode = 'waiting_reply';
    updateStatusBar('🍵 お茶タイム中');

    addMessage('obasan',
      'ちょっとストップな。\n今、じっくり言葉を選んでるところやから、少しだけ待ったげてな。\n\n急がんでええよ。\n焦らずいこか🍵',
      300,
      { systemGenerated: true, interventionType: 'wait_reply', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      // 入力欄を再表示（言葉を選ぶ時間を与える）
      if (inputArea) inputArea.classList.remove('hidden');
      // おばちゃんボタンを再有効化
      state.roomCalledObasan = false;
      if (callBtn) callBtn.disabled = false;
      const container = document.getElementById('chat-container');
      if (container) container.scrollTop = container.scrollHeight;
    });

  } else if (actionId === 'change_topic') {
    // 話題をちょっと変える
    room.mode = 'normal';
    updateStatusBar('おばちゃんが場を整えています…');

    addMessage('obasan',
      'ちょっと空気変えよか。\nおばちゃんが軽いお題を置いとくね。\n\n最近食べた美味しいものとか、最近見たものくらいからでええよ。',
      300,
      { systemGenerated: true, interventionType: 'change_topic', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      state.roomCalledObasan = false;
      if (callBtn) callBtn.disabled = false;
      if (inputArea) inputArea.classList.remove('hidden');
      uiState.obasan.mode = 'idle';
      const container = document.getElementById('chat-container');
      if (container) container.scrollTop = container.scrollHeight;
    });

  } else if (actionId === 'obasan_join') {
    // おばちゃん、間に入って
    room.mode = 'decompressing';
    uiState.obasan.mode = 'decompressing';
    updateStatusBar('👵🏻 おばちゃん介入中');

    addMessage('obasan',
      '了解や。\nここから少し、おばちゃんも一緒におるね。\n\n二人のトリセツを見ながら、ちょうどええ距離感で話せるように、間を持つわ。',
      300,
      { systemGenerated: true, interventionType: 'obasan_join', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      state.roomCalledObasan = false;
      if (callBtn) callBtn.disabled = false;
      if (inputArea) inputArea.classList.remove('hidden');
      const container = document.getElementById('chat-container');
      if (container) container.scrollTop = container.scrollHeight;
    });

  } else if (actionId === 'close_today') {
    // 今日はここまでにする
    room.mode = 'closing';
    uiState.obasan.selectedAction = 'close_today';
    updateStatusBar('今日はここまで');

    addMessage('obasan',
      'よし、今日のおしゃべりはここまでにしよか。\n二人ともお疲れさん。\n\n目的やノリがちょっと違っただけやから、誰も悪うないで。\nおばちゃんがこの部屋、やわらかく閉じておくね。\n\nこのあと、ふりかえり部屋で次回の作戦会議しよか。',
      300,
      { systemGenerated: true, interventionType: 'close_today', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      const callWrap = document.getElementById('call-obasan-wrap');
      if (callWrap) callWrap.classList.add('hidden');
      if (inputArea) inputArea.classList.add('hidden');
      const endArea = document.getElementById('room-end-area');
      if (endArea) endArea.classList.remove('hidden');
      const container = document.getElementById('chat-container');
      if (container) container.scrollTop = container.scrollHeight;
    });
  }
}

// ============================================================
// オノノケ縁側システム（Ver.0.5-A）
// ============================================================

// ----- 状態帯カードを描画する（Ver.0.5-B）-----
function renderAssistantStatusCard() {
  const card = document.getElementById('assistant-status-card');
  if (!card) return;

  const issuePanel    = document.getElementById('issue-button-panel');
  const callObasanWrap = document.getElementById('call-obasan-wrap');

  if (!uiState.assistantTeam.statusVisible) {
    card.classList.add('hidden');
    // カード非表示時はボタン群を通常表示に戻す
    if (issuePanel) issuePanel.classList.remove('collapsed');
    if (callObasanWrap) callObasanWrap.classList.remove('dimmed');
    return;
  }

  const issueType = uiState.assistantTeam.activeIssueType;
  const copy = ISSUE_STATUS_COPY[issueType];
  if (!copy) {
    card.classList.add('hidden');
    return;
  }

  card.setAttribute('data-issue', issueType);
  card.innerHTML =
    '<div class="status-card-label">' + escapeHtml(copy.label) + '</div>' +
    '<div class="status-card-description">' + escapeHtml(copy.description) + '</div>' +
    '<div class="status-card-peer-preview">' +
      '<strong>相手側にはこう見えています：</strong>' +
      '<span>' + escapeHtml(copy.peerVisibleText) + '</span>' +
    '</div>' +
    '<div class="status-card-actions">' +
      '<button class="status-card-btn status-card-btn--release" onclick="releaseIssueStatus()">✕ この状態を解除</button>' +
      '<button class="status-card-btn status-card-btn--change" onclick="changeIssueStatus()">別の助け舟を選ぶ</button>' +
    '</div>';

  card.classList.remove('hidden');

  // 状態カード表示中はボタン群を折りたたみ・おばちゃんボタンを薄く
  if (issuePanel) issuePanel.classList.add('collapsed');
  if (callObasanWrap) callObasanWrap.classList.add('dimmed');
}

// ----- 状態を解除して通常モードに戻す -----
function releaseIssueStatus() {
  uiState.assistantTeam.statusVisible    = false;
  uiState.assistantTeam.activeIssueType  = null;
  uiState.assistantTeam.activeCharacterId = null;
  room.mode = 'normal';

  const card = document.getElementById('assistant-status-card');
  if (card) { card.classList.add('hidden'); card.innerHTML = ''; }

  const issuePanel    = document.getElementById('issue-button-panel');
  const callObasanWrap = document.getElementById('call-obasan-wrap');
  if (issuePanel) issuePanel.classList.remove('collapsed');
  if (callObasanWrap) callObasanWrap.classList.remove('dimmed');

  updateStatusBar('あとはお二人で');
}

// ----- 別の助け舟を選ぶ（カードを消してissueパネルを展開）-----
function changeIssueStatus() {
  uiState.assistantTeam.statusVisible    = false;
  uiState.assistantTeam.activeIssueType  = null;
  uiState.assistantTeam.activeCharacterId = null;
  room.mode = 'normal';

  const card = document.getElementById('assistant-status-card');
  if (card) { card.classList.add('hidden'); card.innerHTML = ''; }

  const issuePanel    = document.getElementById('issue-button-panel');
  const callObasanWrap = document.getElementById('call-obasan-wrap');
  if (issuePanel) { issuePanel.classList.remove('collapsed'); issuePanel.classList.remove('hidden'); }
  if (callObasanWrap) callObasanWrap.classList.remove('dimmed');

  updateStatusBar('あとはお二人で');
}

// ----- 状態ボタンクリック時のハンドラ -----
function handleIssueButtonClick(issueType) {
  // 1. ISSUE_TO_CHARACTERで担当キャラを取得
  const assignedCharacterId = ISSUE_TO_CHARACTER[issueType];
  if (!assignedCharacterId) return;

  // 2. CHARACTER_REGISTRYからキャラ情報を取得
  const character = CHARACTER_REGISTRY[assignedCharacterId];
  if (!character) return;

  // 3. room.modeを更新
  if (issueType === 'close_today') {
    room.mode = 'closing';
  } else {
    room.mode = 'character_assist';
  }

  // 4. uiState.assistantTeamを更新（常に1枚のみ：既存カードは上書き）
  uiState.assistantTeam.activeIssueType    = issueType;
  uiState.assistantTeam.activeCharacterId  = assignedCharacterId;
  uiState.assistantTeam.lastCharacterId    = assignedCharacterId;
  uiState.assistantTeam.statusVisible      = true;

  const issuePanel = document.getElementById('issue-button-panel');
  const inputArea  = document.getElementById('room-input-area');
  const callWrap   = document.getElementById('call-obasan-wrap');

  // 5. 入力欄を一時非表示
  if (inputArea) inputArea.classList.add('hidden');

  // 6. キャラごとの固定メッセージを表示
  const msgData = CHARACTER_MESSAGES[issueType];
  if (!msgData) return;

  const statusLabel = character.emoji + ' ' + character.name;
  updateStatusBar(statusLabel);

  // 7. 状態帯カードを描画（1枚のみ、重複なし）
  renderAssistantStatusCard();

  addMessage('character', msgData.text, 300, {
    characterId: assignedCharacterId,
    issueType: issueType
  }).then(() => {
    // close_todayの場合は終了エリアを表示
    if (issueType === 'close_today') {
      updateStatusBar('今日はここまで');
      if (callWrap) callWrap.classList.add('hidden');
      if (issuePanel) issuePanel.classList.add('hidden');
      const endArea = document.getElementById('room-end-area');
      if (endArea) endArea.classList.remove('hidden');
    } else {
      // その他は入力欄を再表示。issueパネルはcollapsed状態のまま（状態カードが主役）
      if (inputArea) inputArea.classList.remove('hidden');
    }
    const container = document.getElementById('chat-container');
    if (container) container.scrollTop = container.scrollHeight;
  });
}

// ============================================================
// 迷ったら整理棚 ・ おばちゃんあみだ（Ver.0.4-A）
// ============================================================

// ----- ヘルパーメニュー開閉 -----
function toggleHelperMenu() {
  const panel = document.getElementById('helper-menu-panel');
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
}

function closeHelperMenu() {
  const panel = document.getElementById('helper-menu-panel');
  if (panel) panel.classList.add('hidden');
}

// ----- あみだ全パネルを隐す -----
function hideAllAmidaPanels() {
  ['amida-risk-check', 'amida-input-panel', 'amida-sorting-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// ----- ヘルパーアクション開始 -----
function startHelperAction(actionId) {
  closeHelperMenu();

  if (actionId === 'light_lottery') {
    // おばちゃんあみだ：低リスク確認画面へ
    showRiskCheck();

  } else if (actionId === 'sort_choice') {
    // 迷ったら整理してもらう
    room.mode = 'choice_sorting';
    uiState.obasan.mode = 'helper';
    uiState.obasan.helperMode = 'sorting';
    updateStatusBar('🗂 整理棚で並べています…');
    addMessage('obasan',
      '迷ってることを一緒に並べてみよか。\n\n何に迷ってるか、チャットに書いてみてな。\nおばちゃんが一緒に考えるわ。',
      300,
      { systemGenerated: true, interventionType: 'sort_choice' }
    );

  } else if (actionId === 'safety_check') {
    // 安全確認
    room.mode = 'choice_sorting';
    uiState.obasan.mode = 'helper';
    uiState.obasan.helperMode = 'sorting';
    updateStatusBar('🛡 安全確認中…');
    addMessage('obasan',
      '安全の確認やな。\n\n今、相手から何か気になることはある？\n答えたくないことは答えなくていいし、\n媳なことがあればすぐ言ってな。',
      300,
      { systemGenerated: true, interventionType: 'safety_check' }
    );
  }
}

// ----- 低リスク確認画面表示 -----
function showRiskCheck() {
  hideAllAmidaPanels();
  const panel = document.getElementById('amida-risk-check');
  const body  = document.getElementById('amida-risk-check-body');
  if (!panel || !body) return;

  body.innerHTML = '';

  // おばちゃんメッセージ
  const msgEl = document.createElement('div');
  msgEl.className = 'amida-obasan-msg';
  msgEl.innerHTML = `
    <span class="amida-obasan-icon">👵🏻</span>
    <div class="amida-obasan-text">
      お、あみだくじ引く？<br><br>
      でも、引く前にこれだけ確認させてな。<br><br>
      今から決めることって、<br>
      どっちになっても大きな問題はない、軽い迷いで合ってる？<br><br>
      安全、お金、個人情報、性的なこと、付き合うかどうか、断るかどうか。<br>
      そういう大事なことは、くじで決めたらあかんで。
    </div>
  `;
  body.appendChild(msgEl);

  // ボタンエリア
  const btnArea = document.createElement('div');
  btnArea.className = 'amida-risk-buttons';
  btnArea.innerHTML = `
    <button class="amida-btn-ok" onclick="onRiskCheckOk()">🟢 うん、軽い迷い！</button>
    <button class="amida-btn-ng" onclick="onRiskCheckNg()">🚨 ちょっと真剣な迷いかも</button>
  `;
  body.appendChild(btnArea);

  panel.classList.remove('hidden');
}

// ----- 低リスク OK -----
function onRiskCheckOk() {
  hideAllAmidaPanels();
  lotteryChoice = {
    id: 'lottery_' + Date.now(),
    title: 'どれにしようかな',
    choices: [],
    riskLevel: 'low',
    allowedForLottery: true,
    result: null
  };
  room.mode = 'choice_lottery';
  uiState.obasan.mode = 'helper';
  uiState.obasan.helperMode = 'lottery';
  updateStatusBar('🎲 おばちゃんあみだ中…');

  // おばちゃんメッセージをチャットに追加
  addMessage('obasan',
    'よし、ほな軽く転がしてみよか。\n迷ってる選択肢を2つから4つ入れてな。',
    300,
    { systemGenerated: true, interventionType: 'lottery_start' }
  ).then(() => {
    const inputPanel = document.getElementById('amida-input-panel');
    if (inputPanel) {
      // 入力欄をリセット
      ['amida-choice-1','amida-choice-2','amida-choice-3','amida-choice-4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      inputPanel.classList.remove('hidden');
    }
    const container = document.getElementById('chat-container');
    if (container) container.scrollTop = container.scrollHeight;
  });
}

// ----- 低リスク NG（高リスク判定） -----
function onRiskCheckNg() {
  hideAllAmidaPanels();
  lotteryChoice.riskLevel = 'high';
  lotteryChoice.allowedForLottery = false;
  room.mode = 'choice_sorting';
  uiState.obasan.mode = 'helper';
  uiState.obasan.helperMode = 'sorting';
  updateStatusBar('🗂 整理棚で並べています…');

  // 整理棚誘導パネルを表示
  const sortingPanel = document.getElementById('amida-sorting-panel');
  const sortingBody  = document.getElementById('amida-sorting-body');
  if (sortingBody) {
    sortingBody.innerHTML = `
      <div class="amida-obasan-msg">
        <span class="amida-obasan-icon">👵🏻</span>
        <div class="amida-obasan-text">
          立ち止まれてえらい。<br><br>
          これはくじで決める話やないかもしれんな。<br><br>
          いったんあみだはしまって、<br>
          迷ったら整理棚で、何に迷ってるか一緒に並べよか。
        </div>
      </div>
    `;
  }
  if (sortingPanel) sortingPanel.classList.remove('hidden');

  addMessage('obasan',
    '立ち止まれてえらい。\nこれはくじで決めるには、ちょっと重いかもしれんな。\n安全や気持ちに関わることは、いったん整理して考えよか。',
    300,
    { systemGenerated: true, interventionType: 'lottery_blocked' }
  );
}

// ----- あみだ実行 -----
function runAmida() {
  // 入力値を収集
  const inputs = [
    document.getElementById('amida-choice-1'),
    document.getElementById('amida-choice-2'),
    document.getElementById('amida-choice-3'),
    document.getElementById('amida-choice-4')
  ];
  const choices = inputs
    .map(el => el ? el.value.trim() : '')
    .filter(v => v !== '');

  if (choices.length < 2) {
    alert('選択肢を2つ以上入れてな！');
    return;
  }

  // canLotteryチェック
  const canLottery = lotteryChoice.allowedForLottery && lotteryChoice.riskLevel === 'low';
  if (!canLottery) {
    addMessage('obasan',
      'これはくじで決めるには、ちょっと重いかもしれんな。\n安全や気持ちに関わることは、いったん整理して考えよか。',
      0,
      { systemGenerated: true, interventionType: 'lottery_blocked' }
    );
    hideAllAmidaPanels();
    return;
  }

  // 入力パネルを隐す
  hideAllAmidaPanels();

  // 選択肢をデータモデルに保存
  lotteryChoice.choices = choices.map((label, i) => ({
    id: String.fromCharCode(97 + i),  // 'a', 'b', 'c', 'd'
    label: label
  }));

  // Math.random()でランダム選択
  const result = lotteryChoice.choices[Math.floor(Math.random() * lotteryChoice.choices.length)];
  lotteryChoice.result = result;

  // 結果を role: 'obasan' のメッセージとして追加
  const resultText = `あみだ完了や！\n\n結果は……「${result.label}」になったで。\n\nただし、これは最終決定やないからな。\n結果を見て「やっぱり違うかも」と思ったら、それも大事な本音やで。\n\n参考くらいにして、最後は自分で選んでええよ🏥`;

  addMessage('obasan', resultText, 400, {
    systemGenerated: true,
    interventionType: 'choice_lottery_result',
    decisionByAI: false,
    randomSelected: true,
    riskLevel: 'low',
    userCanOverride: true
  }).then(() => {
    // やり直しボタンを選択肢リストに表示
    const list = document.getElementById('room-choice-list');
    if (list) {
      list.innerHTML = '';
      list.classList.remove('hidden');
      const retryBtn = document.createElement('button');
      retryBtn.className = 'room-choice-btn';
      retryBtn.textContent = '🎲 やり直す';
      retryBtn.onclick = () => {
        list.classList.add('hidden');
        list.innerHTML = '';
        onRiskCheckOk();
      };
      const okBtn = document.createElement('button');
      okBtn.className = 'room-choice-btn';
      okBtn.textContent = 'この結果で進む';
      okBtn.onclick = () => {
        list.classList.add('hidden');
        list.innerHTML = '';
        room.mode = 'normal';
        uiState.obasan.mode = 'idle';
        uiState.obasan.helperMode = null;
        updateStatusBar('あとはお二人で');
        const container = document.getElementById('chat-container');
        if (container) container.scrollTop = container.scrollHeight;
      };
      list.appendChild(retryBtn);
      list.appendChild(okBtn);
    }
    const container = document.getElementById('chat-container');
    if (container) container.scrollTop = container.scrollHeight;
  });
}

// ----- あみだキャンセル -----
function cancelAmida() {
  hideAllAmidaPanels();
  room.mode = 'normal';
  uiState.obasan.mode = 'idle';
  uiState.obasan.helperMode = null;
  updateStatusBar('あとはお二人で');
  const container = document.getElementById('chat-container');
  if (container) container.scrollTop = container.scrollHeight;
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

// ============================================================
// Ver.0.6-A — 待合室 / おばちゃん紹介カード / 相手確認中
// ============================================================

// ===== デモプロフィール =====
const demoProfiles = [
  {
    id: 'profile_nori_001',
    displayName: 'ノリ強めさん',
    avatarType: 'icon',
    avatarEmoji: '👤',
    photoStatus: 'later',
    purpose: '軽く雑談したい',
    okTopics: ['食べ物', 'グルメ', '音楽'],
    ngTopics: ['外見', '体型', '重い話'],
    talkTemperature: '軽め',
    availability: '10分くらい',
    obasanMemo: '最初は食べ物の話から入るとよさそうです。'
  },
  {
    id: 'profile_cafe_002',
    displayName: 'カフェ好きさん',
    avatarType: 'illustration',
    avatarEmoji: '☕',
    photoStatus: 'no_photo',
    purpose: '短時間だけ話したい',
    okTopics: ['カフェ', '散歩', '映画'],
    ngTopics: ['連絡先交換を急ぐこと', '外見評価'],
    talkTemperature: 'ゆっくり',
    availability: '短め',
    obasanMemo: '焦らず、短い会話から始めるとよさそうです。'
  },
  {
    id: 'profile_hobby_003',
    displayName: '趣味人さん',
    avatarType: 'illustration',
    avatarEmoji: '🎨',
    photoStatus: 'illustration',
    purpose: '趣味や食べ物の話で盛り上がりたい',
    okTopics: ['映画', '音楽', '旅行', 'カフェ'],
    ngTopics: ['収入・お金', '将来の話'],
    talkTemperature: 'ほどほど',
    availability: 'ゆっくり',
    obasanMemo: '共通の趣味から入ると話が弾みそうです。'
  }
];

// ===== uiState.matching =====
uiState.matching = {
  currentScreen: 'screen-waiting-room',
  selectedPurpose: null,
  selectedOkTopics: [],
  selectedNgTopics: [],
  selectedTalkTime: null,
  photoPreference: 'later',
  currentProfileIndex: 0,
  selectedProfileId: null,
  matchStatus: 'idle',   // idle | searching | introduced | waiting_peer | matched | passed | cancelled
  lastAction: null,
  selectedFirstWord: null,
  matchTimerId: null
};

// ===== 写真ステータスのラベル =====
function getPhotoStatusLabel(photoStatus, avatarEmoji) {
  if (photoStatus === 'later')        return '🌫️ 写真：あとで設定';
  if (photoStatus === 'no_photo')     return '👤 写真なしで参加中';
  if (photoStatus === 'illustration') return '🎨 イラストで参加中';
  return avatarEmoji || '👤';
}

// ===== 待合室：目的ボタン選択 =====
function selectWrPurpose(btn) {
  document.querySelectorAll('.wr-purpose-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  uiState.matching.selectedPurpose = btn.dataset.purpose;
  updateWrSearchBtn();
}

// ===== 待合室：タグトグル（OK/NG話題） =====
function toggleWrTag(btn, type) {
  btn.classList.toggle('selected');
  const topic = btn.dataset.topic;
  if (type === 'ok') {
    const idx = uiState.matching.selectedOkTopics.indexOf(topic);
    if (idx === -1) uiState.matching.selectedOkTopics.push(topic);
    else            uiState.matching.selectedOkTopics.splice(idx, 1);
  } else {
    const idx = uiState.matching.selectedNgTopics.indexOf(topic);
    if (idx === -1) uiState.matching.selectedNgTopics.push(topic);
    else            uiState.matching.selectedNgTopics.splice(idx, 1);
  }
}

// ===== 待合室：話せる時間選択 =====
function selectWrTime(btn) {
  document.querySelectorAll('[data-time]').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  uiState.matching.selectedTalkTime = btn.dataset.time;
}

// ===== 待合室：写真タイプ選択 =====
function selectWrPhoto(btn) {
  document.querySelectorAll('[data-photo]').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  uiState.matching.photoPreference = btn.dataset.photo;
}

// ===== 待合室：候補を探すボタンの活性化 =====
function updateWrSearchBtn() {
  const btn = document.getElementById('wr-search-btn');
  const note = document.querySelector('.wr-search-note');
  if (!btn) return;
  if (uiState.matching.selectedPurpose) {
    btn.disabled = false;
    btn.style.opacity = '1';
    if (note) note.style.display = 'none';
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    if (note) note.style.display = 'block';
  }
}

// ===== 候補を探す =====
function handleSearchCandidate() {
  if (!uiState.matching.selectedPurpose) return;
  uiState.matching.matchStatus = 'searching';
  uiState.matching.currentProfileIndex = 0;
  uiState.matching.lastAction = 'search';

  // 静的モック：最初のdemoProfileを表示してscreen-introductionへ
  const profile = demoProfiles[uiState.matching.currentProfileIndex];
  uiState.matching.selectedProfileId = profile.id;
  uiState.matching.matchStatus = 'introduced';

  renderIntroductionCard(profile);
  goTo('screen-introduction');
}

// ===== 紹介カードを描画 =====
function renderIntroductionCard(profile) {
  const card = document.getElementById('intro-profile-card');
  if (!card) return;

  const photoLabel = getPhotoStatusLabel(profile.photoStatus, profile.avatarEmoji);
  const okHtml  = profile.okTopics.map(t => `<span class="intro-tag intro-tag--ok">${escapeHtml(t)}</span>`).join('');
  const ngHtml  = profile.ngTopics.map(t => `<span class="intro-tag intro-tag--ng">${escapeHtml(t)}</span>`).join('');

  card.innerHTML = `
    <div class="intro-card-inner">
      <div class="intro-card-avatar-row">
        <div class="intro-card-avatar">${escapeHtml(profile.avatarEmoji)}</div>
        <div class="intro-card-avatar-meta">
          <div class="intro-card-name">${escapeHtml(profile.displayName)}</div>
          <div class="intro-card-photo-status">${escapeHtml(photoLabel)}</div>
        </div>
      </div>
      <div class="intro-card-purpose-row">
        <span class="intro-card-purpose-label">今日の目的</span>
        <span class="intro-card-purpose-value">${escapeHtml(profile.purpose)}</span>
      </div>
      <div class="intro-card-topics-row">
        <div class="intro-card-topics-label">OK話題</div>
        <div class="intro-card-tags">${okHtml}</div>
      </div>
      <div class="intro-card-topics-row">
        <div class="intro-card-topics-label intro-card-topics-label--ng">NG話題</div>
        <div class="intro-card-tags">${ngHtml}</div>
      </div>
      <div class="intro-card-temp-row">
        <span class="intro-card-temp-label">会話の温度</span>
        <span class="intro-card-temp-value">${escapeHtml(profile.talkTemperature)}</span>
        <span class="intro-card-avail-label">話せる時間</span>
        <span class="intro-card-avail-value">${escapeHtml(profile.availability)}</span>
      </div>
      <div class="intro-card-memo">
        <div class="intro-card-memo-label">👵🏻 おばちゃんメモ</div>
        <div class="intro-card-memo-text">${escapeHtml(profile.obasanMemo)}</div>
      </div>
    </div>
  `;

  // おばちゃんの紹介文を更新
  const speech = document.getElementById('intro-obasan-speech');
  if (speech) {
    speech.innerHTML = `<p>この人、今日の目的が近そうやで。</p><p>いきなり深い話より、OK話題から入るとよさそうやな。</p>`;
  }

  // 見送りメッセージを隠す
  const passMsg = document.getElementById('intro-pass-msg');
  if (passMsg) passMsg.classList.add('hidden');

  // アクションボタンを表示
  const actions = document.querySelector('.intro-actions');
  if (actions) actions.classList.remove('hidden');
}

// ===== 紹介カード：畳の部屋へ入る =====
function handleTalkWithProfile() {
  const profileId = uiState.matching.selectedProfileId;
  if (!profileId) return;
  uiState.matching.matchStatus = 'waiting_peer';
  uiState.matching.lastAction = 'enter';

  // 既存の待機タイマーが残っていたら解除
  if (uiState.matching.matchTimerId) {
    clearTimeout(uiState.matching.matchTimerId);
    uiState.matching.matchTimerId = null;
  }

  renderMatchWaiting();
  goTo('screen-match-waiting');

  // 静的モック：3秒後にmatched扱いでルームへ
  // 途中で「今回はやめる」などを押した場合は入室しない
  uiState.matching.matchTimerId = setTimeout(() => {
    if (uiState.matching.matchStatus !== 'waiting_peer' ||
        uiState.matching.selectedProfileId !== profileId) {
      return;
    }
    uiState.matching.matchTimerId = null;
    enterRoomWithProfile(profileId);
  }, 3000);
}

// ===== 紹介カード：見送る =====
function handlePassProfile() {
  uiState.matching.matchStatus = 'passed';
  uiState.matching.lastAction = 'pass';

  // アクションボタンを隠す
  const actions = document.querySelector('.intro-actions');
  if (actions) actions.classList.add('hidden');

  // 見送りメッセージを表示
  const passMsg = document.getElementById('intro-pass-msg');
  if (passMsg) passMsg.classList.remove('hidden');
}

// ===== 紹介カード：別の人を見る =====
function handleNextProfile() {
  uiState.matching.currentProfileIndex =
    (uiState.matching.currentProfileIndex + 1) % demoProfiles.length;
  const profile = demoProfiles[uiState.matching.currentProfileIndex];
  uiState.matching.selectedProfileId = profile.id;
  uiState.matching.matchStatus = 'introduced';
  uiState.matching.lastAction = 'next';

  renderIntroductionCard(profile);

  // screen-introductionにいない場合は移動
  const intro = document.getElementById('screen-introduction');
  if (!intro || !intro.classList.contains('active')) {
    goTo('screen-introduction');
  }
}

// ===== 相手確認中画面を描画 =====
function renderMatchWaiting() {
  const waitMsg = document.getElementById('match-wait-more-msg');
  if (waitMsg) waitMsg.classList.add('hidden');
  const wordPanel = document.getElementById('match-first-word-panel');
  if (wordPanel) wordPanel.classList.add('hidden');
  uiState.matching.selectedFirstWord = null;
  // ボタンのselectedをリセット
  document.querySelectorAll('.match-word-btn').forEach(b => b.classList.remove('selected'));
}

// ===== 相手確認中：最初の一言パネルを開閉 =====
function toggleFirstWordPanel() {
  const panel = document.getElementById('match-first-word-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
}

// ===== 相手確認中：最初の一言を選ぶ =====
function selectFirstWord(btn) {
  document.querySelectorAll('.match-word-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  uiState.matching.selectedFirstWord = btn.textContent.trim();
}

// ===== 相手確認中：もう少し待つ =====
function matchWaitMore() {
  const msg = document.getElementById('match-wait-more-msg');
  if (msg) msg.classList.remove('hidden');
}

// ===== 相手確認中：今回はやめる =====
function handleCancelWaiting() {
  if (uiState.matching.matchTimerId) {
    clearTimeout(uiState.matching.matchTimerId);
    uiState.matching.matchTimerId = null;
  }
  uiState.matching.matchStatus = 'cancelled';
  uiState.matching.lastAction = 'cancel';
  goTo('screen-waiting-room');
}

// ===== プロフィールIDからルームへ入る =====
function enterRoomWithProfile(profileId) {
  const profile = demoProfiles.find(p => p.id === profileId);
  if (!profile) return;

  uiState.matching.matchStatus = 'matched';

  // demoProfileをpartnerPresetsに一時マッピング
  const tempKey = 'demo_' + profileId;
  partnerPresets[tempKey] = {
    key: tempKey,
    name: profile.displayName,
    emoji: profile.avatarEmoji,
    desc: profile.purpose,
    torisetsu: {
      ngTopics: profile.ngTopics,
      okTopics: profile.okTopics,
      style: '会話温度：' + profile.talkTemperature,
      firstMessages: [
        'はじめまして。よろしくお願いします。',
        'こんにちは。今日はよろしくです。'
      ]
    }
  };

  state.selectedPartnerKey = tempKey;

  // 最初の一言があれば使う（将来拡張用）
  // uiState.matching.selectedFirstWord は room内で参照可能

  startVirtualRoom();
}

// ===== 待合室の初期化 =====
function initWaitingRoom() {
  // 目的ボタンのselectedをリセット
  document.querySelectorAll('.wr-purpose-btn').forEach(b => b.classList.remove('selected'));
  // タグのselectedをリセット
  document.querySelectorAll('.wr-tag').forEach(b => b.classList.remove('selected'));
  // uiState.matchingをリセット
  uiState.matching.selectedPurpose   = null;
  uiState.matching.selectedOkTopics  = [];
  uiState.matching.selectedNgTopics  = [];
  uiState.matching.selectedTalkTime  = null;
  uiState.matching.photoPreference   = 'later';
  uiState.matching.currentProfileIndex = 0;
  uiState.matching.selectedProfileId = null;
  uiState.matching.matchStatus       = 'idle';
  uiState.matching.lastAction        = null;
  uiState.matching.selectedFirstWord = null;
  if (uiState.matching.matchTimerId) {
    clearTimeout(uiState.matching.matchTimerId);
    uiState.matching.matchTimerId = null;
  }
  // 検索ボタンを非活性に
  updateWrSearchBtn();
}
