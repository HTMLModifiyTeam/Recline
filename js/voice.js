const ROWS = {
  "": "あいうえお", k: "かきくけこ", s: "さしすせそ", t: "たちつてと", n: "なにぬねの", h: "はひふへほ",
  m: "まみむめも", y: "や ゆ よ", r: "らりるれろ", w: "わ   を", g: "がぎぐげご", z: "ざじずぜぞ",
  d: "だぢづでど", b: "ばびぶべぼ", p: "ぱぴぷぺぽ"
};

/* 母音ごとの第1〜第3フォルマント（Hz）。n は「ん」 */
const VOWELS = {
  a: [800, 1200, 2600],
  i: [300, 2300, 3000],
  u: [350, 1300, 2400],
  e: [500, 1900, 2600],
  o: [500, 850, 2500],
  n: [250, 1000, 2200]
};

const SMALL = { "ゃ": "a", "ゅ": "u", "ょ": "o", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o" };

/* かな → [子音, 母音] */
const TABLE = {};
Object.keys(ROWS).forEach((c) => {
  for (let i = 0; i < 5; i++) if (ROWS[c][i] !== " ") TABLE[ROWS[c][i]] = [c, "aiueo"[i]];
});
/* 音の近いものに寄せる（子音の作り分けは大まか） */
TABLE["し"] = ["sh", "i"]; TABLE["ち"] = ["ch", "i"]; TABLE["つ"] = ["ch", "u"];
TABLE["じ"] = ["j", "i"]; TABLE["ぢ"] = ["j", "i"]; TABLE["づ"] = ["z", "u"]; TABLE["ふ"] = ["h", "u"];
TABLE["ゐ"] = ["", "i"]; TABLE["ゑ"] = ["", "e"]; TABLE["ゔ"] = ["b", "u"];

/* 子音の作り方。
   len   : 母音に入るまでの長さ（秒）
   env   : 声帯の音量を [目標, 時定数] に（0.0001 は止める）
   hiss  : ノイズの音 [開始のずれ, 長さ, 中心周波数, Q, 音量] のリスト
   nasal : 口を閉じて鼻に抜ける。フォルマントをこの3つにする */
const SILENT = 0.0001;
const fricative = (freq, q, vol, len = 0.07) => ({ len, env: [SILENT, 0.008], hiss: [[0, len, freq, q, vol]] });
const stop = (freq, vol) => ({ len: 0.03, env: [SILENT, 0.005], hiss: [[0.015, 0.02, freq, 0.8, vol]] });
const CONSONANTS = {
  s: fricative(6500, 2, 0.55),
  sh: fricative(3400, 1.5, 0.55),
  ch: { len: 0.05, env: [SILENT, 0.008], hiss: [[0, 0.012, 3000, 0.8, 0.5], [0, 0.05, 3400, 1.5, 0.55]] },
  g: stop(1500, 0.3),
  d: stop(3500, 0.3),
  t: stop(3500, 0.5),
  k: stop(3500, 0.3),
  p: stop(700, 0.3),
  b: stop(700, 0.3),
  m: { len: 0.05, env: [0.35, 0.01], nasal: [250, 1000, 2200] },
  n: { len: 0.05, env: [0.35, 0.01], nasal: [250, 1400, 2200] },
  h: { len: 0.05, env: [SILENT, 0.008], hiss: [[0, 0.05, 1800, 0.6, 0.35]] },
  z: { len: 0.05, env: [0.2, 0.008], hiss: [[0, 0.05, 5500, 1.5, 0.35]] },
  j: { len: 0.05, env: [0.2, 0.008], hiss: [[0, 0.05, 3200, 1.5, 0.35]] }
};

/* AudioContext ごとにノイズを1つだけ作って使い回す（使われなくなれば一緒に捨てられる） */
const noiseBufs = new WeakMap();
function noiseOf(ac) {
  let buf = noiseBufs.get(ac);
  if (!buf) {
    const len = Math.floor(ac.sampleRate * 0.5);
    buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseBufs.set(ac, buf);
  }
  return buf;
}

export default class Voice {
  /**
   * @param {AudioContext} ac
   * @param {number} at      始める時刻（ac.currentTime 基準）
   * @param {number} pitch   声の高さ（Hz）
   * @param {Array}  words   Voice.kana() の結果
   * @param {{volume?:number, out?:AudioNode, noise?:AudioBuffer, swing?:number}} [opts]
   * @returns {{end:number, stop:function}}
   */
  static speak(ac, at, pitch, words, opts) {
    opts = opts || {};
    const f0 = pitch || 300, noise = opts.noise || noiseOf(ac), start = at;
    let t = at;

    const out = ac.createGain();
    out.gain.value = opts.volume ?? 0.34;
    out.connect(opts.out || ac.destination);

    const osc = ac.createOscillator(), env = ac.createGain();
    osc.type = "sawtooth";
    env.gain.value = SILENT;
    osc.connect(env);

    /* 口の形（フォルマント）を作る3つの帯域フィルタ */
    const bands = [0, 1, 2].map((k) => {
      const b = ac.createBiquadFilter(), g = ac.createGain();
      b.type = "bandpass";
      b.Q.value = [5, 6, 8][k];
      g.gain.value = [2.2, 1.4, 0.6][k];
      env.connect(b); b.connect(g); g.connect(out);
      return b;
    });

    const hiss = (t0, dur, freq, q, vol) => {
      const n = ac.createBufferSource(), b = ac.createBiquadFilter(), g = ac.createGain();
      n.buffer = noise;
      b.type = "bandpass";
      b.frequency.value = freq; b.Q.value = q;
      g.gain.setValueAtTime(SILENT, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(SILENT, t0 + dur);
      n.connect(b); b.connect(g); g.connect(out);
      /* 毎回同じ場所から鳴らさず、少しずらしてノイズに変化をつける */
      n.start(t0, Math.random() * Math.max(0, noise.duration - dur - 0.02));
      n.stop(t0 + dur + 0.02);
    };

    /* 少しずつ下がる。swing を指定したときだけ、その強さに縮める */
    const pitchAt = (k) => opts.swing == null ? f0 * (1.12 - 0.3 * k) : f0 * (1 + (0.12 - 0.3 * k) * opts.swing);
    osc.frequency.value = pitchAt(0); /* 最初に別の高さ（既定の440Hz）から滑らないように */

    const total = words.reduce((sum, w) => sum + w[2], 0);

    words.forEach((w, i) => {
      const c = w[0], vw = VOWELS[w[1]], dur = w[2];
      osc.frequency.setTargetAtTime(pitchAt((t - start) / total), t, 0.02);

      /* 間：声を止めて進める */
      if (!vw) {
        env.gain.setTargetAtTime(SILENT, t, 0.015);
        t += dur;
        return;
      }

      /* 子音 */
      const spec = CONSONANTS[c];
      let cl = 0;
      if (spec) {
        cl = spec.len;
        env.gain.setTargetAtTime(spec.env[0], t, spec.env[1]);
        if (spec.nasal) spec.nasal.forEach((f, j) => bands[j].frequency.setTargetAtTime(f, t, 0.01));
        if (spec.hiss) spec.hiss.forEach((h) => hiss(t + h[0], h[1], h[2], h[3], h[4]));
      }

      /* 母音。「し」の i は声を小さく（ささやくように抜ける）。「ん」は鼻に抜けて小さい */
      const tv = t + cl, loud = c === "sh" ? 0.25 : w[1] === "n" ? 0.4 : 0.9;
      bands.forEach((b, j) => b.frequency.setTargetAtTime(vw[j], tv, 0.015));
      env.gain.setTargetAtTime(loud, tv, 0.012);
      t += dur;
      if (i === words.length - 1) env.gain.setTargetAtTime(SILENT, t - 0.06, 0.03);
    });

    osc.start(start);
    osc.stop(t + 0.2);

    return {
      end: t,
      /* 途中で止める（次の文に切り替えるときなど） */
      stop() {
        const n = ac.currentTime;
        try {
          out.gain.cancelScheduledValues(n);
          out.gain.setTargetAtTime(SILENT, n, 0.02);
          osc.stop(n + 0.12);
        } catch { }
      }
    };
  }

  /** かな → [[子音, 母音, 長さ(秒)], ...]。カタカナも読める。mora は1拍の長さ */
  static kana(yomi, mora) {
    const d = mora || 0.13, words = [];
    const s = String(yomi).replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
    for (let i = 0; i < s.length; i++) {
      const ch = s[i], last = words[words.length - 1];
      if (TABLE[ch]) {
        const cv = TABLE[ch].slice();
        if (SMALL[s[i + 1]]) { cv[1] = SMALL[s[i + 1]]; i++; }
        words.push([cv[0], cv[1], d]);
      } else if (ch === "ん") words.push(["", "n", d]);
      else if (ch === "ー" && last && last[1]) last[2] += d;            /* のばす */
      else if (ch === "っ") words.push(["", "", d * 0.8]);             /* つまる */
      else if (/[、，,]/.test(ch)) words.push(["", "", d * 2]);         /* ひと息 */
      else if (/[。！？!?]/.test(ch)) words.push(["", "", d * 3]);
    }
    return words;
  }
}
