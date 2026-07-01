'use strict';

// ============================================================
// YUUEKi.com Ver.0.6B-i4-scroll-lock — app.js
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

// ===== 助け舟候補文（Ver.0.6B）=====
// 候補文はonclick文字列に直接埋め込まず、type + indexで扱う。
const HELPER_DRAFT_OPTIONS = {
  topic: [
    '最近食べたものでよかったやつある？',
    '音楽か映画の話にしてみる？'
  ],
  wait: [
    '少しだけ考える時間ください。',
    'ゆっくり返しても大丈夫ですか。'
  ],
  close: [
    '今日はここまでにします。ありがとう。',
    'また合う時があれば話しましょう。'
  ]
};

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
  reviewAnswers: {},
  // 入力下書き（iPhone日本語入力対策：Ver.0.5-C）
  roomDraftMessage: "",
  // isComposingMessage（IMEフラグ：Ver.0.5-C）
  isComposingMessage: false,
  // 待合室マッチング状態（Ver.0.6-A）
  matching: {
    currentScreen: "waiting_room",
    purpose: null,
    talkTime: null,
    talkTemperature: null,
    okTopics: [],
    ngTopics: [],
    selectedProfileId: null,
    matchStatus: "idle"
  },
  // 会話部屋設定（Ver.0.6-A）
  roomConfig: null,
  // 助け舟候補文パネル（Ver.0.6B）
  helperDraftPanel: {
    visible: false,
    type: null
  }
};

// ===== オノノケ縁側システム（Ver.0.5-A）=====

const CHARACTER_REGISTRY = {
  obasan: {
    id: 'obasan',
    name: 'つながろおばちゃん',
    emoji: '👵🏻',
    role: 'decompression',
    description: '審判でも監視でもありません。目的を言う自由と、相手が断る自由のあいだで、空気がもつれた時に入る助け舟です。'
  },
  safety: {
    id: 'safety',
    name: '安全さん',
    emoji: '🦺',
    role: 'boundary',
    description: '警察ではありません。同意、境界線、断る自由、撤退権がちゃんと動いているかを確認する係です。'
  },
  manual: {
    id: 'manual',
    name: 'トリセツくん',
    emoji: '📄',
    role: 'intent_sorting',
    description: '説教係ではありません。恋愛のふりや好意の演技でズレないように、今日の目的と期待値を整理する係です。'
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
    statusVisible: false,
    helpMenuOpen: false
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

// ============================================================
// 待合室フロー定数（Ver.0.6-A）
// ============================================================

const PURPOSE_OPTIONS = [
  {
    id: 'talk',
    label: 'ただ話したい',
    sub: '日常や軽い雑談をしたい',
    okTopics: ['日常', '趣味', '食べ物', '映画', '音楽'],
    ngTopics: ['下ネタ', '説教', '重い詮索', '連絡先交換を急ぐ']
  },
  {
    id: 'friend',
    label: '友達・趣味の話',
    sub: '気の合う人とゆっくり話したい',
    okTopics: ['趣味', '映画', '音楽', '散歩', '好きなもの'],
    ngTopics: ['外見評価', '体型の話', '急な恋愛圧', '連絡先交換を急ぐ']
  },
  {
    id: 'date',
    label: '恋人・パートナー探し',
    sub: '真面目に出会いの可能性を見たい',
    okTopics: ['価値観', '休日', '好きなこと', '会う前の確認'],
    ngTopics: ['急な性的要求', '詰問', '収入マウント', '外見だけの評価']
  },
  {
    id: 'lonely',
    label: '今日はちょっと寂しい',
    sub: 'ただ誰かの気配がほしい',
    okTopics: ['近況', '他愛ない話', '相槌', 'やさしい雑談'],
    ngTopics: ['説教', 'アドバイス強要', 'スペック比較', '急かすこと']
  },
  {
    id: 'short',
    label: '短時間だけ話したい',
    sub: '少しだけ誰かと話したい',
    okTopics: ['軽い話', '食べ物', '今日あったこと', '短い雑談'],
    ngTopics: ['長時間前提', '重い相談', '詰問', '連絡先交換を急ぐ']
  },
  {
    id: 'sex',
    label: 'セックスパートナーを探したい',
    sub: '成人同士・目的一致・断る自由が前提',
    okTopics: ['目的確認', '境界線', '会う条件', '断る自由の確認'],
    ngTopics: ['強要', 'ごまかし', '相手の拒否を無視', '未成年', '同意のない話']
  },
  {
    id: 'undecided',
    label: 'まだ決まっていない',
    sub: 'おばちゃんと一緒に整理したい',
    okTopics: ['目的整理', '軽い雑談', '今の気分'],
    ngTopics: ['急かすこと', '決めつけ', '詰問']
  }
];

const TALK_TIME_OPTIONS = [
  { id: 'five',   label: '5分だけ',    sub: 'ほんの少しだけ', temperature: '軽め' },
  { id: 'ten',    label: '10分くらい', sub: '軽く話す',       temperature: '軽め' },
  { id: 'thirty', label: '30分くらい', sub: 'お茶一杯分',     temperature: '普通' },
  { id: 'slow',   label: 'のんびり',   sub: '急がず話す',     temperature: 'ゆっくり' }
];

// ============================================================
// 待合室フロー関数（Ver.0.6-A）
// ============================================================

// 待合室トップへ
function goToWaitingRoom() {
  state.matching = {
    currentScreen: 'waiting_room',
    purpose: null,
    talkTime: null,
    talkTemperature: null,
    okTopics: [],
    ngTopics: [],
    selectedProfileId: null,
    matchStatus: 'idle'
  };
  state.roomConfig = null;
  goTo('screen-waiting-room');
}

// 目的選択画面へ
function goToSelectPurpose() {
  goTo('screen-select-purpose');
}

// 目的を選択
function selectPurpose(purposeId) {
  const opt = PURPOSE_OPTIONS.find(function(p) { return p.id === purposeId; });
  if (!opt) return;

  if (purposeId === 'sex') {
    // セックスパートナー目的：確認カードを表示
    state.matching.purpose = purposeId;
    goTo('screen-sex-confirm');
    return;
  }

  state.matching.purpose = purposeId;
  state.matching.okTopics = opt.okTopics.slice();
  state.matching.ngTopics = opt.ngTopics.slice();
  goTo('screen-select-time');
}

// sex確認カードで「理解して進む」
function confirmSexPurpose() {
  var opt = PURPOSE_OPTIONS.find(function(p) { return p.id === 'sex'; });
  if (opt) {
    state.matching.okTopics = opt.okTopics.slice();
    state.matching.ngTopics = opt.ngTopics.slice();
  }
  goTo('screen-select-time');
}

// sex確認カードで「別の目的を選ぶ」
function cancelSexPurpose() {
  state.matching.purpose = null;
  goTo('screen-select-purpose');
}

// 話せる時間を選択
function selectTalkTime(talkTimeId) {
  var opt = TALK_TIME_OPTIONS.find(function(t) { return t.id === talkTimeId; });
  if (!opt) return;
  state.matching.talkTime = talkTimeId;
  state.matching.talkTemperature = opt.temperature;
  goTo('screen-obachan-card');
  renderObachanCard();
}

// おばちゃんカードを描画
function renderObachanCard() {
  var purposeOpt = PURPOSE_OPTIONS.find(function(p) { return p.id === state.matching.purpose; });
  var timeOpt    = TALK_TIME_OPTIONS.find(function(t) { return t.id === state.matching.talkTime; });

  var purposeLabel = purposeOpt ? purposeOpt.label : '—';
  var timeLabel    = timeOpt    ? timeOpt.label    : '—';
  var okText  = (state.matching.okTopics  || []).slice(0, 3).join('・') || '—';
  var ngText  = (state.matching.ngTopics  || []).slice(0, 3).join('・') || '—';

  var el = document.getElementById('obachan-card-settings');
  if (el) {
    el.innerHTML =
      '<div class="obachan-setting-row"><span class="obachan-setting-label">今日の目的</span><span class="obachan-setting-value">' + escapeHtml(purposeLabel) + '</span></div>' +
      '<div class="obachan-setting-row"><span class="obachan-setting-label">話せる時間</span><span class="obachan-setting-value">' + escapeHtml(timeLabel) + '</span></div>' +
      '<div class="obachan-setting-row"><span class="obachan-setting-label">OK話題</span><span class="obachan-setting-value">' + escapeHtml(okText) + '</span></div>' +
      '<div class="obachan-setting-row"><span class="obachan-setting-label">NG話題</span><span class="obachan-setting-value">' + escapeHtml(ngText) + '</span></div>';
  }
}

// おばちゃんカードから「この設定で茶の間へ」
function goToMatchWaiting() {
  goTo('screen-match-waiting');
  // 1.2秒後に会話部屋へ
  setTimeout(function() {
    state.matching.matchStatus = 'matched';
    // roomConfig を作成
    state.roomConfig = {
      purpose:         state.matching.purpose,
      talkTime:        state.matching.talkTime,
      talkTemperature: state.matching.talkTemperature,
      okTopics:        state.matching.okTopics.slice(),
      ngTopics:        state.matching.ngTopics.slice()
    };
    enterRoomFromWaitingRoom();
  }, 1200);
}

// 待合室フローから会話部屋へ入室
function enterRoomFromWaitingRoom() {
  var cfg = state.roomConfig;
  if (!cfg) return;

  // roomBoundary を roomConfig から構築
  roomBoundary = {
    strictestRules: {},
    sharedOkTopics: cfg.okTopics.slice(),
    blockedTopics:  cfg.ngTopics.slice(),
    obasanMode:     'on_call',
    emergencyEnabled: true
  };

  // state初期化
  state.roomStarted = true;
  state.obasanInRoom = true;
  state.roomMessages = [];
  state.roomFirstMessageSent = false;
  state.roomCalledObasan = false;
  state.selectedPartnerKey = 'gentle'; // 仮想相手（デフォルト）

  // room / uiState 初期化
  room.mode = 'normal';
  uiState.obasan.summoned = false;
  uiState.obasan.mode = 'idle';
  uiState.obasan.selectedAction = null;
  uiState.obasan.helperMode = null;
  uiState.assistantTeam.activeCharacterId = null;
  uiState.assistantTeam.activeIssueType   = null;
  uiState.assistantTeam.lastCharacterId   = null;
  uiState.assistantTeam.statusVisible     = false;
  uiState.assistantTeam.helpMenuOpen      = false;
  var statusCardEl = document.getElementById('assistant-status-card');
  if (statusCardEl) { statusCardEl.classList.add('hidden'); statusCardEl.innerHTML = ''; }
  var helpMenuRoot = document.getElementById('help-menu-root');
  if (helpMenuRoot) helpMenuRoot.innerHTML = '';
  hideHelperDraftPanel();

  // 画面移動
  goTo('screen-room');

  // DOMリセット
  var container = document.getElementById('chat-container');
  if (container) container.innerHTML = '';
  var choiceList = document.getElementById('room-choice-list');
  if (choiceList) { choiceList.innerHTML = ''; choiceList.classList.add('hidden'); }
  var endArea = document.getElementById('room-end-area');
  if (endArea) endArea.classList.add('hidden');
  var statusBar = document.getElementById('room-status-bar');
  if (statusBar) statusBar.classList.remove('mode-decompressing', 'mode-waiting', 'mode-closing');
  hideAllAmidaPanels();

  // ルーム情報バー更新（roomConfigから）
  updateRoomInfoBarFromConfig();

  // ヘッダータイトル
  var titleEl = document.getElementById('room-header-title');
  if (titleEl) titleEl.textContent = '👵🏻 茶の間';

  // おばちゃんモード表示
  var modeEl = document.getElementById('room-obasan-mode');
  if (modeEl) modeEl.textContent = '困った時だけ助ける';

  // スポンサー表示
  var sponsorEl = document.getElementById('sponsor-bar-room');
  if (sponsorEl) sponsorEl.classList.remove('hidden');

  // 入力欄を非表示（おばちゃんウェルカム待ち）
  var inputArea = document.getElementById('room-input-area');
  if (inputArea) inputArea.classList.add('hidden');
  updateStatusBar('おばちゃんが場を整えています…');

  // テキストエリアリセット
  var textarea = document.getElementById('room-input-textarea');
  if (textarea) { textarea.value = ''; textarea.style.height = ''; }
  state.roomDraftMessage = '';

  // おばちゃんウェルカムメッセージ
  var purposeOpt = PURPOSE_OPTIONS.find(function(p) { return p.id === cfg.purpose; });
  var purposeLabel = purposeOpt ? purposeOpt.label : '話す';
  var okDisplay = cfg.okTopics.slice(0, 3).join('・') || 'なんでも';
  var ngDisplay = cfg.ngTopics.slice(0, 3).join('・') || '特になし';

  addMessage('obasan',
    'ほな、茶の間を用意したよ。\nゆっくりしていきなはれ🍵',
    90
  ).then(function() {
    return addMessage('obasan',
      '今日の目的：' + purposeLabel + '\nOK話題：' + okDisplay + '\nNG話題：' + ngDisplay,
      220
    );
  }).then(function() {
    return addMessage('obasan',
      'ほな、おばちゃんはいったん下がるわ。\n困ったら「👵🏻 助け舟」ボタンを押してな。',
      420
    );
  }).then(function() {
    setRoomUIState(false);
  });
}

// roomConfig から情報バーを更新
function updateRoomInfoBarFromConfig() {
  var cfg = state.roomConfig;
  if (!cfg) return;
  var okEl = document.getElementById('room-ok-topics');
  var ngEl = document.getElementById('room-ng-topics');
  var modeEl = document.getElementById('room-obasan-mode');
  var purposeOpt = PURPOSE_OPTIONS.find(function(p) { return p.id === cfg.purpose; });
  var timeOpt = TALK_TIME_OPTIONS.find(function(t) { return t.id === cfg.talkTime; });
  var okText = (cfg.okTopics || []).slice(0, 2).join('・') || '—';
  var ngText = (cfg.ngTopics || []).slice(0, 2).join('・') || '—';
  if (okEl) okEl.textContent = okText;
  if (ngEl) ngEl.textContent = ngText;
  if (modeEl) {
    var purposeText = purposeOpt ? purposeOpt.label.replace('セックスパートナーを探したい', 'SP目的') : '目的未設定';
    var timeText = timeOpt ? timeOpt.label : '';
    modeEl.textContent = (timeText ? purposeText + ' / ' + timeText : purposeText);
  }
}

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
  setRoomViewportLock(screenId === 'screen-room');
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
  setRoomViewportLock(prev === 'screen-room');
}

// ----- Ver.0.6B-i4: 会話部屋だけページ全体の揺れを抑える -----
function setRoomViewportLock(isRoom) {
  document.body.classList.toggle('room-active', !!isRoom);
  document.documentElement.classList.toggle('room-active', !!isRoom);
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
  uiState.assistantTeam.helpMenuOpen      = false;
  const statusCardEl = document.getElementById('assistant-status-card');
  if (statusCardEl) { statusCardEl.classList.add('hidden'); statusCardEl.innerHTML = ''; }
  // help-menu-rootもリセット
  const helpMenuRoot = document.getElementById('help-menu-root');
  if (helpMenuRoot) helpMenuRoot.innerHTML = '';
  hideHelperDraftPanel();

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
  // あみだパネルリセット
  hideAllAmidaPanels();

  // ルーム情報バー更新
  updateRoomInfoBar();

  // 初期状態：入力欄を非表示（おばちゃんのウェルカムメッセージ完了待ち）
  const inputArea = document.getElementById('room-input-area');
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
      220
    );
  }).then(() => {
    return addMessage('obasan',
      'ほな、おばちゃんはいったん下がるわ。\n困ったら「おばちゃんを呼ぶ」ボタンを押してな。',
      420
    );
  }).then(() => {
    // 相手の最初のメッセージ
    const firstMsg = partner.torisetsu.firstMessages[0];
    return addMessage('partner', firstMsg, 700);
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
      scrollToBottom();
      resolve();
    }, delay || 0);
  });
}

// ----- チャットログを最新メッセージまでスクロール -----
// iPhoneキーボード表示後のレイアウト確定を待ってから呼び出すこと（setTimeout併用）
function scrollToBottom() {
  const container = document.getElementById('chat-container');
  if (!container) return;
  // iPhoneで連続スクロール命令が画面を揺らすため、描画後に1回だけ下へ寄せる
  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
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

  const inputArea   = document.getElementById('room-input-area');
  const choiceList  = document.getElementById('room-choice-list');
  const endArea     = document.getElementById('room-end-area');

  if (obasanIn) {
    if (inputArea) inputArea.classList.add('hidden');
    updateStatusBar('おばちゃんが場を整えています');
  } else {
    if (inputArea) inputArea.classList.remove('hidden');
    updateStatusBar('あとはお二人で');
  }

  if (choiceList) { choiceList.classList.add('hidden'); choiceList.innerHTML = ''; }
  if (endArea) endArea.classList.add('hidden');
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

  setTimeout(scrollToBottom, 50);
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
    // NGワードの場合は入力欄を空にしない（ユーザーが修正できるように）
    return;
  }

  // メッセージ追加成功後だけ入力欄と下書きをクリアする
  addMessage('user', text, 0);
  textarea.value = '';
  state.roomDraftMessage = ''; // 送信成功後だけドラフトをクリア
  // 送信後に最新メッセージへスクロール（レイアウト確定待ち，iPhone Safari対応の二重遅延）
  setTimeout(scrollToBottom, 80);
  setTimeout(scrollToBottom, 180);

  // 初回送信時のみ相手のモック返信
  if (!state.roomFirstMessageSent) {
    state.roomFirstMessageSent = true;
    const partner = partnerPresets[state.selectedPartnerKey];
    if (partner) {
      const reply = partner.torisetsu.firstMessages[1] || 'そうなんですね。';
      setTimeout(() => addMessage('partner', reply, 0), 700);
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

  const inputArea = document.getElementById('room-input-area');
  if (inputArea) inputArea.classList.add('hidden');

  updateStatusBar('👵🏻 おばちゃん介入中');

  // 初動メッセージ（仕様通り）
  addMessage('obasan',
    '呼んでくれてありがとうな。\nちょっとここでお茶でも飲んで、流れをゆるめよか。\n\n今すぐ言葉を探さなくて大丈夫。\nまずは落ち着いてな。\n\nこの中から、今いちばん近いやつを選んでみて。',
    90,
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
  const inputArea = document.getElementById('room-input-area');

  uiState.obasan.selectedAction = actionId;

  if (actionId === 'wait_reply') {
    // ちょっと待って！
    room.mode = 'waiting_reply';
    updateStatusBar('🍵 お茶タイム中');

    addMessage('obasan',
      'ちょっとストップな。\n今、じっくり言葉を選んでるところやから、少しだけ待ったげてな。\n\n急がんでええよ。\n焦らずいこか🍵',
      90,
      { systemGenerated: true, interventionType: 'wait_reply', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      // 入力欄を再表示（言葉を選ぶ時間を与える）
      if (inputArea) inputArea.classList.remove('hidden');
      state.roomCalledObasan = false;
      const container = document.getElementById('chat-container');
      setTimeout(scrollToBottom, 50);
    });

  } else if (actionId === 'change_topic') {
    // 話題をちょっと変える
    room.mode = 'normal';
    updateStatusBar('おばちゃんが場を整えています…');

    addMessage('obasan',
      'ちょっと空気変えよか。\nおばちゃんが軽いお題を置いとくね。\n\n最近食べた美味しいものとか、最近見たものくらいからでええよ。',
      90,
      { systemGenerated: true, interventionType: 'change_topic', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      state.roomCalledObasan = false;
      if (inputArea) inputArea.classList.remove('hidden');
      uiState.obasan.mode = 'idle';
      const container = document.getElementById('chat-container');
      setTimeout(scrollToBottom, 50);
    });

  } else if (actionId === 'obasan_join') {
    // おばちゃん、間に入って
    room.mode = 'decompressing';
    uiState.obasan.mode = 'decompressing';
    updateStatusBar('👵🏻 おばちゃん介入中');

    addMessage('obasan',
      '了解や。\nここから少し、おばちゃんも一緒におるね。\n\n二人のトリセツを見ながら、ちょうどええ距離感で話せるように、間を持つわ。',
      90,
      { systemGenerated: true, interventionType: 'obasan_join', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      state.roomCalledObasan = false;
      if (inputArea) inputArea.classList.remove('hidden');
      const container = document.getElementById('chat-container');
      setTimeout(scrollToBottom, 50);
    });

  } else if (actionId === 'close_today') {
    // 今日はここまでにする
    room.mode = 'closing';
    uiState.obasan.selectedAction = 'close_today';
    updateStatusBar('今日はここまで');

    addMessage('obasan',
      'よし、今日のおしゃべりはここまでにしよか。\n二人ともお疲れさん。\n\n目的やノリがちょっと違っただけやから、誰も悪うないで。\nおばちゃんがこの部屋、やわらかく閉じておくね。\n\nこのあと、ふりかえり部屋で次回の作戦会議しよか。',
      90,
      { systemGenerated: true, interventionType: 'close_today', boundaryFlag: null, relatedToMessageId: null }
    ).then(() => {
      if (inputArea) inputArea.classList.add('hidden');
      const endArea = document.getElementById('room-end-area');
      if (endArea) endArea.classList.remove('hidden');
      const container = document.getElementById('chat-container');
      setTimeout(scrollToBottom, 50);
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

  if (!uiState.assistantTeam.statusVisible) {
    card.classList.add('hidden');
    return;
  }

  const issueType = uiState.assistantTeam.activeIssueType;
  const copy = ISSUE_STATUS_COPY[issueType];
  if (!copy) {
    card.classList.add('hidden');
    return;
  }

  // スリムバー形式：1行表示 + 解除ボタン
  card.setAttribute('data-issue', issueType);
  card.className = 'assistant-status-bar';
  card.innerHTML =
    '<span class="status-bar-label">' + escapeHtml(copy.label) + '</span>' +
    '<span class="status-bar-desc">' + escapeHtml(copy.description) + '</span>' +
    '<button class="status-bar-release" type="button" onclick="releaseIssueStatus()">✕</button>';

  card.classList.remove('hidden');
}

// ----- 状態を解除して通常モードに戻す -----
function releaseIssueStatus() {
  uiState.assistantTeam.statusVisible    = false;
  uiState.assistantTeam.activeIssueType  = null;
  uiState.assistantTeam.activeCharacterId = null;
  room.mode = 'normal';

  const card = document.getElementById('assistant-status-card');
  if (card) { card.classList.add('hidden'); card.innerHTML = ''; }

  updateStatusBar('あとはお二人で');
}

// ----- 別の助け舟を選ぶ（ステータスをリセットしてボトムシートを開く）-----
function changeIssueStatus() {
  uiState.assistantTeam.statusVisible    = false;
  uiState.assistantTeam.activeIssueType  = null;
  uiState.assistantTeam.activeCharacterId = null;
  uiState.assistantTeam.helpMenuOpen     = true;
  room.mode = 'normal';

  const card = document.getElementById('assistant-status-card');
  if (card) { card.classList.add('hidden'); card.innerHTML = ''; }

  updateStatusBar('あとはお二人で');
  renderHelpMenu();
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

  const inputArea  = document.getElementById('room-input-area');

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
        const endArea = document.getElementById('room-end-area');
        if (endArea) endArea.classList.remove('hidden');
      } else {
        // その他は入力欄を再表示。状態バーが主役
        if (inputArea) inputArea.classList.remove('hidden');
      }
    const container = document.getElementById('chat-container');
    setTimeout(scrollToBottom, 50);
  });
}

// ============================================================
// 迷ったら整理棚 ・ おばちゃんあみだ（Ver.0.4-A）
// ============================================================

// ----- 助け舟候補文パネル（Ver.0.6B）-----
function getHelperDraftCandidates(type) {
  if (type === 'goal') {
    return [buildHelperGoalSummary()];
  }
  return HELPER_DRAFT_OPTIONS[type] || [];
}

function buildHelperGoalSummary() {
  const cfg = state.roomConfig;

  if (cfg) {
    const purposeOpt = PURPOSE_OPTIONS.find(p => p.id === cfg.purpose);
    const purposeLabel = purposeOpt ? purposeOpt.label : (cfg.purpose || '未設定');
    const timeOpt = TALK_TIME_OPTIONS.find(t => t.id === cfg.talkTime);
    const timeLabel = timeOpt ? timeOpt.label : (cfg.talkTime || '未設定');
    const okText = (cfg.okTopics || []).slice(0, 2).join('・') || 'なんでも';
    const ngText = (cfg.ngTopics || []).slice(0, 2).join('・') || '特になし';

    return '目的：' + purposeLabel + '\n時間：' + timeLabel + '\nOK：' + okText + ' / NG：' + ngText;
  }

  // v0.6B-i2: 旧来の「相手を選ぶ」ルートでは roomConfig が無いので、
  // 画面上の情報バーから短く復元する。
  const titleEl = document.getElementById('room-header-title');
  const okEl = document.getElementById('room-ok-topics');
  const ngEl = document.getElementById('room-ng-topics');
  const modeEl = document.getElementById('room-obasan-mode');

  let roomTitle = titleEl ? titleEl.textContent.replace(/^[^\w\u3040-\u30ff\u3400-\u9fff]+/, '').replace('との部屋', '').trim() : '';
  const okText = okEl ? okEl.textContent.trim() : '';
  const ngText = ngEl ? ngEl.textContent.trim() : '';
  const modeText = modeEl ? modeEl.textContent.trim() : '';

  const lines = [];
  if (roomTitle) lines.push('部屋：' + roomTitle);
  if (modeText && modeText !== '見守り中') lines.push('設定：' + modeText);
  if (okText || ngText) lines.push('OK：' + (okText || '—') + ' / NG：' + (ngText || '—'));

  return lines.join('\n') || '部屋の設定はまだありません。';
}

function showHelperDraftPanel(type) {
  uiState.assistantTeam.helpMenuOpen = false;
  state.helperDraftPanel.visible = true;
  state.helperDraftPanel.type = type;
  renderHelpMenu();
  renderHelperDraftPanel();
}

function hideHelperDraftPanel() {
  state.helperDraftPanel.visible = false;
  state.helperDraftPanel.type = null;
  const existing = document.getElementById('helper-draft-panel');
  if (existing) existing.remove();
}

function insertHelperDraftCandidate(index) {
  const type = state.helperDraftPanel.type;
  const candidates = getHelperDraftCandidates(type);
  const text = candidates[index];
  if (!text || type === 'goal') return;

  const textarea = document.getElementById('room-input-textarea');
  if (!textarea) return;

  textarea.value = text;
  state.roomDraftMessage = text;
  textarea.style.height = 'auto';
  const maxH = 72;
  textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';

  hideHelperDraftPanel();

  requestAnimationFrame(() => {
    textarea.focus();
    const len = textarea.value.length;
    textarea.setSelectionRange(len, len);
  });
}

function renderHelperDraftPanel() {
  const inputArea = document.getElementById('room-input-area');
  if (!inputArea) return;

  let panel = document.getElementById('helper-draft-panel');
  if (!state.helperDraftPanel.visible || !state.helperDraftPanel.type) {
    if (panel) panel.remove();
    return;
  }

  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'helper-draft-panel';
    panel.className = 'helper-draft-panel';
    inputArea.insertBefore(panel, inputArea.firstChild);
  }

  const type = state.helperDraftPanel.type;
  const candidates = getHelperDraftCandidates(type);
  const labelMap = {
    topic: '👵🏻 話題候補',
    wait: '👵🏻 待って文',
    goal: '📄 今日の目的',
    close: '👵🏻 閉店文'
  };

  panel.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'helper-draft-head';
  const title = document.createElement('span');
  title.textContent = labelMap[type] || '👵🏻 候補';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'helper-draft-close';
  closeBtn.textContent = 'もどる';
  closeBtn.addEventListener('click', hideHelperDraftPanel);
  head.appendChild(title);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  if (type === 'goal') {
    const summary = document.createElement('div');
    summary.className = 'helper-draft-summary';
    summary.textContent = candidates[0] || '目的：未設定';
    panel.appendChild(summary);
    return;
  }

  const list = document.createElement('div');
  list.className = 'helper-draft-candidates';
  candidates.forEach((text, index) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'helper-draft-candidate';
    btn.dataset.index = String(index);
    btn.textContent = text;
    btn.addEventListener('click', () => insertHelperDraftCandidate(index));
    list.appendChild(btn);
  });
  panel.appendChild(list);
}

// ----- 助け舟ボトムシート（Ver.0.5-B）-----
function toggleHelpMenu() {
  uiState.assistantTeam.helpMenuOpen = !uiState.assistantTeam.helpMenuOpen;
  renderHelpMenu();
}

function closeHelpMenu() {
  if (!uiState.assistantTeam.helpMenuOpen) return;
  uiState.assistantTeam.helpMenuOpen = false;
  renderHelpMenu();
}

function handleHelpIssue(issueType) {
  closeHelpMenu();
  handleIssueButtonClick(issueType);
}

function handleOpenChoiceShelf() {
  closeHelpMenu();
  startHelperAction('light_lottery');
}

function renderHelpMenu() {
  const root = document.getElementById('help-menu-root');
  if (!root) return;

  if (!uiState.assistantTeam.helpMenuOpen) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML =
    '<div class="help-menu-backdrop" onclick="closeHelpMenu()"></div>' +
    '<div class="help-menu-panel help-menu-panel-v06b">' +
      '<div class="help-menu-handle"></div>' +
      '<div class="help-menu-title">👵🏻 助け舟</div>' +
      '<p class="help-menu-microcopy">👵🏻 次の一手だけ選んでな。</p>' +
      '<div class="help-menu-grid-v06b">' +
        '<button type="button" class="help-menu-item help-menu-item-back" onclick="closeHelpMenu()">もどる</button>' +
        '<button type="button" class="help-menu-item" onclick="showHelperDraftPanel(&#39;topic&#39;)">話題かえる</button>' +
        '<button type="button" class="help-menu-item" onclick="showHelperDraftPanel(&#39;wait&#39;)">ちょっと待って</button>' +
        '<button type="button" class="help-menu-item" onclick="showHelperDraftPanel(&#39;goal&#39;)">目的みる</button>' +
        '<button type="button" class="help-menu-item" onclick="showHelperDraftPanel(&#39;close&#39;)">今日はここで</button>' +
      '</div>' +
    '</div>';
}

// ----- レガシー：helper-menu-panel用（互換性のため残存）-----
function toggleHelperMenu() {
  uiState.assistantTeam.helpMenuOpen = !uiState.assistantTeam.helpMenuOpen;
  renderHelpMenu();
}

function closeHelperMenu() {
  uiState.assistantTeam.helpMenuOpen = false;
  renderHelpMenu();
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
      90,
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
      90,
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
    90,
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
    setTimeout(scrollToBottom, 50);
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
    90,
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
  const resultText = `あみだ完了や！\n\n結果は……「${result.label}」になったで。\n\nただし、これは最終決定やないからな。\n結果を見て「やっぱり違うかも」と思ったら、それも大事な本音やで。\n\n参考くらいにして、最後は自分で選んでええよ🍵`;

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
        setTimeout(scrollToBottom, 50);
      };
      list.appendChild(retryBtn);
      list.appendChild(okBtn);
    }
    const container = document.getElementById('chat-container');
    setTimeout(scrollToBottom, 50);
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
  setTimeout(scrollToBottom, 50);
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

  // ============================================================
  // iPhone入力バグ修正（Ver.0.5-B）
  // compositionstart/end で日本語変換中を管理
  // Enterキーで送信しない（送信ボタンのみ送信）
  // ============================================================

  let isComposing = false;

  // 入力欄のイベントは startVirtualRoom 実行後に登録する必要があるため
  // 入力欄が存在する場合は即座に登録、ない場合は MutationObserver で監視
  function setupInputEvents() {
    const textarea = document.getElementById('room-input-textarea');
    if (!textarea || textarea._iPhoneEventsAttached) return;
    textarea._iPhoneEventsAttached = true;

    // 日本語変換中フラグ（IME対策：Ver.0.6-A-i2）
    textarea.addEventListener('compositionstart', () => {
      isComposing = true;
      state.isComposingMessage = true;
    });
    textarea.addEventListener('compositionend', () => {
      isComposing = false;
      state.isComposingMessage = false;
      // iOSではcompositionend直後にvalue反映が遅れる場合があるため、0遅延で保存
      setTimeout(() => {
        state.roomDraftMessage = textarea.value;
      }, 0);
    });

    // 入力イベント：入力のたびに下書きを保存（Ver.0.5-C）＋auto-grow最大3行（Ver.0.5-D）
    textarea.addEventListener('input', () => {
      state.roomDraftMessage = textarea.value;
      // auto-grow: 最大3行（72px）まで自動拡張
      textarea.style.height = 'auto';
      const maxH = 72; // 約3行
      textarea.style.height = Math.min(textarea.scrollHeight, maxH) + 'px';
    });

    // Enterキー処理：変換中またはスマホでは送信しない（IME対策：Ver.0.6-A-i2）
    textarea.addEventListener('keydown', (e) => {
      const composing =
        isComposing ||
        state.isComposingMessage ||
        e.isComposing ||
        e.keyCode === 229;

      if (composing) {
        // 日本語変換中のEnter/確定はIMEに任せる。送信・preventDefault・renderはしない。
        return;
      }

      if (e.key === 'Enter') {
        // スマホ判定：タッチデバイス or UAで判定
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
          || (navigator.maxTouchPoints > 1);
        if (isMobile) {
          // スマホではEnterを改行または変換確定として扱う（送信しない）
          return;
        }
        // PCでShift+Enterは改行
        if (e.shiftKey) return;
        // PCでEnterは送信
        e.preventDefault();
        sendMyMessage();
      }
    });

    // ============================================================
    // キーボード表示時の画面整理（iPhone向け）
    // focus時：body.keyboard-activeを付与→CSSでボタン群を非表示
    // blur時：body.keyboard-activeを除去→ボタン群を復元
    // ============================================================
    textarea.addEventListener('focus', () => {
      document.body.classList.add('keyboard-active');
      // 入力中は助け舟メニューを閉じる
      closeHelpMenu();
      // 入力欄が空なら下書きから復元（Ver.0.5-C）
      if (!textarea.value && state.roomDraftMessage) {
        textarea.value = state.roomDraftMessage;
      }
      // キーボード表示後のレイアウト確定を待ってから最新メッセージへスクロール
      setTimeout(scrollToBottom, 80);
    });

    // blur：下書き保存 + keyboard-active除去（Ver.0.5-C統合版）
    textarea.addEventListener('blur', () => {
      // 下書きを保存（フォーカスが外れても文字を消さない）
      state.roomDraftMessage = textarea.value;
      // 少し遅延して解除（送信ボタンタップ時にボタンが非表示になるのを防ぐ）
      setTimeout(() => {
        document.body.classList.remove('keyboard-active');
      }, 200);
    });
  }

  // 初期試行（入力欄がすでにある場合）
  setupInputEvents();

  // 入力欄が後からDOMに追加される場合に対応
  const observer = new MutationObserver(() => {
    setupInputEvents();
  });
  const appEl = document.getElementById('app');
  if (appEl) {
    observer.observe(appEl, { childList: true, subtree: true });
  }
});
