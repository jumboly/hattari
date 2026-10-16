import type { LineCls, Snippet } from './content';

// 長時間のデモ動作でも DOM が肥大化しないよう、保持する行数に上限を設ける
export const MAX_LINES = 160;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KEYWORDS: Record<Snippet['lang'], string[]> = {
  rust: ['use', 'fn', 'let', 'mut', 'for', 'in', 'if', 'return', 'None', 'Some', 'pub', 'struct', 'impl'],
  python: ['import', 'from', 'class', 'def', 'self', 'for', 'in', 'return', 'if', 'as'],
  c: ['include', 'static', 'int', 'for', 'return', 'size_t', 'uint64_t', 'if', 'void'],
  js: ['import', 'from', 'export', 'async', 'function', 'const', 'let', 'for', 'await', 'if', 'return', 'throw', 'new'],
};

const TOKEN = /(\/\/.*|\/\*.*?(?:\*\/|$)|#(?!include).*|"""[^]*?(?:"""|$))|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b0x[0-9A-Fa-f]+\w*|\b\d+(?:\.\d+)?\b)|(#include|\b[A-Za-z_]\w*\b)(\s*\()?/g;

/** 入力途中のコードでも崩れないよう、未閉じの文字列やコメントも許容する簡易ハイライタ */
export function highlight(src: string, lang: Snippet['lang']): string {
  const kw = new Set(KEYWORDS[lang]);
  let out = '';
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index));
    last = m.index! + m[0].length;
    if (m[1]) out += `<span class="c-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="c-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="c-num">${esc(m[3])}</span>`;
    else if (m[4]) {
      const w = m[4];
      const cls = kw.has(w) || w === '#include' ? 'c-kw' : m[5] ? 'c-fn' : /^[A-Z]/.test(w) ? 'c-ty' : '';
      out += cls ? `<span class="${cls}">${esc(w)}</span>` : esc(w);
      if (m[5]) out += esc(m[5]);
    }
  }
  return out + esc(src.slice(last));
}

export interface BarHandle {
  update(p: number): void;
}

export class Terminal {
  readonly el: HTMLElement;
  private lines: HTMLElement[] = [];

  constructor(el: HTMLElement) {
    this.el = el;
  }

  private push(node: HTMLElement) {
    this.el.appendChild(node);
    this.lines.push(node);
    while (this.lines.length > MAX_LINES) this.lines.shift()!.remove();
    this.scroll();
  }

  scroll() {
    this.el.scrollTop = this.el.scrollHeight;
  }

  get lineCount() {
    return this.lines.length;
  }

  line(text: string, cls: LineCls = 'out') {
    const d = document.createElement('div');
    d.className = `ln ${cls} enter`;
    d.textContent = text || ' ';
    this.push(d);
    return d;
  }

  bar(label: string): BarHandle {
    const d = this.line('', 'info');
    const width = 28;
    return {
      update(p: number) {
        const n = Math.round(p * width);
        d.textContent = `[*] ${label.padEnd(30, ' ')} [${'█'.repeat(n)}${'░'.repeat(width - n)}] ${String(Math.floor(p * 100)).padStart(3)}%`;
        if (p >= 1) d.className = 'ln ok';
      },
    };
  }

  /** プロンプト行。タイピング中は同じ要素を書き換え続ける */
  prompt(user: string) {
    const d = document.createElement('div');
    d.className = 'ln prompt';
    this.push(d);
    const head = `<span class="ps1">${esc(user)}</span><span class="ps2">:~$</span> `;
    return {
      set: (text: string, hint = false) => {
        d.innerHTML = `${head}<span class="cmd">${esc(text)}</span><span class="cursor"></span>${hint ? '<span class="hint">⏎ EXECUTE</span>' : ''}`;
        this.scroll();
      },
      done: (text: string) => {
        d.innerHTML = `${head}<span class="cmd">${esc(text)}</span>`;
      },
    };
  }

  /** エディタ風のブロック。末尾の行番号とハイライトを毎回描き直す（高々20行なので十分軽い） */
  code(snippet: Snippet) {
    const box = document.createElement('div');
    box.className = 'codebox';
    box.innerHTML = `<div class="codehead">── ${esc(snippet.file)} ── [${snippet.lang}] ─── INSERT ──</div><pre></pre>`;
    const pre = box.querySelector('pre')!;
    this.push(box);
    return {
      set: (n: number) => {
        const src = snippet.code.slice(0, n);
        const rows = highlight(src, snippet.lang).split('\n');
        pre.innerHTML = rows.map((r, i) => `<span class="lno">${String(i + 1).padStart(3)}</span> ${r}`).join('\n') + '<span class="cursor"></span>';
        this.scroll();
      },
      close: () => box.classList.add('closed'),
    };
  }

  clear() {
    for (const l of this.lines) l.remove();
    this.lines = [];
  }
}
