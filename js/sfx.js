import audioResume from './audio.js';
import zVoice from './voice.js';

/* 効果音と声。main.js から分けたもの。
   unlock() を最初のタッチ/クリックで呼ぶと AudioContext ができる（それまでは何も鳴らさない）。 */
export default class Sfx {
  constructor() {
    this.ac = null;
    this.noise = null;
  }

  /** 音が出せる状態か */
  get ready() {
    return !!this.ac;
  }

  /** AudioContext の現在時刻（まだなら 0） */
  get now() {
    return this.ac ? this.ac.currentTime : 0;
  }

  resume() {
    audioResume(this.ac);
  }

  /** 初回だけ AudioContext と走行音を作る。2回目以降は再開するだけ */
  unlock() {
    if (this.ac) {
      this.resume();
      return;
    }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    try {
      this.ac = new C();
    } catch { return; }
    this.resume();

    const ac = this.ac;
    const len = Math.floor(ac.sampleRate * 2);
    this.noise = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    /* 走行音（低いゴー） */
    const s = ac.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 220;
    const g = ac.createGain();
    g.gain.value = 0.18;
    s.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    s.start();
  }

  /** 吹き出しの声。at は AudioContext の時刻。終わる時刻を返す */
  speak(at, yomi, opt) {
    return zVoice.speak(
      this.ac,
      at,
      opt.pitch,
      zVoice.kana(yomi.replace(/[！？!?。…]+$/, ""), opt.mora || 0.12),
      { volume: opt.volume || 0.34 }
    ).end;
  }

  noiseHit(dur, freq, vol, q, at) {
    const ac = this.ac;
    if (!ac) return;
    const s = ac.createBufferSource();
    s.buffer = this.noise;
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = q || 1;
    const g = ac.createGain(), n = at || ac.currentTime;
    g.gain.setValueAtTime(vol, n);
    g.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    s.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    s.start(n, Math.random());
    s.stop(n + dur + 0.05);
  }

  /* ぶつかったときの声（アツアツ一輪車の倒れたときと同じ）。
     「アアアアア～～～」。高いところから落ちていくように下がる長い叫び。
     細かく音量を揺らして「アアアア」と途切れさせ、だんだん震えを強くして消える */
  scream(pitch, delay = 0.02) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime + delay, f0 = pitch || 520, dur = 1.7;
    const out = ac.createGain(), trem = ac.createGain();
    out.gain.value = 0.45;
    trem.connect(out);
    out.connect(ac.destination);
    const o = ac.createOscillator(), env = ac.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f0 * 1.15, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + dur);
    /* 声の震え（あとほど深く） */
    const vib = ac.createOscillator(), vg = ac.createGain();
    vib.frequency.value = 6.5;
    vg.gain.setValueAtTime(f0 * 0.01, t);
    vg.gain.linearRampToValueAtTime(f0 * 0.05, t + dur);
    vib.connect(vg);
    vg.connect(o.frequency);
    /* 「アアアア」と途切れる揺れ */
    const am = ac.createOscillator(), ag = ac.createGain();
    am.frequency.setValueAtTime(8, t);
    am.frequency.linearRampToValueAtTime(5, t + dur);
    ag.gain.value = 0.35;
    trem.gain.value = 0.65;
    am.connect(ag);
    ag.connect(trem.gain);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9, t + 0.03);
    env.gain.setValueAtTime(0.9, t + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env);
    [[850, 5, 2.2], [1250, 6, 1.4], [2700, 8, 0.8]].forEach((fm) => {
      const b = ac.createBiquadFilter(), g = ac.createGain();
      b.type = "bandpass";
      b.frequency.value = fm[0];
      b.Q.value = fm[1];
      g.gain.value = fm[2];
      env.connect(b);
      b.connect(g);
      g.connect(trem);
    });
    [o, vib, am].forEach((n) => {
      n.start(t);
      n.stop(t + dur + 0.05);
    });
  }

  /* 背もたれが倒れる「ギッ」 */
  creak() {
    const ac = this.ac;
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter(), n = ac.currentTime;
    o.type = "sawtooth";
    o.frequency.setValueAtTime(70 + Math.random() * 30, n);
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 3;
    g.gain.setValueAtTime(0.0001, n);
    g.gain.exponentialRampToValueAtTime(0.12, n + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, n + 0.07);
    o.connect(f);
    f.connect(g);
    g.connect(ac.destination);
    o.start(n);
    o.stop(n + 0.1);
  }

  /* 成功のファンファーレ（四角波のパッパッパッパーン＋低い和音） */
  fanfare() {
    const ac = this.ac;
    if (!ac) return;
    const n = ac.currentTime + 0.15,
      C = 523.25,
      E = 659.25,
      G = 783.99,
      C2 = 1046.5,
      A = 880,
      B = 987.77;
    [[G, 0, 0.1], [G, 0.12, 0.1], [G, 0.24, 0.1], [C2, 0.36, 0.5], [A, 0.9, 0.16], [B, 1.08, 0.16], [C2, 1.26, 0.9]].forEach((t) => this.beep(t[0], n + t[1], t[2] + 0.1, 0.12, "square"));
    [C / 2, E / 2, G / 2].forEach((f) => this.beep(f, n + 1.26, 1.0, 0.06, "triangle"));
  }

  beep(freq, at, dur, vol, type) {
    const ac = this.ac;
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(ac.destination);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}
