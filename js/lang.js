/* 結果画面などの共通ボタンの読み上げ名 */
const LABELS = { "もう一度": ["Retry", "다시 하기", "再来一次", "再來一次"] };

export default class Lang {
  /**
   * @param {Window} [win=window]
   * @param {{ apply?: boolean }} [options] apply=false で <html lang> とラベルの書き換えを行わない
   */
  constructor({ apply = true } = {}) {
    this.full = this.detect();
    this.lang = this.full === "ja" ? "ja" : "en";
    if (apply) this.apply();
  }

  static pick(search) {
    const m = /[?&]lang=(ja|en|ko|zh|tw)\b/.exec(search || "");
    return m ? m[1] : null;
  }

  detect() {
    const win = window;
    const own = Lang.pick(win.location.search);
    if (own) return own;

    try {
      if (win.parent && win.parent !== win) {
        const loc = win.parent.location;
        const fromParent = Lang.pick(loc.search) || Lang.pick(loc.hash.slice(loc.hash.indexOf("?")));
        if (fromParent) return fromParent;
      }
    } catch { }

    try {
      const saved = win.localStorage.getItem("zLang");
      if (/^(ja|en|ko|zh|tw)$/.test(saved)) return saved;
    } catch { }

    const n = win.navigator || {};
    /* 検索エンジンのロボットは英語設定で来るので、日本語で読ませる */
    if (/bot|crawl|spider|slurp|Google-InspectionTool|Lighthouse/i.test(n.userAgent || "")) return "ja";

    const first = (n.languages && n.languages[0]) || n.language || "ja";
    if (/^ja\b/i.test(first)) return "ja";
    if (/^ko\b/i.test(first)) return "ko";
    if (/^zh\b/i.test(first)) return /^zh-(tw|hk|mo|hant)\b/i.test(first) ? "tw" : "zh";
    return "en";
  }

  /** 今の言語の文字を返す（繁体字が無ければ簡体字、どれも無ければ英語） */
  t(ja, en, ko, zh, tw) {
    const full = this.full;
    if (full === "ko" && ko != null) return ko;
    if (full === "tw" && tw != null) return tw;
    if ((full === "zh" || full === "tw") && zh != null) return zh;
    return this.lang === "ja" || en == null ? ja : en;
  }

  /** 切り替えて覚える（読み込み直す） */
  setLang(next) {
    const win = window;
    try { win.localStorage.setItem("zLang", next); } catch { }

    /* サイトの中で開いたゲームからは、サイトごと切り替える */
    try {
      if (win.parent && win.parent !== win && win.parent.zSetLang) {
        win.parent.zSetLang(next);
        return;
      }
    } catch { }

    /* URL の指定が残っていると切り替わらないので外す */
    const url = new URL(win.location.href);
    url.searchParams.delete("lang");
    const hash = url.hash.replace(/([?&])lang=(ja|en|ko|zh|tw)&?/, "$1").replace(/[?&]$/, "");
    try { win.history.replaceState(null, "", url.pathname + url.search + hash); } catch { }
    win.location.reload();
  }

  /** <html lang> を合わせ、共通ボタンの aria-label を翻訳する */
  apply() {
    const doc = window.document;
    if (!doc) return;

    if (doc.documentElement) {
      doc.documentElement.lang = this.full === "zh" ? "zh-CN" : this.full === "tw" ? "zh-TW" : this.full;
    }

    if (this.lang === "en") {
      if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => this.translateLabels());
      else this.translateLabels();
    }
  }

  translateLabels() {
    window.document.querySelectorAll("[aria-label]").forEach((el) => {
      const t = LABELS[el.getAttribute("aria-label")];
      if (t) el.setAttribute("aria-label", this.t(null, t[0], t[1], t[2], t[3]));
    });
  }

  /** 従来のグローバル API（zLang, zLangFull, zSetLang, zT）を生やす */
  static install(win = window) {
    const inst = new Lang(win);
    win.zLang = inst.lang;
    win.zLangFull = inst.full;
    win.zSetLang = (next) => inst.setLang(next);
    win.zT = (ja, en, ko, zh, tw) => inst.t(ja, en, ko, zh, tw);
    return inst;
  }
}