const placements = new WeakMap();

function placeStyle(button, key, value, previous) {
  // ブラウザが小数を丸めても、同じ指定を繰り返し書き込まない。
  if (previous[key] === value && previous[key + 'Applied'] === button.style[key]) return;
  button.style[key] = value;
  previous[key] = value;
  previous[key + 'Applied'] = button.style[key];
}

export default class ResultActions {
  static bind(button, action) {
    const stop = (e) => e.stopPropagation();
    const click = (e) => {
      e.stopPropagation();
      if (!button.hidden && !button.disabled) action();
    };
    // preventDefault はしない。指離しから生じる通常のクリックを残す。
    const events = ['pointerdown', 'pointerup', 'pointercancel', 'keydown', 'keyup'];
    events.forEach((name) => button.addEventListener(name, stop));
    button.addEventListener('click', click);
    return () => {
      events.forEach((name) => button.removeEventListener(name, stop));
      button.removeEventListener('click', click);
    };
  }

  static row(W, y) {
    const w = 170, h = 54;
    return [{ id: 'retry', x: W / 2 - w / 2, y, w, h, label: 'RETRY' }];
  }

  /* 作品を見せる結果画面の並び（アフロ盆栽・スキー炒飯の形）。暗くせず、
     文字は上端から順に積み、ボタンは下、その間を作品の枠にする。
     sizes は上から各行の文字の大きさ。返す lines[i].y は textBaseline "top" で使う。 */
  static showcase(W, H, opt) {
    opt = opt || {};
    const sizes = opt.sizes || [96, 30];
    const lines = [];
    let y = Math.max(18, H * 0.03);
    sizes.forEach((s) => {
      lines.push({ y, size: s });
      y += Math.round(s * 1.12);
    });
    const by = H - 54 - Math.max(24, H * 0.05), pad = 12;
    const top = y + pad, bottom = by - pad;
    return {
      lines,
      subject: { x: 0, y: top, w: W, h: Math.max(0, bottom - top), cx: W / 2, cy: (top + bottom) / 2 },
      buttons: ResultActions.row(W, by, opt.buttons)
    };
  }

  static hit(buttons, x, y) {
    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.id;
    }
    return null;
  }

  /* 白地・濃い縁・丸い両端のボタンにアイコンだけを描く（決めごとの形）。 */
  static drawButtons(ctx, buttons) {
    buttons.forEach((b) => {
      const r = b.h / 2;
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.beginPath();
      ctx.moveTo(-b.w / 2 + r, -r); ctx.lineTo(b.w / 2 - r, -r);
      ctx.arc(b.w / 2 - r, 0, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(-b.w / 2 + r, r);
      ctx.arc(-b.w / 2 + r, 0, r, Math.PI / 2, Math.PI * 1.5);
      ctx.closePath();
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#16202e'; ctx.stroke();
      ctx.fillStyle = '#16202e';
      ctx.font = '800 24px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (!window.zActionIcon || !window.zActionIcon(ctx, b.label, 0, 1, 30)) ctx.fillText(b.label, 0, 1);
      ctx.restore();
    });
  }

  static place(button, box, width, height, visible) {
    if (button.hidden !== !visible) button.hidden = !visible;
    if (!visible) return;
    // 動かない結果画面では、同じ表示指定を毎コマ書き直さない。
    const left = box.x / width * 100 + '%', top = box.y / height * 100 + '%';
    const w = box.w / width * 100 + '%', h = box.h / height * 100 + '%';
    let previous = placements.get(button);
    if (!previous) { previous = {}; placements.set(button, previous); }
    placeStyle(button, 'left', left, previous);
    placeStyle(button, 'top', top, previous);
    placeStyle(button, 'width', w, previous);
    placeStyle(button, 'height', h, previous);
  }
}