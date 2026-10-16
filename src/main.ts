import './style.css';
import { sfx } from './audio';
import { STAGES } from './content';
import { Fx } from './fx';
import { Hack } from './hack';
import { Scheduler } from './sched';
import { Terminal } from './terminal';

const $ = (id: string) => document.getElementById(id)!;

const sched = new Scheduler();
const term = new Terminal($('term'));
const fx = new Fx($('fx'), $('stage'), sched);
const hack = new Hack(term, fx, sched);

// ---------- 入力 ----------
window.addEventListener('keydown', (e) => {
  // ブラウザやOSのショートカット（Cmd+R, Ctrl+L など）は妨げない
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
  const now = performance.now();
  if (e.key === 'Enter') hack.enter(now);
  else if (e.key === 'Backspace') hack.backspace();
  else if (e.key.length === 1) hack.key(now);
  else return; // F キー・矢印・Tab・Esc などはブラウザに任せる
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
const pipeline = $('pipeline');
pipeline.innerHTML = STAGES.map((s) => `<span class="st" data-id="${s.id}">${s.label}</span>`).join('<i>▸</i>');
const stEls = [...pipeline.querySelectorAll<HTMLElement>('.st')];
const signal = $('signal');
signal.innerHTML = Array.from({ length: 12 }, () => '<b></b>').join('');
const bars = [...signal.children] as HTMLElement[];
const clock = $('clock');
const targetEl = $('target');
let hudKey = '';

function renderHud() {
  const key = `${hack.stageIdx}|${hack.target.name}|${Math.round(hack.progress * 10)}`;
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
}

let lastClock = 0;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(100, now - last);
  last = now;
  sched.update(now);
  hack.update(now, dt);
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
(window as unknown as { __hattari: unknown }).__hattari = { hack, term, sched };
