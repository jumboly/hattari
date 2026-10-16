// シネマモードの台本。1 拍 = 1 回のコマンド実行で、字幕・コマンド・実行後の展開を決めておく。
// 演出そのものは Hack の既存の流れ（ステージ突破・逆探知・フィナーレ）を呼ぶだけにして、台本はデータに徹する。
import { bar, L, scriptFor, SNIPPETS, type Snippet, type Step, type Target } from './content';

/** 実行後の展開。stage はステージ突破（5 回目でフィナーレへ）、trace は逆探知 */
export type After = 'next' | 'stage' | 'trace';

export interface Beat {
  caption: string;
  cmd?: string;
  code?: Snippet;
  script?: (t: Target) => Step[];
  after?: After;
}

export interface Scenario {
  id: string;
  title: string;
  sub: string;
  target: Target;
  finale: { title: string; sub: string };
  beats: Beat[];
}

const snippet = (file: string) => SNIPPETS.find((s) => s.file === file)!;

export const SCENARIOS: Scenario[] = [
  {
    id: 'oracle',
    title: 'OPERATION ORACLE',
    sub: '極秘コンストラクトへの侵入',
    target: { name: 'ORACLE', node: 'NODE-0RAC', sector: 'SECTOR 00-Z' },
    finale: { title: 'ACCESS GRANTED', sub: 'THE ORACLE IS SPEAKING' },
    beats: [
      { caption: 'ORACLE——メッシュの最深部。まだ誰も辿り着いていない。', cmd: 'meshscope --sweep "SECTOR 00-Z" --resolution ultra', script: (t) => scriptFor('scan', t), after: 'stage' },
      { caption: '接続を確立しろ。痕跡は一つも残すな。', cmd: 'neuralink --sync node-0rac --bandwidth 160tb --ghost', script: (t) => scriptFor('sync', t), after: 'stage' },
      { caption: '七層の ICE。並の腕なら、一層目で脳を焼かれる。', cmd: 'ice.dissolve --layer 7 --pattern fractal', script: (t) => scriptFor('ice', t) },
      {
        caption: '……待て。誰かがこちらを見ている。',
        cmd: './blackglass --mirror ice-7f3a --refract 1.618',
        script: () => [L('[*] Refracting ICE layer 4...', 'info'), L('[!] Anomalous observer on the mesh', 'warn'), L('[!] Signal pattern matches: SENTINEL-class watcher', 'err')],
        after: 'trace',
      },
      { caption: '振り切った。今のうちに防壁を抜ける。', cmd: 'cascade --virus chrome-wolf --seed 0x0bad5eed', script: (t) => scriptFor('ice', t), after: 'stage' },
      { caption: '最後の鍵は、自分の手で書くしかない。', code: snippet('lattice.rs') },
      { caption: 'コアに共鳴させる。ここからは一瞬の勝負だ。', cmd: 'resonate --core oracle --frequency 777.7hz', script: (t) => scriptFor('core', t), after: 'stage' },
      { caption: '格子暗号、展開。……開け。', cmd: 'latticebreak --dimension 4096 --qubits all', script: (t) => scriptFor('cipher', t), after: 'stage' },
    ],
  },
  {
    id: 'signal',
    title: 'LAST SIGNAL',
    sub: '消えた仲間の意識を取り戻せ',
    target: { name: 'ECHO-NINE', node: 'NODE-E9E9', sector: 'SECTOR 41-K' },
    finale: { title: 'SYNC COMPLETE', sub: 'WELCOME BACK, NINE' },
    beats: [
      { caption: '三日前、ナインは潜ったまま戻らなかった。', cmd: 'sonar.ping(grid: "deep", harmonics: 9)', script: (t) => scriptFor('scan', t) },
      { caption: '微かなエコー……まだ生きてる。', cmd: './wraith locate --construct echo-nine --echo-depth 12', script: (t) => [...scriptFor('scan', t), L('[+] Faint neural echo: pattern matches NINE (82.4%)', 'ok')], after: 'stage' },
      { caption: '彼女の波形に同期する。', cmd: 'jack.in(construct: "ECHO-NINE", shield: true)', script: (t) => scriptFor('sync', t), after: 'stage' },
      { caption: '牢獄の ICE を書き換えるコードが要る。', code: snippet('ice_mirror.c'), after: 'stage' },
      {
        caption: 'まずい、看守に気づかれた！',
        cmd: './mindbridge --carrier lattice-9 --phase-lock',
        script: () => [L('[*] Opening carrier to NINE...', 'info'), L('[!] Warden process awakened', 'warn'), L('[!] Counter-trace inbound', 'err')],
        after: 'trace',
      },
      { caption: '共鳴させて、彼女をこちら側へ引き上げる。', cmd: 'resonate --core echo-nine --frequency 432.0hz', script: (t) => scriptFor('core', t), after: 'stage' },
      {
        caption: '最後の錠。彼女の記憶そのものが鍵だ。',
        cmd: './rosetta --decode memories.qx --ancient',
        script: (t) => [...scriptFor('cipher', t), bar('Restoring consciousness', 1600), L('[+] NINE: "......遅いよ。"', 'hi')],
        after: 'stage',
      },
    ],
  },
  {
    id: 'vault',
    title: 'BLACK VAULT',
    sub: '72 時間の金庫破り',
    target: { name: 'MONOLITH', node: 'NODE-B1AC', sector: 'SECTOR 72-X' },
    finale: { title: 'DECRYPTION COMPLETE', sub: 'THE VAULT IS OPEN' },
    beats: [
      { caption: 'モノリス。世界で最も固い、と言われている金庫。', cmd: './wraith locate --construct monolith --echo-depth 7', script: (t) => scriptFor('scan', t), after: 'stage' },
      { caption: '正面からは入らない。裏口を作る。', code: snippet('resonator.js') },
      { caption: '回線を繋げ。時間は 72 時間しかない。', cmd: './tunnelrat --bounce 13 --nodes tokyo,oslo,lima,cairo', script: (t) => [L('[*] Bouncing through 13 relays...', 'info'), ...scriptFor('sync', t)], after: 'stage' },
      {
        caption: '警報が鳴った。思ったより早い。',
        cmd: 'ice.dissolve --layer 5 --pattern fractal',
        script: () => [L('[!] Vault ICE responded in 0.3s', 'warn'), L('[!] Sentinel deployed', 'err')],
        after: 'trace',
      },
      { caption: '凍った防壁を、鏡で割る。', cmd: './blackglass --mirror ice-b1ac --refract 2.718', script: (t) => scriptFor('ice', t), after: 'stage' },
      { caption: '金庫の心臓に、こちらの鼓動を重ねる。', cmd: 'core.handshake(sigil: 0xdeadfa11b1ac)', script: (t) => scriptFor('core', t), after: 'stage' },
      {
        caption: '最後のダイヤル。息を止めろ。',
        cmd: 'quantum.fold(key_space: "infinite", entropy: 99.9)',
        script: (t) => [...scriptFor('cipher', t), bar('Turning the final dial', 1800)],
        after: 'stage',
      },
    ],
  },
];

/** 台本の進行位置を持つだけの小さなクラス */
export class Director {
  private i = 0;
  constructor(readonly scenario: Scenario) {}

  get beat(): Beat {
    return this.scenario.beats[Math.min(this.i, this.scenario.beats.length - 1)];
  }

  next() {
    this.i++;
  }
}
