import { fetchHistoryMatch } from '../historyPreflight';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Theme } from '@mui/material/styles';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControl,
  FormControlLabel,
  FormLabel,
  IconButton,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Slider,
  TextField,
  Typography,
  alpha,
} from '@mui/material';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import type { SceneShape } from './VisualizeShapes';
import { VisualizeShapesLayer } from './VisualizeShapes';

const SHAPE_SEL_PREFIX = 'shape:';

const VIEW_W = 1000;
const VIEW_H = 700;
const NODE_R = 34;

type SceneNode = {
  id: string;
  label: string;
  sublabel?: string | null;
  x: number;
  y: number;
  kind: string;
};

type SceneEdge = {
  id: string;
  from_id: string;
  to_id: string;
  kind: string;
};

/** One editable frame (mechanism step or static scene). */
type FrameSnapshot = {
  stepLabel: string;
  stepDetail?: string | null;
  nodes: SceneNode[];
  positions: Record<string, { x: number; y: number }>;
  edges: SceneEdge[];
  shapes: SceneShape[];
  /** User drag offsets for shapes (logical coords stay fixed for reset). */
  shapeOffsets?: Record<string, { x: number; y: number }>;
};

type ApiFrame = {
  step_label: string;
  step_detail?: string | null;
  nodes: SceneNode[];
  edges: SceneEdge[];
  shapes?: SceneShape[] | null;
};

type SceneApiResponse = {
  plan?: string | null;
  title: string;
  caption?: string | null;
  nodes: SceneNode[] | null;
  edges: SceneEdge[] | null;
  shapes?: SceneShape[] | null;
  frames: ApiFrame[] | null;
  used_llm: boolean;
};

type VisualMode = 'default' | 'realism' | 'polygon_only';

function positionsFromNodes(nodes: SceneNode[]): Record<string, { x: number; y: number }> {
  const pos: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) pos[n.id] = { x: n.x, y: n.y };
  return pos;
}

function normalizeEdges(edges: SceneEdge[]): SceneEdge[] {
  return edges.map((e) => ({ ...e, id: e.id || `${e.from_id}-${e.to_id}` }));
}

function snapshotFromNodesEdges(
  nodes: SceneNode[],
  edges: SceneEdge[],
  stepLabel = 'Scene',
  stepDetail?: string | null,
  shapes: SceneShape[] = [],
): FrameSnapshot {
  return {
    stepLabel,
    stepDetail: stepDetail ?? null,
    nodes,
    positions: positionsFromNodes(nodes),
    edges: normalizeEdges(edges),
    shapes: shapes.map((s) => ({ ...s })),
    shapeOffsets: {},
  };
}

function apiFramesToSnapshots(frames: ApiFrame[]): FrameSnapshot[] {
  return frames.map((fr) =>
    snapshotFromNodesEdges(
      Array.isArray(fr.nodes) ? fr.nodes : [],
      Array.isArray(fr.edges) ? fr.edges : [],
      fr.step_label,
      fr.step_detail ?? null,
      Array.isArray(fr.shapes) ? fr.shapes : [],
    ),
  );
}

/** Offline demo: catalytic hydrogenation schematic (5 frames). */
const SAMPLE_HYDROGENATION_FRAMES: FrameSnapshot[] = [
  snapshotFromNodesEdges(
    [
      { id: 'alkene', label: 'C2H4', sublabel: 'alkene', x: 260, y: 260, kind: 'molecule' },
      { id: 'h2', label: 'H2', sublabel: 'gas', x: 540, y: 200, kind: 'molecule' },
      { id: 'pt', label: 'Pt', sublabel: 'surface', x: 540, y: 420, kind: 'generic' },
    ],
    [
      { id: 'a1', from_id: 'h2', to_id: 'pt', kind: 'interaction' },
      { id: 'a2', from_id: 'alkene', to_id: 'pt', kind: 'interaction' },
    ],
    '1. Adsorption',
    'Alkene and H2 bind to the metal surface.',
  ),
  snapshotFromNodesEdges(
    [
      { id: 'alkene', label: 'C2H4', sublabel: 'π-bound', x: 320, y: 280, kind: 'molecule' },
      { id: 'h2', label: 'H2', sublabel: 'activated', x: 480, y: 220, kind: 'molecule' },
      { id: 'pt', label: 'Pt', sublabel: 'catalyst', x: 520, y: 400, kind: 'generic' },
    ],
    [
      { id: 'b1', from_id: 'h2', to_id: 'pt', kind: 'interaction' },
      { id: 'b2', from_id: 'alkene', to_id: 'pt', kind: 'double' },
    ],
    '2. Activation',
    'H–H and π systems interact with the surface.',
  ),
  snapshotFromNodesEdges(
    [
      { id: 'alkene', label: 'C2H4', sublabel: '···H···', x: 380, y: 300, kind: 'intermediate' },
      { id: 'h2', label: 'H···H', sublabel: 'cleaving', x: 460, y: 240, kind: 'fragment' },
      { id: 'pt', label: 'Pt', sublabel: 'catalyst', x: 520, y: 400, kind: 'generic' },
    ],
    [
      { id: 'c1', from_id: 'h2', to_id: 'alkene', kind: 'interaction' },
      { id: 'c2', from_id: 'alkene', to_id: 'pt', kind: 'interaction' },
    ],
    '3. H delivery',
    'Hydrogen atoms transfer toward the alkene (schematic).',
  ),
  snapshotFromNodesEdges(
    [
      { id: 'partial', label: 'C2H5·', sublabel: 'alkyl-like', x: 420, y: 320, kind: 'intermediate' },
      { id: 'h', label: 'H', sublabel: 'surface H', x: 500, y: 260, kind: 'atom' },
      { id: 'pt', label: 'Pt', sublabel: 'catalyst', x: 540, y: 400, kind: 'generic' },
    ],
    [
      { id: 'd1', from_id: 'partial', to_id: 'h', kind: 'single' },
      { id: 'd2', from_id: 'partial', to_id: 'pt', kind: 'interaction' },
    ],
    '4. Intermediate',
    'Partially hydrogenated fragment before second H addition.',
  ),
  snapshotFromNodesEdges(
    [
      { id: 'alkane', label: 'C2H6', sublabel: 'alkane product', x: 480, y: 300, kind: 'molecule' },
      { id: 'pt', label: 'Pt', sublabel: 'catalyst', x: 520, y: 420, kind: 'generic' },
    ],
    [
      { id: 'e1', from_id: 'alkane', to_id: 'pt', kind: 'interaction' },
    ],
    '5. Product',
    'Saturated alkane desorbs from the surface.',
  ),
];

const SAMPLE_GRAVITY_FRAMES: FrameSnapshot[] = [
  snapshotFromNodesEdges(
    [{ id: 'fg', label: 'Fg', sublabel: 'weight', x: 540, y: 200, kind: 'force' }],
    [],
    'Gravity',
    'Apple falls toward Earth (vector schematic).',
    [
      { id: 'gnd', type: 'ground', y: 560, stroke: '#7a7a8c', stroke_width: 6 },
      { id: 'tree', type: 'icon', icon: 'tree_simple', cx: 200, cy: 520, scale: 1.15 },
      { id: 'apple', type: 'icon', icon: 'apple', cx: 232, cy: 300, scale: 1 },
      { id: 'arr', type: 'arrow', x1: 232, y1: 332, x2: 232, y2: 500, label: 'Fg' },
    ],
  ),
];

const SAMPLE_CRASH_FRAMES: FrameSnapshot[] = [
  snapshotFromNodesEdges(
    [
      { id: 'pa', label: 'p', sublabel: 'car A', x: 260, y: 120, kind: 'generic' },
      { id: 'pb', label: 'p', sublabel: 'car B', x: 740, y: 120, kind: 'generic' },
    ],
    [],
    'Momentum & collision',
    'Two cars approach; impact transfers momentum (schematic).',
    [
      { id: 'road', type: 'ground', y: 540, stroke: '#6d6d80', stroke_width: 7 },
      { id: 'carA', type: 'icon', icon: 'car_side', cx: 340, cy: 468, scale: 1.05, fill: '#5c6bc0' },
      { id: 'carB', type: 'icon', icon: 'car_side', cx: 660, cy: 468, scale: 1.05, rotation: 180, fill: '#9575cd' },
      { id: 'vA', type: 'arrow', x1: 160, y1: 468, x2: 280, y2: 468, label: 'v' },
      { id: 'vB', type: 'arrow', x1: 840, y1: 468, x2: 720, y2: 468, label: 'v' },
      { id: 'hit', type: 'icon', icon: 'impact_burst', cx: 500, cy: 452, scale: 1.25 },
    ],
  ),
];

function deepCloneFrames(f: FrameSnapshot[]): FrameSnapshot[] {
  return structuredClone(f);
}

function applyFramesToReactState(
  frames: FrameSnapshot[],
  setters: {
    setPlan?: (p: string | null) => void;
    setTitle: (t: string | null) => void;
    setCaption: (c: string | null) => void;
    setFrames: (f: FrameSnapshot[]) => void;
    setFrameIndex: (i: number) => void;
    setSelected: (s: string[]) => void;
    layoutSnapshots: MutableRefObject<FrameSnapshot[]>;
  },
  plan: string | null,
  title: string | null,
  caption: string | null,
) {
  const clone = deepCloneFrames(frames);
  if (typeof setters.setPlan === 'function') {
    setters.setPlan(plan);
  }
  setters.setTitle(title);
  setters.setCaption(caption);
  setters.layoutSnapshots.current = deepCloneFrames(frames);
  setters.setFrames(clone);
  setters.setFrameIndex(0);
  setters.setSelected([]);
}

/** Apply a `/api/visualize/scene` JSON body into canvas state (used by Generate and History restore). */
function ingestSceneApiResponse(
  ok: SceneApiResponse,
  setters: {
    setPlan: (p: string | null) => void;
    setTitle: (t: string | null) => void;
    setCaption: (c: string | null) => void;
    setFrames: (f: FrameSnapshot[]) => void;
    setFrameIndex: (i: number) => void;
    setSelected: (s: string[]) => void;
    layoutSnapshots: MutableRefObject<FrameSnapshot[]>;
  },
): void {
  let nextFrames: FrameSnapshot[];
  if (ok.frames && ok.frames.length >= 2) {
    nextFrames = apiFramesToSnapshots(ok.frames);
  } else if (
    (ok.nodes && ok.nodes.length > 0) ||
    (ok.shapes && ok.shapes.length > 0)
  ) {
    nextFrames = [
      snapshotFromNodesEdges(
        ok.nodes || [],
        Array.isArray(ok.edges) ? ok.edges : [],
        'Scene',
        null,
        Array.isArray(ok.shapes) ? ok.shapes : [],
      ),
    ];
  } else {
    throw new Error('Saved scene has no drawable frames, nodes, or shapes.');
  }
  applyFramesToReactState(
    nextFrames,
    { ...setters, setPlan: setters.setPlan },
    ok.plan ?? null,
    ok.title,
    ok.caption ?? null,
  );
}

function coerceSceneApiResponse(raw: unknown): SceneApiResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = typeof o.title === 'string' ? o.title : '(untitled)';
  return { ...o, title } as SceneApiResponse;
}

type VisualizePanelProps = {
  theme: Theme;
  historyReplay?: {
    key: number;
    request: Record<string, unknown>;
    response: unknown;
    error: string | null;
  } | null;
  onHistoryReplayDone?: () => void;
};

function parseVisualMode(raw: unknown): VisualMode {
  const s = String(raw ?? '').toLowerCase();
  if (s === 'realism' || s === 'polygon_only' || s === 'default') return s;
  return 'default';
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function shortenLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r1: number,
  r2: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * r1,
    y1: y1 + uy * r1,
    x2: x2 - ux * r2,
    y2: y2 - uy * r2,
  };
}

function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

function edgeStyle(kind: string): { strokeWidth: number; strokeDasharray?: string; opacity?: number } {
  const k = kind.toLowerCase();
  if (k.includes('hydrogen')) return { strokeWidth: 2.5, strokeDasharray: '6 5', opacity: 0.95 };
  if (k.includes('ionic')) return { strokeWidth: 3, strokeDasharray: '2 6', opacity: 0.9 };
  if (k.includes('interaction')) return { strokeWidth: 2.5, strokeDasharray: '1 5', opacity: 0.85 };
  if (k.includes('triple')) return { strokeWidth: 7, opacity: 0.95 };
  if (k.includes('double')) return { strokeWidth: 5, opacity: 0.95 };
  if (k.includes('arrow')) return { strokeWidth: 3, opacity: 1 };
  return { strokeWidth: 3.2, opacity: 0.92 };
}

export function VisualizePanel({ theme, historyReplay, onHistoryReplayDone }: VisualizePanelProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layoutSnapshots = useRef<FrameSnapshot[]>([]);

  const [prompt, setPrompt] = useState('');
  const [domainHint, setDomainHint] = useState('');
  const [preferAnimation, setPreferAnimation] = useState(true);
  const [visualMode, setVisualMode] = useState<VisualMode>('default');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const [frames, setFrames] = useState<FrameSnapshot[]>([]);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [playMs, setPlayMs] = useState(2000);
  const [selected, setSelected] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const nodeDragRef = useRef<{
    id: string;
    grabX: number;
    grabY: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);

  const shapeDragRef = useRef<{
    id: string;
    startSvg: { x: number; y: number };
    startOff: { x: number; y: number };
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    applyFramesToReactState(
      SAMPLE_HYDROGENATION_FRAMES,
      {
        setPlan,
        setTitle,
        setCaption,
        setFrames,
        setFrameIndex,
        setSelected,
        layoutSnapshots,
      },
      null,
      'Sample: catalytic hydrogenation (offline)',
      'Use the timeline to step frames. Generate canvas replaces this when the API succeeds.',
    );
    setError(null);
  }, []);

  useEffect(() => {
    setSelected([]);
  }, [frameIndex]);

  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % frames.length);
    }, playMs);
    return () => window.clearInterval(id);
  }, [playing, frames.length, playMs]);

  const current = frames[frameIndex];
  const nodes = current?.nodes ?? [];
  const shapes = current?.shapes ?? [];
  const shapeOffsets = current?.shapeOffsets ?? {};
  const positions = current?.positions ?? {};
  const edges = current?.edges ?? [];
  const multiFrame = frames.length > 1;
  const hasDrawable = nodes.length > 0 || shapes.length > 0;

  const nodeList = useMemo(() => nodes.filter((n) => positions[n.id]), [nodes, positions]);

  const selectedShapeId = useMemo(
    () => selected.find((s) => s.startsWith(SHAPE_SEL_PREFIX))?.slice(SHAPE_SEL_PREFIX.length) ?? null,
    [selected],
  );

  const selectedNodes = useMemo(
    () => selected.filter((s) => !s.startsWith(SHAPE_SEL_PREFIX)),
    [selected],
  );

  const shapesBack = useMemo(
    () => shapes.filter((s) => s.id !== selectedShapeId),
    [shapes, selectedShapeId],
  );

  const shapesFront = useMemo(
    () => shapes.filter((s) => s.id === selectedShapeId),
    [shapes, selectedShapeId],
  );

  const nodesBack = useMemo(
    () => nodeList.filter((n) => !selectedNodes.includes(n.id)),
    [nodeList, selectedNodes],
  );

  const nodesFront = useMemo(
    () => nodeList.filter((n) => selectedNodes.includes(n.id)),
    [nodeList, selectedNodes],
  );

  const patchCurrentFrame = useCallback(
    (patch: Partial<Pick<FrameSnapshot, 'positions' | 'edges' | 'shapes' | 'shapeOffsets'>>) => {
      setFrames((prev) =>
        prev.map((f, i) => {
          if (i !== frameIndex) return f;
          const nf: FrameSnapshot = { ...f };
          if (patch.positions !== undefined) nf.positions = patch.positions;
          if (patch.edges !== undefined) nf.edges = patch.edges;
          if (patch.shapes !== undefined) nf.shapes = patch.shapes;
          if (patch.shapeOffsets !== undefined) {
            nf.shapeOffsets = { ...(f.shapeOffsets ?? {}), ...patch.shapeOffsets };
          }
          return nf;
        }),
      );
    },
    [frameIndex],
  );

  const resetLayout = useCallback(() => {
    const snap = layoutSnapshots.current[frameIndex];
    if (!snap) return;
    patchCurrentFrame({
      positions: structuredClone(snap.positions),
      edges: structuredClone(snap.edges),
      shapes: structuredClone(snap.shapes ?? []),
      shapeOffsets: structuredClone(snap.shapeOffsets ?? {}),
    });
  }, [frameIndex, patchCurrentFrame]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const base = prev.filter((x) => !x.startsWith(SHAPE_SEL_PREFIX));
      if (base.includes(id)) return base.filter((x) => x !== id);
      if (base.length >= 2) return [base[1], id];
      return [...base, id];
    });
  }, []);

  const connectSelection = useCallback(() => {
    if (selectedNodes.length !== 2) return;
    const [a, b] = selectedNodes;
    const pair = [a, b].sort().join('|');
    const exists = edges.some((e) => [e.from_id, e.to_id].sort().join('|') === pair);
    if (exists) return;
    const id = `user-${Date.now().toString(36)}`;
    patchCurrentFrame({ edges: [...edges, { id, from_id: a, to_id: b, kind: 'generic' }] });
  }, [selectedNodes, edges, patchCurrentFrame]);

  const removeEdge = useCallback(
    (edgeId: string) => {
      patchCurrentFrame({ edges: edges.filter((e) => e.id !== edgeId) });
    },
    [edges, patchCurrentFrame],
  );

  const clearSelection = useCallback(() => setSelected([]), []);

  const generate = useCallback(
    async (
      overrides?: Partial<{
        prompt: string;
        domain_hint: string | null;
        animation: boolean;
        visual_mode: VisualMode;
      }>,
    ) => {
      const q = (overrides?.prompt ?? prompt).trim();
      if (!q) {
        setError('Describe what to visualize.');
        return;
      }
      const dhRaw = overrides?.domain_hint !== undefined ? overrides.domain_hint : domainHint.trim() || null;
      const anim = overrides?.animation ?? preferAnimation;
      const vm = overrides?.visual_mode ?? visualMode;
      setLoading(true);
      setError(null);
      setPlaying(false);
      try {
        const reqPayload = {
          prompt: q,
          domain_hint: dhRaw,
          animation: anim,
          visual_mode: vm,
        };
        const cached = await fetchHistoryMatch('visualize', reqPayload);
        if (cached?.hit && cached.response != null) {
          const coerced = coerceSceneApiResponse(cached.response);
          if (coerced) {
            try {
              ingestSceneApiResponse(coerced, {
                setPlan,
                setTitle,
                setCaption,
                setFrames,
                setFrameIndex,
                setSelected,
                layoutSnapshots,
              });
              return;
            } catch {
              /* bad cache payload — request fresh scene */
            }
          }
        }

        const res = await fetch('/api/visualize/scene', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqPayload),
        });
        const data = (await res.json()) as SceneApiResponse | { detail?: unknown };
        if (!res.ok) {
          const detail = (data as { detail?: unknown }).detail;
          const msg =
            typeof detail === 'string'
              ? detail
              : Array.isArray(detail)
                ? detail.map((d: { msg?: string }) => d.msg ?? '').join(' ')
                : 'Request failed.';
          throw new Error(msg || `HTTP ${res.status}`);
        }
        const ok = data as SceneApiResponse;
        ingestSceneApiResponse(ok, {
          setPlan,
          setTitle,
          setCaption,
          setFrames,
          setFrameIndex,
          setSelected,
          layoutSnapshots,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Visualization failed.');
        setFrames([]);
        setFrameIndex(0);
        setPlan(null);
        setTitle(null);
        setCaption(null);
      } finally {
        setLoading(false);
      }
    },
    [prompt, domainHint, preferAnimation, visualMode],
  );

  useEffect(() => {
    if (!historyReplay) return;
    const r = historyReplay.request;
    const p = String(r.prompt ?? '').trim();
    const dh = r.domain_hint != null ? String(r.domain_hint) : '';
    const anim = Boolean(r.animation);
    const vm = parseVisualMode(r.visual_mode);
    setPrompt(p);
    setDomainHint(dh);
    setPreferAnimation(anim);
    setVisualMode(vm);
    setPlaying(false);
    setLoading(false);
    setError(null);

    if (historyReplay.error) {
      setError(historyReplay.error);
      setFrames([]);
      setFrameIndex(0);
      setPlan(null);
      setTitle(null);
      setCaption(null);
      onHistoryReplayDone?.();
      return;
    }

    const coerced = coerceSceneApiResponse(historyReplay.response);
    if (!coerced) {
      setError(p ? 'No saved canvas found in history for this entry.' : 'Nothing to restore.');
      setFrames([]);
      setFrameIndex(0);
      setPlan(null);
      setTitle(null);
      setCaption(null);
      onHistoryReplayDone?.();
      return;
    }

    try {
      ingestSceneApiResponse(coerced, {
        setPlan,
        setTitle,
        setCaption,
        setFrames,
        setFrameIndex,
        setSelected,
        layoutSnapshots,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load saved canvas.');
      setFrames([]);
      setFrameIndex(0);
      setPlan(null);
      setTitle(null);
      setCaption(null);
    }
    onHistoryReplayDone?.();
  }, [
    historyReplay?.key,
    historyReplay?.request,
    historyReplay?.response,
    historyReplay?.error,
    onHistoryReplayDone,
  ]);

  const reloadOfflineSample = () => {
    setPlaying(false);
    applyFramesToReactState(
      SAMPLE_HYDROGENATION_FRAMES,
      {
        setPlan,
        setTitle,
        setCaption,
        setFrames,
        setFrameIndex,
        setSelected,
        layoutSnapshots,
      },
      null,
      'Sample: catalytic hydrogenation (offline)',
      'Use the timeline to step frames. Generate canvas replaces this when the API succeeds.',
    );
    setError(null);
  };

  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const p = positions[id];
    if (!p) return;
    const { x, y } = svgPoint(svg, e.clientX, e.clientY);
    nodeDragRef.current = {
      id,
      grabX: x - p.x,
      grabY: y - p.y,
      cx: e.clientX,
      cy: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onNodePointerMove = (e: React.PointerEvent, id: string) => {
    const d = nodeDragRef.current;
    if (!d || d.id !== id) return;
    if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 5) {
      d.moved = true;
      setIsDragging(true);
    }
    const svg = svgRef.current;
    if (!svg) return;
    const { x, y } = svgPoint(svg, e.clientX, e.clientY);
    const nx = clamp(x - d.grabX, NODE_R + 4, VIEW_W - NODE_R - 4);
    const ny = clamp(y - d.grabY, NODE_R + 4, VIEW_H - NODE_R - 4);
    patchCurrentFrame({
      positions: { ...positions, [id]: { x: nx, y: ny } },
    });
  };

  const onNodePointerUp = (e: React.PointerEvent, id: string) => {
    const d = nodeDragRef.current;
    nodeDragRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d && d.id === id && !d.moved) toggleSelect(id);
  };

  const onShapePointerDown = (e: React.PointerEvent<SVGGElement>, sh: SceneShape) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const { x, y } = svgPoint(svg, e.clientX, e.clientY);
    const off = shapeOffsets[sh.id] ?? { x: 0, y: 0 };
    shapeDragRef.current = {
      id: sh.id,
      startSvg: { x, y },
      startOff: { ...off },
      cx: e.clientX,
      cy: e.clientY,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onShapePointerMove = (e: React.PointerEvent<SVGGElement>, shapeId: string) => {
    const d = shapeDragRef.current;
    if (!d || d.id !== shapeId) return;
    if (Math.hypot(e.clientX - d.cx, e.clientY - d.cy) > 5) {
      d.moved = true;
      setIsDragging(true);
    }
    const svg = svgRef.current;
    if (!svg) return;
    const { x, y } = svgPoint(svg, e.clientX, e.clientY);
    const nx = d.startOff.x + (x - d.startSvg.x);
    const ny = d.startOff.y + (y - d.startSvg.y);
    patchCurrentFrame({
      shapeOffsets: { [shapeId]: { x: nx, y: ny } },
    });
  };

  const onShapePointerUp = (e: React.PointerEvent<SVGGElement>, shapeId: string) => {
    const d = shapeDragRef.current;
    shapeDragRef.current = null;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d && d.id === shapeId && !d.moved) {
      setSelected([`${SHAPE_SEL_PREFIX}${shapeId}`]);
    }
  };

  const bg = alpha(theme.palette.primary.main, 0.06);
  const transitionStyle = isDragging
    ? undefined
    : 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)';

  return (
    <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto' }}>
      <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: '0.12em' }}>
        Visualize
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
        Interactive problem canvas
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Chemistry mechanisms, <strong>physics storyboards</strong> (cars, apples, arrows, ground), or diagrams: scrub the
        timeline when animating, press play, and edit each frame. Drag <strong>nodes and shapes</strong>; selected items
        render on top. Pick two nodes to connect bonds; click empty canvas to clear selection. Uncheck step-by-step for one
        static frame.
      </Typography>

      <Box
        sx={{
          display: 'flex',
          gap: 2,
          alignItems: 'flex-start',
          mb: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <TextField
          label="What should we draw?"
          placeholder="e.g. Hydrogenation… / Show a car crash with momentum arrows / Apple falling under gravity with Fg."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          multiline
          minRows={3}
          fullWidth
          sx={{ flex: 1, minWidth: 0 }}
        />
        <FormControl sx={{ flexShrink: 0, mt: 0.5 }} component="fieldset">
          <FormLabel component="legend" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
            Render style
          </FormLabel>
          <RadioGroup
            row
            name="visual-mode"
            value={visualMode}
            onChange={(e) => setVisualMode(e.target.value as VisualMode)}
            sx={{ gap: 0.5 }}
          >
            <FormControlLabel
              value="default"
              control={<Radio size="small" color="primary" />}
              label="Default"
              sx={{ mr: 1 }}
            />
            <FormControlLabel
              value="realism"
              control={<Radio size="small" color="primary" />}
              label="Realism"
              title="Encyclopedia image thumbnails only (no vector drawing)"
              sx={{ mr: 1 }}
            />
            <FormControlLabel
              value="polygon_only"
              control={<Radio size="small" color="primary" />}
              label="Polygon only"
              title="Vector geometry built only from polygon shapes (plus labels via nodes)"
            />
          </RadioGroup>
        </FormControl>
      </Box>
      <TextField
        label="Domain hint (optional)"
        placeholder="Organic chemistry, mechanics, kinematics…"
        value={domainHint}
        onChange={(e) => setDomainHint(e.target.value)}
        fullWidth
        sx={{ mb: 1 }}
      />

      <FormControlLabel
        control={
          <Checkbox
            checked={preferAnimation}
            onChange={(_, c) => setPreferAnimation(c)}
            color="primary"
          />
        }
        label="Step-by-step frames (multi-frame mechanism animation)"
        sx={{ mb: 1, display: 'block' }}
      />

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2, alignItems: 'center' }}>
        <Button variant="contained" onClick={() => void generate()} disabled={loading || !prompt.trim()}>
          {loading ? <CircularProgress size={22} color="inherit" /> : 'Generate canvas'}
        </Button>
        <Button variant="outlined" onClick={reloadOfflineSample}>
          Sample: hydrogenation
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setPlaying(false);
            applyFramesToReactState(
              SAMPLE_GRAVITY_FRAMES,
              {
                setPlan,
                setTitle,
                setCaption,
                setFrames,
                setFrameIndex,
                setSelected,
                layoutSnapshots,
              },
              null,
              'Sample: gravity (offline)',
              'Tree + apple + weight arrow. Generate replaces this.',
            );
            setError(null);
          }}
        >
          Sample: gravity
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setPlaying(false);
            applyFramesToReactState(
              SAMPLE_CRASH_FRAMES,
              {
                setPlan,
                setTitle,
                setCaption,
                setFrames,
                setFrameIndex,
                setSelected,
                layoutSnapshots,
              },
              null,
              'Sample: collision / momentum (offline)',
              'Two cars, velocity arrows, impact burst. Generate replaces this.',
            );
            setError(null);
          }}
        >
          Sample: car crash
        </Button>
        <Button variant="outlined" onClick={resetLayout} disabled={!current}>
          Reset this frame
        </Button>
        <Button variant="outlined" onClick={clearSelection} disabled={!selected.length}>
          Clear selection
        </Button>
        <Button variant="outlined" onClick={connectSelection} disabled={selectedNodes.length !== 2}>
          Attach selection
        </Button>
        {selected.length > 0 ? (
          <Chip
            size="small"
            label={`Selected: ${selected
              .map((s) => (s.startsWith(SHAPE_SEL_PREFIX) ? `shape:${s.slice(SHAPE_SEL_PREFIX.length)}` : s))
              .join(', ')}`}
            variant="outlined"
            color="primary"
          />
        ) : null}
      </Box>

      {error ? (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      <Paper
        elevation={0}
        sx={{
          overflow: 'hidden',
          border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          bgcolor: alpha(theme.palette.background.paper, 0.75),
        }}
      >
        {(plan || title || caption) && (
          <Box sx={{ px: 2, pt: 2, pb: hasDrawable ? 1 : 2 }}>
            {plan ? (
              <Typography
                variant="caption"
                component="div"
                color="text.secondary"
                sx={{ whiteSpace: 'pre-wrap', mb: title || caption ? 1 : 0 }}
              >
                <Typography component="span" variant="caption" fontWeight={700} color="text.primary">
                  Plan —{' '}
                </Typography>
                {plan}
              </Typography>
            ) : null}
            {title ? (
              <Typography variant="subtitle1" fontWeight={700}>
                {title}
              </Typography>
            ) : null}
            {caption ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {caption}
              </Typography>
            ) : null}
          </Box>
        )}

        {multiFrame && current ? (
          <Box sx={{ px: 2, pb: 1, pt: plan || title || caption ? 0 : 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
              <IconButton
                aria-label="Previous frame"
                size="small"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex((i) => (i - 1 + frames.length) % frames.length);
                }}
              >
                <SkipPreviousIcon />
              </IconButton>
              <IconButton
                aria-label={playing ? 'Pause' : 'Play'}
                size="small"
                color="primary"
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? <PauseIcon /> : <PlayArrowIcon />}
              </IconButton>
              <IconButton
                aria-label="Next frame"
                size="small"
                onClick={() => {
                  setPlaying(false);
                  setFrameIndex((i) => (i + 1) % frames.length);
                }}
              >
                <SkipNextIcon />
              </IconButton>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                Frame {frameIndex + 1} / {frames.length}
              </Typography>
              <Select
                size="small"
                value={playMs}
                onChange={(e) => setPlayMs(Number(e.target.value))}
                sx={{ minWidth: 148, ml: 'auto' }}
              >
                <MenuItem value={200}>Fastest (0.2s)</MenuItem>
                <MenuItem value={500}>Faster (0.5s)</MenuItem>
                <MenuItem value={1200}>Fast (1.2s)</MenuItem>
                <MenuItem value={2000}>Normal (2s)</MenuItem>
                <MenuItem value={3200}>Slow (3.2s)</MenuItem>
              </Select>
            </Box>
            <Slider
              size="small"
              value={frameIndex}
              min={0}
              max={Math.max(0, frames.length - 1)}
              step={1}
              marks={frames.length <= 12 ? frames.map((_, i) => ({ value: i, label: `${i + 1}` })) : false}
              onChange={(_, v) => {
                setPlaying(false);
                setFrameIndex(v as number);
              }}
            />
            <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1 }}>
              {current.stepLabel}
            </Typography>
            {current.stepDetail ? (
              <Typography variant="body2" color="text.secondary">
                {current.stepDetail}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <Box
          sx={{
            width: '100%',
            minHeight: { xs: 320, sm: 380 },
            aspectRatio: `${VIEW_W} / ${VIEW_H}`,
            maxHeight: { xs: '55vh', sm: 'min(72vh, 780px)' },
            bgcolor: bg,
            borderTop:
              plan || title || caption || multiFrame
                ? `1px solid ${alpha(theme.palette.divider, 0.5)}`
                : undefined,
            position: 'relative',
          }}
        >
          {!hasDrawable ? (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: 3,
                border: `2px dashed ${alpha(theme.palette.primary.main, 0.35)}`,
                borderRadius: 1,
                m: 1,
              }}
            >
              <Box sx={{ textAlign: 'center', maxWidth: 420 }}>
                <Typography variant="subtitle1" fontWeight={700} color="text.primary" gutterBottom>
                  Canvas is empty
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Try offline samples (hydrogenation, gravity, car crash) or describe a physics problem for Generate.
                </Typography>
              </Box>
            </Box>
          ) : (
            <svg
              ref={svgRef}
              role="img"
              aria-label="Interactive visualization canvas"
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              width="100%"
              height="100%"
              preserveAspectRatio="xMidYMid meet"
              style={{
                display: 'block',
                touchAction: 'none',
                cursor: 'default',
                position: 'absolute',
                inset: 0,
              }}
              onPointerDown={(e: React.PointerEvent<SVGSVGElement>) => {
                if (e.target === e.currentTarget) clearSelection();
              }}
            >
              <rect width={VIEW_W} height={VIEW_H} fill={alpha(theme.palette.background.default, 0.55)} />
              <defs>
                <marker
                  id="viz-arrow"
                  markerWidth="10"
                  markerHeight="10"
                  refX="9"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L9,3 z" fill={theme.palette.secondary.main} />
                </marker>
                <marker
                  id="viz-physics-arrow"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="3"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L0,6 L10,3 z" fill={theme.palette.secondary.main} />
                </marker>
              </defs>

              <VisualizeShapesLayer
                shapes={shapesBack}
                theme={theme}
                shapeOffsets={shapeOffsets}
                interactive
                selectedShapeId={null}
                onShapePointerDown={onShapePointerDown}
                onShapePointerMove={onShapePointerMove}
                onShapePointerUp={onShapePointerUp}
              />

              {edges.map((edge) => {
                const p1 = positions[edge.from_id];
                const p2 = positions[edge.to_id];
                if (!p1 || !p2) return null;
                const seg = shortenLine(p1.x, p1.y, p2.x, p2.y, NODE_R, NODE_R);
                const st = edgeStyle(edge.kind);
                const isArrow = edge.kind.toLowerCase().includes('arrow');
                return (
                  <g key={edge.id}>
                    <line
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke="transparent"
                      strokeWidth={22}
                      style={{ cursor: 'pointer' }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        removeEdge(edge.id);
                      }}
                    />
                    <line
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke={alpha(theme.palette.primary.light, st.opacity ?? 1)}
                      strokeWidth={st.strokeWidth}
                      strokeDasharray={st.strokeDasharray}
                      strokeLinecap="round"
                      markerEnd={isArrow ? 'url(#viz-arrow)' : undefined}
                      pointerEvents="none"
                    />
                    {edge.kind.toLowerCase().includes('double') ? (
                      <line
                        x1={seg.x1}
                        y1={seg.y1 + 5}
                        x2={seg.x2}
                        y2={seg.y2 + 5}
                        stroke={alpha(theme.palette.primary.light, 0.35)}
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    ) : null}
                  </g>
                );
              })}

              {nodesBack.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const sel = selectedNodes.includes(n.id);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    onPointerDown={(e) => onNodePointerDown(e, n.id)}
                    onPointerMove={(e) => onNodePointerMove(e, n.id)}
                    onPointerUp={(e) => onNodePointerUp(e, n.id)}
                    style={{
                      cursor: 'grab',
                      transition: transitionStyle,
                    }}
                  >
                    <circle
                      r={NODE_R + (sel ? 5 : 0)}
                      fill={alpha(theme.palette.background.paper, 0.25)}
                      stroke={sel ? theme.palette.secondary.main : alpha(theme.palette.primary.main, 0.35)}
                      strokeWidth={sel ? 3 : 1.5}
                    />
                    <circle
                      r={NODE_R}
                      fill={alpha(theme.palette.background.default, 0.92)}
                      stroke={alpha(theme.palette.primary.main, 0.85)}
                      strokeWidth={2}
                    />
                    <text
                      textAnchor="middle"
                      y={6}
                      fill={theme.palette.text.primary}
                      fontSize={15}
                      fontWeight={700}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.label.length > 14 ? `${n.label.slice(0, 12)}…` : n.label}
                    </text>
                    {n.sublabel ? (
                      <text
                        textAnchor="middle"
                        y={22}
                        fill={theme.palette.text.secondary}
                        fontSize={11}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {n.sublabel.length > 18 ? `${n.sublabel.slice(0, 16)}…` : n.sublabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}

              <VisualizeShapesLayer
                shapes={shapesFront}
                theme={theme}
                shapeOffsets={shapeOffsets}
                interactive
                selectedShapeId={selectedShapeId}
                onShapePointerDown={onShapePointerDown}
                onShapePointerMove={onShapePointerMove}
                onShapePointerUp={onShapePointerUp}
              />

              {nodesFront.map((n) => {
                const p = positions[n.id];
                if (!p) return null;
                const sel = selectedNodes.includes(n.id);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p.x}, ${p.y})`}
                    onPointerDown={(e) => onNodePointerDown(e, n.id)}
                    onPointerMove={(e) => onNodePointerMove(e, n.id)}
                    onPointerUp={(e) => onNodePointerUp(e, n.id)}
                    style={{
                      cursor: 'grab',
                      transition: transitionStyle,
                    }}
                  >
                    <circle
                      r={NODE_R + (sel ? 5 : 0)}
                      fill={alpha(theme.palette.background.paper, 0.25)}
                      stroke={sel ? theme.palette.secondary.main : alpha(theme.palette.primary.main, 0.35)}
                      strokeWidth={sel ? 3 : 1.5}
                    />
                    <circle
                      r={NODE_R}
                      fill={alpha(theme.palette.background.default, 0.92)}
                      stroke={alpha(theme.palette.primary.main, 0.85)}
                      strokeWidth={2}
                    />
                    <text
                      textAnchor="middle"
                      y={6}
                      fill={theme.palette.text.primary}
                      fontSize={15}
                      fontWeight={700}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {n.label.length > 14 ? `${n.label.slice(0, 12)}…` : n.label}
                    </text>
                    {n.sublabel ? (
                      <text
                        textAnchor="middle"
                        y={22}
                        fill={theme.palette.text.secondary}
                        fontSize={11}
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {n.sublabel.length > 18 ? `${n.sublabel.slice(0, 16)}…` : n.sublabel}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </svg>
          )}
        </Box>
      </Paper>

      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1.5 }}>
        Multi-frame mode: edits apply to the <strong>current frame</strong>; Reset restores positions, bonds, shapes, and
        shape moves from the last Generate/sample load. Selected nodes or shapes render <strong>above</strong> everything
        else. API needs <code style={{ fontSize: '0.85em' }}>ANTHROPIC_API_KEY</code>.
      </Typography>
    </Box>
  );
}
