// 画面に流すコマンド・ログ・コードの素材。
// 現実の手順を連想させないよう、語彙はすべて架空の SF サイバースペース用語（ICE・ニューラルメッシュ・格子暗号など）で構成し、
// 書式（タイムスタンプ・ステータス記号・進捗バー）だけを本物のターミナルに寄せてリアリティを出している。
import { hex, int, pick } from './rand';

export type LineCls = 'out' | 'info' | 'ok' | 'warn' | 'err' | 'dim' | 'hi';

export type Step =
  | { k: 'line'; text: string; cls?: LineCls; gap?: number }
  | { k: 'bar'; label: string; ms: number }
  | { k: 'pause'; ms: number };

export interface Target {
  name: string;
  node: string;
  sector: string;
}

export const STAGES = [
  { id: 'scan', label: 'SCAN', banner: 'CONSTRUCT LOCATED' },
  { id: 'sync', label: 'SYNC', banner: 'NEURAL LINK STABLE' },
  { id: 'ice', label: 'ICE', banner: 'ICE DISSOLVED' },
  { id: 'core', label: 'CORE', banner: 'CORE RESONANCE' },
  { id: 'cipher', label: 'CIPHER', banner: 'LATTICE UNLOCKED' },
] as const;
export type StageId = (typeof STAGES)[number]['id'];

export const FINALES = [
  { title: 'ACCESS GRANTED', sub: 'WELCOME TO THE CONSTRUCT' },
  { title: 'DECRYPTION COMPLETE', sub: 'THE LATTICE IS OPEN' },
  { title: 'CORE ONLINE', sub: 'THE GRID ANSWERS TO YOU' },
  { title: 'SYNC COMPLETE', sub: 'YOU ARE THE SIGNAL NOW' },
];

const CONSTRUCTS = ['ORACLE', 'AZIMUTH', 'LABYRINTH', 'CHIMERA', 'HALCYON', 'MONOLITH', 'SERAPH', 'ECHO-NINE'];

export function newTarget(prev?: Target): Target {
  let name = pick(CONSTRUCTS);
  while (prev && name === prev.name) name = pick(CONSTRUCTS);
  return { name, node: `NODE-${hex(4).toUpperCase()}`, sector: `SECTOR ${int(1, 99)}-${pick(['A', 'C', 'K', 'X', 'Z'])}` };
}

// ---------- コマンド ----------
type Cmd = (t: Target) => string;
const COMMANDS: Record<StageId, Cmd[]> = {
  scan: [
    (t) => `meshscope --sweep "${t.sector}" --resolution ultra`,
    (t) => `./wraith locate --construct ${t.name.toLowerCase()} --echo-depth ${int(5, 12)}`,
    () => `sonar.ping(grid: "deep", harmonics: ${int(3, 9)})`,
  ],
  sync: [
    (t) => `neuralink --sync ${t.node.toLowerCase()} --bandwidth ${pick(['40', '80', '160'])}tb`,
    () => `./mindbridge --carrier lattice-${int(2, 9)} --phase-lock`,
    (t) => `jack.in(construct: "${t.name}", shield: true)`,
  ],
  ice: [
    () => `ice.dissolve --layer ${int(3, 7)} --pattern fractal`,
    () => `./blackglass --mirror ice-${hex(4)} --refract 1.618`,
    () => `cascade --virus chrome-wolf --seed 0x${hex(8)}`,
  ],
  core: [
    (t) => `resonate --core ${t.name.toLowerCase()} --frequency ${int(400, 999)}.${int(0, 9)}hz`,
    () => `./ascend --conduit omega --depth max`,
    () => `core.handshake(sigil: 0x${hex(12)})`,
  ],
  cipher: [
    () => `latticebreak --dimension ${pick([512, 1024, 4096])} --qubits all`,
    () => `quantum.fold(key_space: "infinite", entropy: ${int(90, 99)}.${int(0, 9)})`,
    () => `./rosetta --decode glyphstream.qx --ancient`,
  ],
};

export const EXTRA_FLAGS = ['--overclock', '--silent', '-vvv', '--threads=1024', '--ghost', '--deep', '--burst', '--no-echo', '--hyperthread'];

export function pickCommand(stage: StageId, t: Target): string {
  return pick(COMMANDS[stage])(t);
}

// ---------- 出力スクリプト ----------
const L = (text: string, cls: LineCls = 'out', gap?: number): Step => ({ k: 'line', text, cls, gap });
const bar = (label: string, ms = int(700, 1400)): Step => ({ k: 'bar', label, ms });
const pause = (ms: number): Step => ({ k: 'pause', ms });
const ts = () => `[${String(int(10, 9999)).padStart(4, ' ')}.${String(int(0, 999999)).padStart(6, '0')}]`;
const pct = () => `${int(60, 99)}.${int(0, 9)}%`;

export function glyphDump(rows: number): Step[] {
  const out: Step[] = [];
  let off = int(0, 0xfff) * 16;
  for (let r = 0; r < rows; r++) {
    const bytes = Array.from({ length: 16 }, () => hex(2));
    const glyph = bytes.map((b) => '░▒▓█◇◆○●△▽□■ﾊﾐﾋｰｳｼﾅ'[parseInt(b, 16) % 19]).join('');
    out.push(L(`${off.toString(16).padStart(8, '0')}  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}  ${glyph}`, 'dim', 18));
    off += 16;
  }
  return out;
}

// ステージごとに語彙を変えることで、Enter を押すたびに「物語が進んでいる」と感じさせる
const SCRIPTS: Record<StageId, (t: Target) => Step[]> = {
  scan: (t) => [
    L(`[*] meshscope 9.1 initialized — scanning ${t.sector}`, 'info'),
    L(`${ts()} grid: echo returned from ${int(1200, 9800)} nodes`, 'dim'),
    bar('Mapping neural mesh'),
    L(`  NODE        SIGNAL    STATUS      CLASS`, 'hi'),
    L(`  ${t.node}   -${int(20, 40)}db     ACTIVE      CONSTRUCT`, 'out'),
    L(`  NODE-${hex(4).toUpperCase()}   -${int(50, 80)}db     DORMANT     RELAY`, 'dim'),
    L(`  NODE-${hex(4).toUpperCase()}   -${int(50, 80)}db     SHIELDED    ???`, 'warn'),
    L(`[+] Construct "${t.name}" resolved at ${t.node}`, 'ok'),
  ],
  sync: (t) => [
    L(`[*] Opening carrier wave to ${t.node}...`, 'info'),
    L(`${ts()} >> phase ${hex(8)} :: carrier locked`, 'dim'),
    L(`${ts()} << echo  ${hex(8)} :: drift ${int(1, 9)}.${int(0, 99)}ms`, 'dim'),
    bar('Synchronizing neural pattern'),
    L(`[*] Dendrite match ${pct()}`, 'info'),
    L(`[+] Neural bridge stable — session ${hex(12)}`, 'ok'),
  ],
  ice: () => [
    L(`[!] Intrusion Countermeasure Electronics detected`, 'warn'),
    ...Array.from({ length: int(3, 5) }, (_, i) => L(`    ICE layer ${i + 1}/7  ........  ${pick(['DISSOLVED', 'REFRACTED', 'SHATTERED'])}`, 'out', 80)),
    bar('Rewriting ICE topology'),
    L(`[+] Black ICE neutralized — ${int(3, 7)} sentries asleep`, 'ok'),
  ],
  core: (t) => [
    L(`[*] Tuning resonance to core "${t.name}"`, 'info'),
    ...Array.from({ length: int(3, 5) }, () => L(`${ts()} core: harmonic ${int(1, 64)} aligned (${pct()})`, 'dim', 40)),
    bar('Amplifying core resonance'),
    L(`[+] Conduit open: ghost -> ${t.name.toLowerCase()}::sovereign`, 'ok'),
  ],
  cipher: () => [
    L(`[*] Folding lattice key space (dimension ${pick([512, 1024, 4096])})`, 'info'),
    ...glyphDump(int(4, 7)),
    bar('Collapsing quantum states'),
    L(`[+] KEY FRAGMENT ${int(1, 9)}/9  ${hex(8).toUpperCase()}-${hex(8).toUpperCase()}`, 'ok'),
  ],
};

export function scriptFor(stage: StageId, t: Target): Step[] {
  return SCRIPTS[stage](t);
}

// 連打中に差し込む細かいノイズ行。単調にならないよう書式を混ぜる
export function noiseLine(): Step {
  return pick([
    () => L(`${ts()} mesh: packet ${hex(6)} routed via ${pick(['tokyo', 'oslo', 'lima', 'cairo', 'tallinn'])}-relay`, 'dim', 0),
    () => L(`${ts()} sync: ${hex(4)}:${hex(4)}:${hex(4)} ok`, 'dim', 0),
    () => L(`  >> ${hex(8)} ${hex(8)} ${hex(8)} ${hex(8)}`, 'dim', 0),
    () => L(`${ts()} entropy pool ${pct()}`, 'dim', 0),
  ])();
}

export const finaleLead = (t: Target): Step[] => [
  L(`[*] All barriers down. Reaching for ${t.name}...`, 'hi'),
  pause(200),
];

// ---------- コード ----------
// 実行はされないが「それっぽい」構文になる架空プログラム
export interface Snippet {
  file: string;
  lang: 'python' | 'rust' | 'c' | 'js';
  code: string;
}

export const SNIPPETS: Snippet[] = [
  {
    file: 'lattice.rs',
    lang: 'rust',
    code: `use quantum::{Lattice, Qubit};

/// Collapse the lattice until a stable key emerges.
fn collapse(lattice: &mut Lattice, depth: u32) -> Option<[u8; 64]> {
    let mut entropy = lattice.entropy();
    for layer in 0..depth {
        let qubits: Vec<Qubit> = lattice.fold(layer).collect();
        entropy = qubits.iter().fold(entropy, |e, q| e ^ q.phase());
        if entropy.is_resonant() {
            return Some(lattice.harvest(layer));
        }
    }
    None
}
`,
  },
  {
    file: 'wraith.py',
    lang: 'python',
    code: `import numpy as np
from mesh import Construct, Echo

class Wraith:
    """Rides the echo through the neural mesh."""

    def __init__(self, construct: Construct, depth: int = 7):
        self.construct = construct
        self.echoes = np.zeros((depth, 256), dtype=np.complex128)

    def listen(self) -> Echo:
        for i, wave in enumerate(self.construct.harmonics()):
            self.echoes[i % len(self.echoes)] += np.fft.fft(wave)
        return Echo(signal=self.echoes.mean(axis=0))
`,
  },
  {
    file: 'ice_mirror.c',
    lang: 'c',
    code: `#include <stdint.h>
#include "ice.h"

/* Reflect every ICE pulse back into its own pattern. */
static int mirror_layer(ice_layer_t *layer, uint64_t seed)
{
    uint64_t phase = seed ^ 0x9E3779B97F4A7C15ULL;
    for (size_t i = 0; i < layer->width; i++) {
        layer->cells[i] = (layer->cells[i] >> 3) ^ (phase & 0xFF);
        phase = (phase << 7) | (phase >> 57);
    }
    return layer->integrity < ICE_THRESHOLD ? ICE_DISSOLVED : ICE_ACTIVE;
}
`,
  },
  {
    file: 'resonator.js',
    lang: 'js',
    code: `import { Core, harmonic } from './grid.js';

// Sweep frequencies until the core sings back.
export async function resonate(core, { from = 400, to = 999 } = {}) {
  for (let hz = from; hz <= to; hz += 0.5) {
    const echo = await core.pulse(harmonic(hz));
    if (echo.amplitude > core.threshold * 1.618) {
      console.log(\`[+] resonance locked at \${hz.toFixed(1)}hz\`);
      return { hz, conduit: core.open(echo) };
    }
  }
  throw new Error('core silent');
}
`,
  },
];

export const compileScript = (s: Snippet): Step[] => {
  const cmd = { rust: `cargo build --release`, python: `python3 -m mesh.load ${s.file}`, c: `cc -O3 ${s.file} -o ice_mirror`, js: `node --experimental-grid ${s.file}` }[s.lang];
  return [
    L(`$ ${cmd}`, 'hi'),
    L(`   Compiling ${s.file} (${int(2, 9)} modules)`, 'dim', 60),
    bar('Building', int(500, 900)),
    L(`[+] ${s.file} loaded into the construct`, 'ok'),
  ];
};
