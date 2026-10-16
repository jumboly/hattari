// サウンドラボ：効果音を個別・場面単位で試聴し、音量を数値で比べるための開発用ページ。
// 本編と同じ Sfx を使い、OfflineAudioContext で書き出して計測するので、耳と数値の両方で調整できる。
import { Sfx } from './audio';

type Cue = [number, (s: Sfx) => void];
interface Item {
  name: string;
  note: string;
  len: number;
  cues: Cue[];
}

const one = (name: string, note: string, fn: (s: Sfx) => void, len = 2): Item => ({ name, note, len, cues: [[0, fn]] });

const SOUNDS: Item[] = [
  one('key', 'キー入力（勢い 0）', (s) => s.key(0), 0.5),
  one('key (hot)', 'キー入力（勢い 1）', (s) => s.key(1), 0.5),
  one('backspace', 'Backspace', (s) => s.backspace(), 0.5),
  one('enter', 'コマンド実行', (s) => s.enter(), 1.5),
  one('tick', 'ログ 1 行', (s) => s.tick('out'), 0.3),
  one('ok', '[+] 成功行', (s) => s.ok(), 1),
  one('warn', '[!] 警告行', (s) => s.warn(), 1),
  one('scanBlip', '進捗バーの電子音', (s) => s.scanBlip(0.5), 0.3),
  one('stageClear', 'ステージ突破', (s) => s.stageClear(), 2),
  one('alarm', '逆探知アラーム', (s) => s.alarm(), 1.5),
  one('counter', '対抗措置（連打）', (s) => s.counter(0.5), 0.5),
  one('glitch', '画面グリッチ', (s) => s.glitch(), 1),
  one('boom', 'フィナーレの一撃', (s) => s.boom(), 5),
  { name: 'ambient', note: '環境音ドローン（立ち上がり 4 秒）', len: 6, cues: [] },
  one('crumble', '文字が崩れ落ちる', (s) => s.crumble(), 2),
];

const range = (n: number, f: (i: number) => Cue): Cue[] => Array.from({ length: n }, (_, i) => f(i));

const SCENES: Item[] = [
  { name: 'typing', note: '普通の打鍵 6 打/秒 × 3 秒', len: 3.5, cues: range(18, (i) => [i / 6, (s) => s.key(0.4)]) },
  { name: 'mashing', note: '全力連打 14 打/秒 × 3 秒', len: 3.5, cues: range(42, (i) => [i / 14, (s) => s.key(1)]) },
  {
    name: 'execute',
    note: 'Enter → ログが流れて成功',
    len: 3,
    cues: [[0, (s) => s.enter()], ...range(14, (i): Cue => [0.15 + i * 0.09, (s) => s.tick(i % 3 ? 'dim' : 'out')]), ...range(12, (i): Cue => [1.0 + i * 0.07, (s) => s.scanBlip(i / 12)]), [1.9, (s) => s.ok()]],
  },
  { name: 'stage', note: 'ステージ突破', len: 2.5, cues: [[0, (s) => s.ok()], [0.3, (s) => s.stageClear()]] },
  {
    name: 'trace',
    note: '逆探知 → 連打で振り切る',
    len: 4.5,
    cues: [[0, (s) => s.alarm()], [0, (s) => s.glitch()], ...range(36, (i): Cue => [0.6 + i * 0.07, (s) => s.counter(1 - i / 36)]), [1.75, (s) => s.alarm(0.5)], [3.2, (s) => s.stageClear()]],
  },
  {
    name: 'finale',
    note: '静寂 → 一撃 → 崩落',
    len: 7.5,
    cues: [[0, (s) => s.ok()], [0.4, (s) => s.hush(1300)], [1.7, (s) => s.boom()], [5.1, (s) => s.crumble()]],
  },
];

// ---------- 再生 ----------
let live: Sfx | undefined;
let ambient = false;
function liveSfx() {
  if (!live) {
    live = new Sfx();
    live.attach(new AudioContext(), ambient);
  }
  return live;
}
function play(item: Item) {
  const s = liveSfx();
  for (const [t, fn] of item.cues) setTimeout(() => fn(s), t * 1000);
}

// ---------- 計測 ----------
const db = (x: number) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

async function measure(item: Item) {
  const sr = 44100;
  // 起動直後はコンプレッサの検出器が落ち着いておらず音が小さく出るため、全体を少し遅らせて書き出す
  const PRE = 0.25;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * (item.len + PRE)), sr);
  const s = new Sfx();
  s.attach(ctx, item.name === 'ambient');
  // suspend で時刻を止めてから呼ぶことで、本番と同じ「今鳴らす」API のまま時間差のある場面を書き出せる
  // suspend で時刻を止めてから呼ぶことで、本番と同じ「今鳴らす」API のまま時間差のある場面を書き出せる。
  // suspend は 128 サンプル境界・同一フレーム 1 回までなので、量子化した時刻ごとにまとめる
  const q = (t: number) => (Math.round((t * sr) / 128) * 128) / sr;
  const groups = new Map<number, Cue[]>();
  for (const c of item.cues) {
    const k = q(c[0] + PRE);
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  for (const [k, cues] of groups) {
    ctx.suspend(k).then(() => {
      for (const [, fn] of cues) fn(s);
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  const ch = buf.getChannelData(0);
  let peak = 0;
  let maxRms = 0;
  const win = 2206; // 約 50ms（偶数にして半窓ずらしを整数にする）
  for (let i = 0; i + win <= ch.length; i += win / 2) {
    let sum = 0;
    for (let j = i; j < i + win; j++) {
      sum += ch[j] * ch[j];
      peak = Math.max(peak, Math.abs(ch[j]));
    }
    maxRms = Math.max(maxRms, Math.sqrt(sum / win));
  }
  const prof: number[] = [];
  for (let i = 0; i + win <= ch.length; i += win) {
    let m = 0;
    for (let j = i; j < i + win; j++) m = Math.max(m, Math.abs(ch[j]));
    prof.push(Math.round(db(m)));
  }
  return { rms: db(maxRms), peak: db(peak), prof };
}

function render(id: string, items: Item[]) {
  const table = document.getElementById(id)!;
  table.innerHTML = '<tr><th></th><th>name</th><th>RMS(50ms)</th><th>peak</th><th>note</th></tr>';
  for (const it of items) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><button>▶</button></td><td>${it.name}</td><td class="rms">…</td><td class="pk">…</td><td>${it.note}</td>`;
    tr.querySelector('button')!.addEventListener('click', () => play(it));
    table.appendChild(tr);
    void measure(it).then(({ rms, peak, prof }) => {
      const r = tr.querySelector('.rms')!;
      r.textContent = rms.toFixed(1);
      r.className = rms > -12 ? 'hot' : rms < -36 ? 'cold' : '';
      tr.querySelector('.pk')!.textContent = peak.toFixed(1);
      tr.dataset.rms = rms.toFixed(1);
      tr.dataset.peak = peak.toFixed(1);
      tr.dataset.prof = prof.join(',');
    });
  }
}

document.getElementById('amb')!.addEventListener('change', (e) => {
  ambient = (e.target as HTMLInputElement).checked;
  live = undefined; // 環境音の有無はグラフ構築時に決まるので作り直す
});
render('scenes', SCENES);
render('sounds', SOUNDS);
