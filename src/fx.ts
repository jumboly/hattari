import { sfx } from './audio';
import type { Scheduler } from './sched';

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789ABCDEFZ<>#$%&*';
const g = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

/** 画面全体に関わる演出（フラッシュ・揺れ・バナー・巨大文字） */
export class Fx {
  constructor(
    private layer: HTMLElement,
    private stage: HTMLElement,
    private sched: Scheduler,
  ) {}

  flash(kind: 'white' | 'green' | 'red' = 'green') {
    const d = document.createElement('div');
    d.className = `flash ${kind}`;
    this.layer.appendChild(d);
    d.addEventListener('animationend', () => d.remove());
  }

  // CSS アニメーションを再始動させるため、クラスを外して reflow を挟んでから付け直す
  shake(strong = false) {
    const cls = strong ? 'shake-strong' : 'shake';
    this.stage.classList.remove('shake', 'shake-strong');
    void this.stage.offsetWidth;
    this.stage.classList.add(cls);
  }

  glitch(ms = 220) {
    this.stage.classList.add('glitch');
    this.sched.cancel('glitch');
    this.sched.after(ms, () => this.stage.classList.remove('glitch'), 'glitch');
  }

  /** ランダムな記号から目的の文字列に収束させる「デコード」表示 */
  decode(el: HTMLElement, text: string, ms: number, tag: string) {
    const chars = [...text].map((c) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = c === ' ' ? ' ' : g();
      el.appendChild(s);
      return s;
    });
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      this.sched.after((ms / steps) * i, () => {
        chars.forEach((s, j) => {
          if (text[j] === ' ') return;
          // 左から順に確定させ、未確定部分はランダムに揺らす
          s.textContent = j / chars.length < i / steps ? text[j] : g();
        });
      }, tag);
    }
    return chars;
  }

  /** ステージ突破時の中規模バナー */
  banner(text: string) {
    this.sched.cancel('banner');
    this.layer.querySelectorAll('.banner').forEach((n) => n.remove());
    const d = document.createElement('div');
    d.className = 'banner';
    const inner = document.createElement('div');
    inner.className = 'banner-text';
    d.appendChild(inner);
    this.layer.appendChild(d);
    this.decode(inner, text, 380, 'banner');
    this.sched.after(1500, () => d.classList.add('out'), 'banner');
    this.sched.after(1900, () => d.remove(), 'banner');
  }

  /** フィナーレの巨大文字。崩れ落ちるところまで面倒を見て、終わったら onDone */
  finale(title: string, sub: string, onDone: () => void) {
    const d = document.createElement('div');
    d.className = 'finale';
    const t = document.createElement('div');
    t.className = 'finale-title';
    const s = document.createElement('div');
    s.className = 'finale-sub';
    d.append(t, s);
    this.layer.appendChild(d);

    const chars = this.decode(t, title, 520, 'finale');
    this.sched.after(700, () => this.decode(s, sub, 700, 'finale'), 'finale');
    this.sched.after(3400, () => {
      sfx.crumble();
      d.classList.add('crumble');
      // 各文字をバラバラのタイミング・角度で落とし、「情報が文字の雨に崩れる」感じを出す
      [...chars, ...s.querySelectorAll<HTMLElement>('.ch')].forEach((c) => {
        const delay = Math.random() * 600;
        c.style.transition = `transform ${900 + Math.random() * 700}ms cubic-bezier(.55,0,.9,.4) ${delay}ms, opacity 1200ms ease-in ${delay + 300}ms, color 200ms ${delay}ms`;
        c.style.transform = `translate(${(Math.random() - 0.5) * 60}px, ${60 + Math.random() * 50}vh) rotate(${(Math.random() - 0.5) * 120}deg)`;
        c.style.opacity = '0';
      });
      this.sched.after(80, () => chars.forEach((c) => c.textContent?.trim() && (c.textContent = g())), 'finale');
    }, 'finale');
    this.sched.after(5200, () => {
      d.remove();
      onDone();
    }, 'finale');
  }
}
