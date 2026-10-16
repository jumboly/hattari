import './style.css';
import { sfx } from './audio';
import { STAGES } from './content';
import { Demo } from './demo';
import { Fx } from './fx';
import { Hack } from './hack';
import { layoutFor, Panels } from './panels';
import { Rain } from './rain';
import { Scheduler } from './sched';
import { Terminal } from './terminal';

const $ = (id: string) => document.getElementById(id)!;

const sched = new Scheduler();
const term = new Terminal($('term'));
const fx = new Fx($('fx'), $('stage'), sched);
const hack = new Hack(term, fx, sched);
const rain = new Rain($('rain') as HTMLCanvasElement);
const demo = new Demo(hack);
const panels = new Panels($('side'), hack);

// 起動直後は少し待ってから自動進行を始め、静かにカーソルが点滅している「間」を見せる
const FIRST_IDLE_MS = 5000;
// 手を止めてから自動操縦に戻るまでの時間
const IDLE_MS = 15000;
let lastHuman = performance.now() - (IDLE_MS - FIRST_IDLE_MS);

// ---------- 演出の連動 ----------
hack.onPulse = (kind) => {
  switch (kind) {
    case 'key':
      rain.kick(1 + Math.floor(hack.intensity * 3));
      break;
    case 'enter':
      rain.surge(2.5);
      rain.kick(6);
      break;
    case 'stage':
      rain.surge(4);
      rain.kick(20);
      break;
    case 'boom':
      rain.wave();
      break;
    case 'trace':
      rain.alert = true;
      rain.surge(3);
      break;
    case 'evade':
      rain.alert = false;
      rain.wave();
      break;
  }
};
// 消えるウィンドウを文字の雨に崩す
panels.onDissolve = (r) => {
  for (let x = r.left; x < r.right; x += 14) rain.spawnAt(x + Math.random() * 10, r.top + Math.random() * r.height);
};
fx.onCrumble = (pts) => pts.forEach((p) => rain.spawnAt(p.x, p.y));

// ---------- 入力 ----------
function setMode(auto: boolean, label = auto ? 'AUTO' : 'MANUAL') {
  modeEl.textContent = label;
  modeEl.classList.toggle('manual', !auto);
}

function takeOver(now: number) {
  lastHuman = now;
  if (demo.active) {
    demo.stop();
    setMode(false);
    fx.toast('MANUAL OVERRIDE');
  } else if (modeEl.textContent !== 'MANUAL') setMode(false);
}

window.addEventListener('keydown', (e) => {
  // ブラウザやOSのショートカット（Cmd+R, Ctrl+L など）は妨げない
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const now = performance.now();
  if (e.key === 'Escape') {
    if (!demo.active) {
      demo.start(now);
      setMode(true);
      fx.toast('AUTOPILOT ENGAGED');
    }
    sfx.unlock();
    return;
  }
  if (e.key === 'Enter') {
    takeOver(now);
    hack.enter(now);
  } else if (e.key === 'Backspace') {
    takeOver(now);
    hack.backspace();
  } else if (e.key.length === 1) {
    takeOver(now);
    hack.key(now);
  } else return; // F キー・矢印・Tab などはブラウザに任せる
  e.preventDefault();
  sfx.unlock();
});
window.addEventListener('pointerdown', () => sfx.unlock());

const muteBtn = $('mute');
muteBtn.addEventListener('click', (e) => {
  sfx.unlock();
  sfx.setMuted(!sfx.muted);
  muteBtn.textContent = sfx.muted ? 'SND OFF' : 'SND ON';
  // ボタンにフォーカスが残ると Space/Enter で再度トグルされてしまうため外す
  (e.currentTarget as HTMLElement).blur();
});

// ---------- HUD ----------
const modeEl = $('mode');
const audioHint = $('audiohint');
const pipeline = $('pipeline');
pipeline.innerHTML = STAGES.map((s) => `<span class="st" data-id="${s.id}">${s.label}</span>`).join('<i>▸</i>');
const stEls = [...pipeline.querySelectorAll<HTMLElement>('.st')];
const signal = $('signal');
signal.innerHTML = Array.from({ length: 12 }, () => '<b></b>').join('');
const bars = [...signal.children] as HTMLElement[];
const clock = $('clock');
const targetEl = $('target');
let hudKey = '';
setMode(false, 'STANDBY');

function renderHud() {
  const key = `${hack.stageIdx}|${hack.target.name}`;
  if (key !== hudKey) {
    hudKey = key;
    stEls.forEach((el, i) => {
      el.className = `st ${i < hack.stageIdx ? 'done' : i === hack.stageIdx ? 'now' : ''}`;
    });
    targetEl.textContent = `TARGET ▸ ${hack.target.name}  ${hack.target.node}  ${hack.target.sector}`;
  }
  const lit = Math.round(hack.intensity * bars.length);
  bars.forEach((b, i) => b.classList.toggle('on', i < lit));
  document.documentElement.style.setProperty('--intensity', hack.intensity.toFixed(3));
  audioHint.hidden = sfx.unlocked;
}

// ---------- メインループ ----------
let lastClock = 0;
let last = performance.now();
function frame(now: number) {
  // タブが裏に回って復帰した直後に巨大な dt で演出が飛ばないよう上限を設ける
  const dt = Math.min(100, now - last);
  last = now;

  if (!demo.active && now - lastHuman > IDLE_MS) {
    demo.start(now);
    setMode(true);
    if (hack.promptSerial > 1) fx.toast('AUTOPILOT ENGAGED');
  }
  demo.update(now);
  sched.update(now);
  hack.update(now, dt);

  rain.frozen = hack.hushed;
  rain.speedTarget = 0.8 + hack.intensity * 1.6;
  // 誰も触っていない時は雨を主役に、打鍵中はターミナルを主役にする
  rain.alphaTarget = hack.hushed ? 0.18 : document.body.classList.contains('afterglow') ? 1 : 0.38 + (1 - hack.intensity) * 0.22;
  // フィナーレ中はウィンドウを全部崩し、次のターゲットで雨から再構成する
  panels.set(hack.hushed || document.body.classList.contains('afterglow') ? [] : layoutFor(hack));
  panels.update(now, dt);
  rain.update(dt);
  rain.draw();

  renderHud();
  if (now - lastClock > 1000) {
    lastClock = now;
    clock.textContent = new Date().toISOString().slice(11, 19) + 'Z';
  }
  requestAnimationFrame(frame);
}

hack.start();
requestAnimationFrame(frame);

// 自動テスト・デバッグ用に内部状態を覗けるようにする
(window as unknown as { __hattari: unknown }).__hattari = { hack, term, sched, rain, demo, panels };
