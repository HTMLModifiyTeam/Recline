import zStartTap from "./js/start.js";
import gameView from './js/view.js';
import Sfx from './js/sfx.js';
import Lang from './js/lang.js';
import Z3 from "./js/Z3.js";
import { Scene3D, zRecline } from "./js/scene3d.js";
import ResultActions from './js/result-actions.js'

const lang = Lang.install();
var canvas = document.getElementById("c");
var ctx = canvas.getContext("2d");
var wrap = document.getElementById("wrap");
var W = 540, H = 960;

const rngChance = (probability = 0.5) => Math.random() < probability;

function layout() {
  var view = gameView.measure(wrap, W);
  H = view.gameHeight;
  gameView.fit(canvas, wrap, ctx, W, H, view);
}
window.addEventListener("resize", layout);
window.addEventListener("orientationchange", layout);
/* ============ 音 ============ */
const sfx = new Sfx();
wrap.addEventListener("touchstart", () => sfx.unlock(), { passive: true });
wrap.addEventListener("touchend", () => sfx.resume(), { passive: true });
wrap.addEventListener("pointerup", () => sfx.resume(), true);

var bubbles = []; /* 吹き出し { who: "me"|"back", ja, en, until } */
function say(who, yomi, ja, en, opt) {
  var at = sfx.ready ? sfx.now + (opt.delay || 0) : 0, end = at + 0.6;
  if (sfx.ready) end = sfx.speak(at, yomi, opt);
  bubbles = bubbles.filter((b) => b.who !== who);
  bubbles.push({
    who: who,
    ja: ja,
    en: en,
    ko: opt.ko,
    zh: opt.zh,
    tw: opt.tw,
    from: T + (opt.delay || 0),
    until: T + (opt.delay || 0) + Math.max(1.2, (end - at) + 0.8)
  });
}
/* ============ 状態 ============ */
var S = {
  INTRO: "intro",
  ASK: "ask",
  PLAY: "play",
  ANGRY: "angry",
  FIGHT: "fight",
  POLICE: "police",
  RESULT: "result"
};
var state, score, T, held;
var MAX = 50; /* 座席が倒れきる角度 */
var SPEED = 8; /* 倒れる速さ（度/秒） */
var D2R = Math.PI / 180;
var angle, contact, lean, gap, hitInfo, creakT = 0;
var noUI = false;
var failed, denied;
var isFight = false;

function newRound() {
  document.getElementById("start").hidden = true;
  state = S.ASK;
  score = 0;
  T = 0;
  T2 = 0;
  held = false;
  angle = 0;
  failed = false;
  gap = null;
  lean = -0.18; /* 後ろの人は背もたれに頭をつけてもたれる（触れるのは約30.7°）*/
  contact = 0;
  while (gapNow(contact) > 0 && contact < MAX) contact += 0.1;
  gap = gapNow(0);
  bubbles = [];
  say("me", "たおしてもいいですか？", "倒してもいいですか？", "May I recline?", {
    pitch: 290,
    ko: "젖혀도 될까요?",
    zh: "可以把椅背放倒吗？",
    tw: "可以把椅背放倒嗎？"
  });
  /* 30回に1回くらい断られ、けんかのあと警察が来る */
  denied = rngChance(1 / 30);
  if (denied) {
    isFight = rngChance(.4);
    if (isFight) say("back", "やるか？", "やるか？", "WANNA FIGHT?", { pitch: 100, delay: 1.7, mora: 0.15, ko: "싸울래?", zh: "想打架吗？", tw: "想打架嗎？" });
    else say("back", "だめです", "ダメです", "No.", { pitch: 200, delay: 1.7, mora: 0.15, ko: "안 돼요.", zh: "不行。", tw: "不行。" });
  } else say("back", "どうぞ", "どうぞ", "Sure.", { pitch: 210, delay: 1.7, mora: 0.15, ko: "그러세요.", zh: "请便。", tw: "請便。" });
}
/* 背もたれの頭の部分と後ろの人の頭のすき間（メートル）。a は度 */
function gapNow(a) {
  if (!zRecline) {
    hitInfo = null;
    return 0.2 - a * 0.01;
  }
  hitInfo = zRecline.gapAt(a * D2R, lean);
  return hitInfo.gap;
}
/* ============ 進行 ============ */
function update(dt) {
  T += dt;
  bubbles = bubbles.filter((b) => T < b.until);
  gap = gapNow(angle);
  if (state === S.ASK) {
    if (denied ? T > 3.2 : T > 2.4) {
      if (denied) {
        if (isFight) {
          state = S.FIGHT;
          T2 = 0;
        } else toResult();
      } else state = S.PLAY;
    }
    return;
  }
  if (state === S.FIGHT) {
    T2 += dt;
    if (T2 > 2) {
      state = S.POLICE;
      T2 = 0;
    }
    return;
  }
  if (state === S.POLICE) {
    T2 += dt;
    if (T2 > 2.5) toResult();
    return;
  }
  if (state === S.ANGRY) {
    T2 += dt;
    if (T2 > 2.6) toResult();
    return;
  }
  if (state !== S.PLAY) return;
  /* 押している間、なめらかに倒れる */
  if (held && angle < MAX) {
    angle = Math.min(MAX, angle + SPEED * dt);
    creakT -= dt;
    if (creakT <= 0) {
      creakT = 0.12;
      sfx.creak();
    }
    gap = gapNow(angle);
  }
  if (gap <= 0) bump();
}

function bump() {
  state = S.ANGRY;
  T2 = 0;
  failed = true;
  held = false;
  sfx.scream(480 + Math.random() * 80);
  sfx.noiseHit(0.12, 2500, 0.5, 2);
}
var T2 = 0;

function toResult() {
  state = S.RESULT;
  score = failed ? 0 : Math.round(gap * 100000) / 100;
}
/* ============ 入力 ============ */
function down(x, y) {
  if (state === S.INTRO) return;
  sfx.unlock();
  if (state === S.RESULT) {
    var hit = x == null ? "retry" : ResultActions.hit(resultButtons(), x, y);
    if (hit === "retry") newRound();
    return;
  }
  if (state !== S.PLAY) return;
  held = true;
}

function up() {
  if (!held) return;
  held = false;
  if (state !== S.PLAY || angle <= 0) return;
  /* 1コマ(1/60秒)の間も倒れ続けているので、指を離した時刻までの分を足して角度を細かく出す */
  var extra = Math.min(1 / 30, stepAcc + Math.max(0, (performance.now() - last) / 1000));
  angle = Math.min(MAX, angle + SPEED * extra);
  gap = gapNow(angle);
  if (gap <= 0) {
    bump();
    return;
  }
  toResult();
  sfx.noiseHit(0.08, 600, 0.3, 2);
  sfx.fanfare();
}
wrap.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  var p = gameView.point(canvas, e, W, H);
  down(p.x, p.y);
});
wrap.addEventListener("pointerup", (e) => {
  e.preventDefault();
  up();
});
wrap.addEventListener("pointercancel", () => up());
window.addEventListener("blur", () => up());

window.addEventListener("keydown", (e) => {
  var esc = e.key === "Escape";
  var go = e.code === "Space" || e.key === " " || e.key === "Enter";
  if (!esc && !go) return;
  e.preventDefault();
  if (esc) {
    if (!e.repeat) newRound();
    return;
  }
  if (e.repeat) return;
  down();
});
window.addEventListener("keyup", function (e) {
  if (e.code === "Space" || e.key === " " || e.key === "Enter") {
    if (state === S.INTRO) startButton.click();
    else up();
  }
});
/* ============ 描画 ============ */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
var scene3d = Z3 ? Z3.lazy(() => new Scene3D()) : () => null;
var angry = 0;

function draw() {
  var g = gap == null ? 1 : gap, near = Math.max(0, Math.min(1, 1 - g / 0.06));
  angry += ((state === S.ANGRY || (state === S.RESULT && failed) ? 1 : 0) - angry) * 0.2;
  var s3 = scene3d(), drew = false;
  if (s3) {
    try {
      s3.sync({
        t: T || 0,
        angle: angle * D2R,
        lean: lean,
        near: state === S.INTRO ? 0 : near,
        angry: angry,
        rag: state === S.ANGRY || (state === S.RESULT && failed),
        fight: state === S.FIGHT,
        fightTime: T2,
        police: (state === S.POLICE && isFight) ? Math.min(1, T2 / 1.6) : (state === S.RESULT && isFight ? 1 : 0),
        policeTime: T2,
        W: W,
        H: H
      });
      drew = s3.draw(ctx, W, H);
    } catch { scene3d.drop(); }
  }
  if (!drew) {
    ctx.fillStyle = "#d9d4c6";
    ctx.fillRect(0, 0, W, H);
  }
  /* すき間が近いときの拡大鏡（当たりそうな所を5倍に） */
  if (drew && hitInfo && g < 0.06 && !failed && !noUI && state !== S.ANGRY && state !== S.INTRO && state !== S.RESULT) {
    var hi = hitInfo, k = canvas.width / W, mag = Math.max(5, Math.min(30, 0.03 / Math.max(0.001, g))), R = 100;
    var dx = hi.near.x - hi.at.x, dy = hi.near.y - hi.at.y, dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var surf = {
      x: hi.at.x + dx / dl * hi.r,
      y: hi.at.y + dy / dl * hi.r
    };
    var c = s3.project({
      x: (surf.x + hi.near.x) / 2,
      y: (surf.y + hi.near.y) / 2,
      z: 0
    }, W, H);
    var cx = W / 2, cy = R + 40;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    var sw = (R * 2) / mag;
    ctx.drawImage(canvas, (c.x - sw / 2) * k, (c.y - sw / 2) * k, sw * k, sw * k, cx - R, cy - R, R * 2, R * 2);
    ctx.restore();
    ctx.strokeStyle = "#16202e";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "800 28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    var txt = (Math.max(0, g) * 1000).toFixed(2) + "mm", tw = ctx.measureText(txt).width + 24;
    ctx.fillStyle = "#fff";
    rr(cx - tw / 2, cy + R + 8, tw, 38, 19);
    ctx.fill();
    ctx.fillStyle = "#16202e";
    ctx.fillText(txt, cx, cy + R + 13);
  }
  /* 吹き出し */
  bubbles.forEach(function (b) {
    if (T < b.from || state === S.RESULT || noUI) return;
    var txt = lang.t(b.ja, b.en, b.ko, b.zh, b.tw), mad = b.ja === "ちょっと！";
    ctx.font = (mad ? "900 44px" : "800 32px") + " sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var w = ctx.measureText(txt).width + 40, bx = b.who === "me" ? W * 0.68 : W * 0.3, by = b.who === "me" ? 70 : 150;
    bx = Math.max(w / 2 + 10, Math.min(W - w / 2 - 10, bx));
    ctx.fillStyle = mad ? "#c0263a" : "#fff";
    rr(bx - w / 2, by - 34, w, 68, 30);
    ctx.fill();
    ctx.fillStyle = mad ? "#fff" : "#16202e";
    ctx.fillText(txt, bx, by + 2);
  });
  if (state === S.RESULT) drawResult();
}

function resultLayout() {
  return ResultActions.showcase(W, H, {
    sizes: denied ? (isFight ? [48, 80] : [80]) : failed ? [58] : [104, 50]
  });
}

function resultButtons() {
  return resultLayout().buttons;
}

function getRows() {
  if (isFight) return [lang.t("ゲームオーバー", "Game over", "게임 오버", "游戏结束", "遊戲結束"), lang.t("逮捕された", "Arrested", "체포됨", "被逮捕", "被逮捕")];
  if (denied) return [lang.t("だめでした", "Denied", "안 됐습니다", "被拒绝了", "被拒絕了")];
  if (failed) return [lang.t("後ろの人を倒した", "Knocked out the person behind", "뒷사람을 쓰러뜨렸다", "把后面的人放倒了", "把後面的人放倒了")];
  return [score.toFixed(2) + "mm", lang.t("まで倒した", "left", "까지 젖혔다", "剩余", "剩餘")];
}

function drawResult() {
  var L = resultLayout();
  var rows = getRows();
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#16202e";
  rows.forEach(function (t, i) {
    var sz = L.lines[i].size;
    ctx.font = "900 " + sz + "px sans-serif";
    while (ctx.measureText(t).width > W - 30 && sz > 20) {
      sz -= 2;
      ctx.font = "900 " + sz + "px sans-serif";
    }
    ctx.lineWidth = Math.max(6, sz * 0.12);
    ctx.strokeText(t, W / 2, L.lines[i].y);
    ctx.fillStyle = failed || denied ? "#ff5a6e" : "#fff";
    ctx.fillText(t, W / 2, L.lines[i].y);
  });
  ctx.restore();
  ResultActions.drawButtons(ctx, resultButtons());
}
var startButton = document.getElementById("start");
zStartTap(() => state === S.INTRO, () => startButton.click());
["pointerdown", "pointerup"].forEach((name) => startButton.addEventListener(name, (e) => e.stopPropagation()));
startButton.addEventListener("click", (e) => {
  e.stopPropagation();
  sfx.unlock();
  sfx.resume();
  newRound();
});

angle = 0;
lean = -0.18;
contact = 20;
T = 0;
bubbles = [];
state = S.INTRO;

startButton.hidden = false;
layout();
var last = performance.now(), stepAcc = 0;

function loop(now) {
  var dt = Math.max(0, Math.min(0.25, (now - last) / 1000));
  last = now;
  stepAcc += dt;
  while (stepAcc >= 1 / 60) {
    update(1 / 60);
    stepAcc -= 1 / 60;
  }
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);