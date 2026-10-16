import { describe, expect, it } from 'vitest';
import { compileScript, newTarget, noiseLine, pickCommand, scriptFor, SNIPPETS, STAGES } from '../src/content';
import { Scheduler } from '../src/sched';
import { highlight } from '../src/terminal';

describe('content', () => {
  it('テンプレートに未展開の値が残らない', () => {
    for (let i = 0; i < 200; i++) {
      const t = newTarget();
      for (const s of STAGES) {
        const texts = [pickCommand(s.id, t), ...scriptFor(s.id, t).map((x) => (x.k === 'line' ? x.text : x.k === 'bar' ? x.label : ''))];
        for (const x of texts) expect(x).not.toMatch(/undefined|NaN|\$\{/);
      }
      const n = noiseLine();
      expect(n.k === 'line' && n.text).not.toMatch(/undefined|NaN/);
    }
    for (const s of SNIPPETS) expect(compileScript(s).length).toBeGreaterThan(0);
  });

  it('連続して同じターゲットにならない', () => {
    let t = newTarget();
    for (let i = 0; i < 50; i++) {
      const n = newTarget(t);
      expect(n.name).not.toBe(t.name);
      t = n;
    }
  });
});

describe('highlight', () => {
  it('入力途中のコードでも元の文字列を失わない', () => {
    for (const s of SNIPPETS) {
      for (let n = 0; n <= s.code.length; n += 7) {
        const html = highlight(s.code.slice(0, n), s.lang);
        const text = html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        expect(text).toBe(s.code.slice(0, n));
      }
    }
  });
});

describe('Scheduler', () => {
  it('期限順に実行し、タグ単位で取り消せる', () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.after(20, () => log.push('b'));
    s.after(10, () => log.push('a'));
    s.after(15, () => log.push('x'), 'cancel-me');
    s.cancel('cancel-me');
    s.update(30);
    expect(log).toEqual(['a', 'b']);
    expect(s.size).toBe(0);
  });
});
