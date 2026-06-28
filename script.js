const DRAFT_KEY = "hiderockTemplateDraftV1";
let lastGeneratedOutput = "";
let saveDraftTimer = null;

const FIELD_IDS = [
  "input-material",
  "step-pick",
  "step-name",
  "step-layer",
  "step-translate",
  "step-method",
  "crew-context",
  "crew-kufu",
  "crew-marx",
  "crew-merchant",
  "crew-reality",
  "crew-sleepy",
  "crew-fraud",
  "crew-competition",
  "crew-hiderock",
  "final-decision",
  "next-action",
  "not-do"
];

const LINE_IDS = [
  "line-basic5",
  "line-theater",
  "line-translate",
  "line-next",
  "line-notdo"
];

function getValue(id) {
  const el = document.getElementById(id);
  if (!el) return "";
  return (el.value || "").trim();
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.value = value || "";
}

function getDestinationValue() {
  const checked = document.querySelector('input[name="factory-destination"]:checked');
  return checked ? checked.value : "method";
}

function setDestinationValue(value) {
  const target = document.querySelector(`input[name="factory-destination"][value="${value || "method"}"]`);
  if (target) target.checked = true;
}

function getSelectedLines() {
  return LINE_IDS.filter(id => {
    const el = document.getElementById(id);
    return el && el.checked;
  });
}

function setSelectedLines(lines) {
  const selected = Array.isArray(lines) ? lines : ["line-basic5", "line-theater", "line-translate", "line-next", "line-notdo"];
  LINE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = selected.includes(id);
  });
}

function canUseLocalStorage() {
  try {
    const testKey = "__hiderock_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
}

function collectDraft() {
  const outputBox = document.getElementById("output-text");
  const draft = {
    version: "v1",
    appVersion: "v0.4A",
    updatedAt: new Date().toISOString(),
    fields: {},
    destination: getDestinationValue(),
    selectedLines: getSelectedLines(),
    outputText: outputBox ? outputBox.textContent || "" : "",
    lastGeneratedOutput: lastGeneratedOutput || ""
  };

  FIELD_IDS.forEach(id => {
    draft.fields[id] = getValue(id);
  });

  return draft;
}

function saveDraftNow() {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
  } catch (e) {
    console.warn("Draft save failed:", e);
  }
}

function scheduleSaveDraft() {
  clearTimeout(saveDraftTimer);
  saveDraftTimer = setTimeout(saveDraftNow, 300);
}

function loadDraft() {
  if (!canUseLocalStorage()) return false;

  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;

    const draft = JSON.parse(raw);
    if (!draft) return false;

    if (draft.fields) {
      FIELD_IDS.forEach(id => {
        if (Object.prototype.hasOwnProperty.call(draft.fields, id)) {
          setValue(id, draft.fields[id]);
        }
      });
    }

    if (draft.destination) setDestinationValue(draft.destination);
    if (draft.selectedLines) setSelectedLines(draft.selectedLines);

    const outputBox = document.getElementById("output-text");
    if (outputBox && draft.outputText) outputBox.textContent = draft.outputText;

    lastGeneratedOutput = draft.lastGeneratedOutput || draft.outputText || "";
    return true;
  } catch (e) {
    console.warn("Draft load failed:", e);
    return false;
  }
}

function clearDraft() {
  const ok = window.confirm("台帳を空にしますか？\nこの端末に保存された入力途中の内容も消えます。");
  if (!ok) return;

  FIELD_IDS.forEach(id => setValue(id, ""));
  setDestinationValue("method");
  setSelectedLines(["line-basic5", "line-theater", "line-translate", "line-next", "line-notdo"]);

  const outputBox = document.getElementById("output-text");
  if (outputBox) outputBox.textContent = "";
  lastGeneratedOutput = "";

  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch (e) {
    console.warn("Draft clear failed:", e);
  }

  showToast("台帳を空にしました。");
}

function attachDraftListeners() {
  FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", scheduleSaveDraft);
    el.addEventListener("change", scheduleSaveDraft);
  });

  document.querySelectorAll('input[name="factory-destination"]').forEach(el => {
    el.addEventListener("change", scheduleSaveDraft);
  });

  LINE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", scheduleSaveDraft);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) saveDraftNow();
  });

  window.addEventListener("pagehide", saveDraftNow);
}

function destinationText(value) {
  const map = {
    method: "方法©️化：素材を再利用できる工程パッケージとして整理する。",
    note: "note記事化：読み物として、導入・本文・締めに整理する。",
    ai_request: "AI依頼文化：別のAIに渡せる依頼文として整理する。",
    spec: "アプリ仕様化：GitHub Pages向けの画面・機能・実装順に整理する。",
    rodo: "ロードー判断：今日動かすか、保留するか、条件を分けて判断する。",
    hospital: "病院説明：医師や支援者に伝わる地上語として整理する。",
    creative: "創作ネタ化：キャラ・寸劇・記事・アプリ案に展開できる素材として整理する。"
  };
  return map[value] || map.method;
}

function selectedLineLabels() {
  const map = {
    "line-basic5": "基本5工程",
    "line-theater": "劇団員チェック",
    "line-translate": "地上語翻訳",
    "line-next": "次の一手",
    "line-notdo": "やらないこと"
  };

  return getSelectedLines().map(id => map[id]).filter(Boolean);
}

function buildFactoryPrompt() {
  const material = getValue("input-material");
  const destination = getDestinationValue();
  const selected = getSelectedLines();
  const selectedLabels = selectedLineLabels();

  const parts = [];

  parts.push("以下の素材を、ヒデロックテンプレ法©️で処理してください。");
  parts.push("これは『素材投入型マニュファクチュア工場©️』です。ユーザーは素材を出し、加工工程はAIが担当します。");
  parts.push("");

  parts.push("【素材】");
  parts.push(material || "（素材未入力：まず一行だけ置いてください）");
  parts.push("");

  parts.push("【加工先】");
  parts.push(destinationText(destination));
  parts.push("");

  parts.push("【使用する工場ライン】");
  parts.push(selectedLabels.length ? selectedLabels.map(label => `- ${label}`).join("\n") : "（未選択：必要に応じて最小工程で処理してください）");
  parts.push("");

  if (selected.includes("line-basic5")) {
    parts.push("【基本5工程】");
    parts.push("次の順番で短く整理してください。");
    parts.push("1. 拾う：素材の中で引っかかる部分を拾う。");
    parts.push("2. 名前をつける：呼べるラベル・技名・方法©️名を仮で置く。");
    parts.push("3. レイヤー分解：身体 / 現実 / 創作 / 仕事 / AI / 社会語などに分ける。");
    parts.push("4. 地上語へ翻訳：他人やAIに渡せる言葉へ直す。");
    parts.push("5. 方法©️化：次回も使える工程として保存できる形にする。");
    parts.push("");
  }

  if (selected.includes("line-theater")) {
    parts.push("【劇団員チェック】");
    parts.push("必要に応じて、ヒデロック劇団の担当を呼び出してください。");
    parts.push("- 🚧 現実君：今日、小さく動かせるかを見る。");
    parts.push("- 👨🏻‍🔧 だからなんだくん：過剰な意味づけを一回ほどく。");
    parts.push("- 👨‍⚕️ メンタルつよし先生：責めるくんが出た時に中和する。");
    parts.push("- 👔 普通くん：常識圧を検出する。");
    parts.push("- 🐰 ねむうさ品質管理課：低出力日でも壊れない形にする。");
    parts.push("- 🎩 Hiderock Japan：出荷 / 保留 / 棚戻し / 今はやらない を判断する。");
    parts.push("");
  }

  if (selected.includes("line-translate")) {
    parts.push("【地上語翻訳】");
    parts.push("抽象語・ヒデロック語・劇団語を、必要に応じて地上の人間語へ翻訳してください。");
    parts.push("ただし、独自語を消しすぎず、横に小さな説明を添える形にしてください。");
    parts.push("");
  }

  if (selected.includes("line-next")) {
    parts.push("【次の一手】");
    parts.push("今すぐ動かせる小さい一手を1〜3個に絞ってください。大きなロードマップにしすぎないでください。");
    parts.push("");
  }

  if (selected.includes("line-notdo")) {
    parts.push("【やらないこと】");
    parts.push("今回やらなくていいこと、今は広げないこと、後回しにしてよいことを分けてください。");
    parts.push("");
  }

  parts.push("【出力形式】");
  parts.push("見出しつきで、短く、実行しやすい形にしてください。断定しすぎず、仮説と判断を分けてください。");

  const prompt = parts.join("\n").trim();
  const outputBox = document.getElementById("output-text");
  if (outputBox) outputBox.textContent = prompt;

  lastGeneratedOutput = prompt;
  saveDraftNow();
  return prompt;
}

/* 旧手動台帳モードの関数。v0.4Aでは非表示だが、後方互換として残す。 */
function getFormValues() {
  const crewItems = [
    ["✍️ 文脈翻訳者", getValue("crew-context")],
    ["👨🏻‍🔧 工夫さん", getValue("crew-kufu")],
    ["⚖️ マルクスAI", getValue("crew-marx")],
    ["💰 商人AI", getValue("crew-merchant")],
    ["🚧 現実君", getValue("crew-reality")],
    ["🐰 ねむうさ品質管理課", getValue("crew-sleepy")],
    ["👵🏻🔍 詐欺見抜き婆さん", getValue("crew-fraud")],
    ["🦅 競争手を見る鷹", getValue("crew-competition")],
    ["🎩 Hiderock Japan", getValue("crew-hiderock")]
  ];

  return {
    material: getValue("input-material"),
    stepPick: getValue("step-pick"),
    stepName: getValue("step-name"),
    stepLayer: getValue("step-layer"),
    stepTranslate: getValue("step-translate"),
    stepMethod: getValue("step-method"),
    crewItems,
    finalDecision: getValue("final-decision"),
    nextAction: getValue("next-action"),
    notDo: getValue("not-do")
  };
}

function addSection(lines, label, value, options = {}) {
  const { required = false, placeholder = "（未入力）", skipEmpty = false } = options;
  if (!required && skipEmpty && !value) return;
  lines.push(`【${label}】`);
  lines.push(value || placeholder);
  lines.push("");
}

function buildCrewText(crewItems, skipEmpty) {
  return crewItems
    .filter(([, value]) => !skipEmpty || value)
    .map(([name, value]) => `${name}：${value || "（未入力）"}`)
    .join("\n");
}

function buildOutput(mode = "quick") {
  const values = getFormValues();
  const skipEmpty = mode === "quick";
  const lines = [];

  if (mode === "quick") {
    lines.push("以下の素材を、ヒデロックテンプレ法©️で軽く処理してください。");
    lines.push("未入力部分は、断定せず、必要に応じて候補として補ってください。");
    lines.push("");
  }

  addSection(lines, "素材", values.material, { required: true, placeholder: "（素材未入力：まず一行だけ置いてください）" });
  addSection(lines, "拾う", values.stepPick, { skipEmpty });
  addSection(lines, "名前", values.stepName, { skipEmpty });
  addSection(lines, "レイヤー分解", values.stepLayer, { skipEmpty });
  addSection(lines, "地上語への翻訳", values.stepTranslate, { skipEmpty });
  addSection(lines, "方法©️化", values.stepMethod, { skipEmpty });

  const crewText = buildCrewText(values.crewItems, skipEmpty);
  addSection(lines, "劇団員チェック", crewText, { skipEmpty });
  addSection(lines, "最終判定", values.finalDecision, { skipEmpty, placeholder: mode === "full" ? "（未選択）" : "" });
  addSection(lines, "次の一手", values.nextAction, { skipEmpty });
  addSection(lines, "やらないこと", values.notDo, { skipEmpty });

  const outputText = lines.join("\n").trim();
  const outputBox = document.getElementById("output-text");
  if (outputBox) outputBox.textContent = outputText;

  lastGeneratedOutput = outputText;
  saveDraftNow();
  return outputText;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

document.addEventListener("DOMContentLoaded", () => {
  const outputBox = document.getElementById("output-text");
  const flowButton = document.getElementById("flow-to-factory-button");
  const copyButton = document.getElementById("copy-button");
  const clearDraftButton = document.getElementById("clear-draft-button");
  const quickButton = document.getElementById("generate-quick-button");
  const fullButton = document.getElementById("generate-full-button");

  const restored = loadDraft();
  attachDraftListeners();

  if (restored) {
    showToast("前回の台帳を復元しました。");
  }

  if (flowButton) {
    flowButton.addEventListener("click", () => {
      buildFactoryPrompt();
      showToast("劇団工場に流しました。");
    });
  }

  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const text = lastGeneratedOutput || (outputBox && outputBox.textContent.trim()) || buildFactoryPrompt();
      try {
        await navigator.clipboard.writeText(text);
        if (outputBox) outputBox.textContent = text;
        saveDraftNow();
        showToast("コピーしました。AIに貼り付けて使えます。");
      } catch (e) {
        if (outputBox) outputBox.textContent = text;
        saveDraftNow();
        showToast("コピーに失敗しました。手動で選択してコピーしてください。");
      }
    });
  }

  if (clearDraftButton) {
    clearDraftButton.addEventListener("click", clearDraft);
  }

  if (quickButton) {
    quickButton.addEventListener("click", () => {
      buildOutput("quick");
      showToast("素材ワンパン生成しました。");
    });
  }

  if (fullButton) {
    fullButton.addEventListener("click", () => {
      buildOutput("full");
      showToast("全部入り生成しました。");
    });
  }
});
