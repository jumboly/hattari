// テーマ = 配色とデジタルレインの文字種のセット。
// 動作モードとは独立させ、CSS 変数と Canvas 用パレットの両方を 1 か所で切り替える。
export interface Theme {
  id: string;
  label: string;
  vars: Record<string, string>;
  canvas: { fg: string; dim: string; hi: string; alert: string };
  rain: { glyphs: string; body: string; head: string; glow: string };
}

export const THEMES: Theme[] = [
  {
    id: 'matrix',
    label: 'MATRIX',
    vars: {},
    canvas: { fg: '#3dff7f', dim: 'rgba(61,255,127,0.28)', hi: '#e6fff0', alert: '#ff3b5c' },
    rain: { glyphs: 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:."=*+-<>¦╌', body: '#2bff6e', head: '#e6fff0', glow: '#3dff7f' },
  },
  {
    id: 'retro',
    label: 'RETRO',
    vars: {
      '--fg': '#ffb341',
      '--fg-rgb': '255, 179, 65',
      '--hi-rgb': '255, 241, 214',
      '--amb-rgb': '90, 50, 10',
      '--fg-dim': '#99641c',
      '--fg-faint': '#4a2f0a',
      '--hi': '#fff1d6',
      '--glow': '0 0 4px rgba(255,179,65,0.8), 0 0 14px rgba(255,140,30,0.3)',
    },
    canvas: { fg: '#ffb341', dim: 'rgba(255,179,65,0.28)', hi: '#fff1d6', alert: '#ff3b5c' },
    // 80 年代端末らしく、カナではなく英数字と記号だけで降らせる
    rain: { glyphs: '0123456789ABCDEF#$%&*+-/<>=?@[]{}|~', body: '#ff9d1f', head: '#fff1d6', glow: '#ffb341' },
  },
  {
    id: 'hollywood',
    label: 'HOLLYWOOD',
    vars: {
      '--fg': '#58d5ff',
      '--fg-rgb': '88, 213, 255',
      '--fg-dim': '#2a6f8f',
      '--fg-faint': '#123447',
      '--hi': '#eefaff',
      '--hi-rgb': '238, 250, 255',
      '--amb-rgb': '10, 50, 90',
      '--glow': '0 0 4px rgba(88,213,255,0.8), 0 0 16px rgba(88,213,255,0.3)',
    },
    canvas: { fg: '#58d5ff', dim: 'rgba(88,213,255,0.28)', hi: '#eefaff', alert: '#ff3b5c' },
    // 映画の「解析中」画面によくある 16 進数の滝
    rain: { glyphs: '0123456789ABCDEF', body: '#3fa9e0', head: '#eefaff', glow: '#58d5ff' },
  },
  {
    id: 'cyberpunk',
    label: 'CYBERPUNK',
    vars: {
      '--fg': '#ff3fd2',
      '--fg-rgb': '255, 63, 210',
      '--fg-dim': '#8f2a7a',
      '--fg-faint': '#3d1036',
      '--hi': '#7ffcff',
      '--hi-rgb': '127, 252, 255',
      '--amb-rgb': '80, 10, 70',
      '--glow': '0 0 4px rgba(255,63,210,0.8), 0 0 16px rgba(255,63,210,0.35)',
    },
    canvas: { fg: '#ff3fd2', dim: 'rgba(255,63,210,0.28)', hi: '#7ffcff', alert: '#ffe14d' },
    // 漢字・カナ・記号の混ざったネオン看板のような雨
    rain: { glyphs: '電脳網路接続侵入暗号解錠夜街光ｱｲｳｴｵｶｷｸｹｺ0123456789#$%&', body: '#ff3fd2', head: '#7ffcff', glow: '#7ffcff' },
  },
];

export let theme = THEMES[0];

export function applyTheme(t: Theme) {
  theme = t;
  const root = document.documentElement;
  for (const th of THEMES) for (const k of Object.keys(th.vars)) root.style.removeProperty(k);
  for (const [k, v] of Object.entries(t.vars)) root.style.setProperty(k, v);
  document.body.dataset.theme = t.id;
}
