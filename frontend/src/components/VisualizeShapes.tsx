import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { Theme } from '@mui/material/styles';
import { alpha } from '@mui/material';

export type SceneShape = {
  id: string;
  type: string;
  x?: number | null;
  y?: number | null;
  w?: number | null;
  h?: number | null;
  cx?: number | null;
  cy?: number | null;
  rx?: number | null;
  ry?: number | null;
  r?: number | null;
  x1?: number | null;
  y1?: number | null;
  x2?: number | null;
  y2?: number | null;
  rotation?: number | null;
  fill?: string | null;
  stroke?: string | null;
  stroke_width?: number | null;
  label?: string | null;
  icon?: string | null;
  scale?: number | null;
  points?: string | null;
  path_d?: string | null;
  /** Raster reference (Wikimedia HTTPS only). */
  src?: string | null;
  href?: string | null;
  /** Some payloads use SVG-style `d` instead of `path_d`. */
  d?: string | null;
};

type VisualizeShapesLayerProps = {
  shapes: SceneShape[];
  theme: Theme;
  shapeOffsets?: Record<string, { x: number; y: number }>;
  interactive?: boolean;
  selectedShapeId?: string | null;
  onShapePointerDown?: (e: ReactPointerEvent<SVGGElement>, shape: SceneShape) => void;
  onShapePointerMove?: (e: ReactPointerEvent<SVGGElement>, shapeId: string) => void;
  onShapePointerUp?: (e: ReactPointerEvent<SVGGElement>, shapeId: string) => void;
};

function num(v: number | null | undefined, d: number): number {
  if (v == null || Number.isNaN(Number(v))) return d;
  return Number(v);
}

const PATH_D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9., \-+eE]+$/;

function sanitizePathD(d: string | null | undefined): string | null {
  if (d == null || typeof d !== 'string') return null;
  const s = d.trim().slice(0, 1800);
  return PATH_D_RE.test(s) ? s : null;
}

const ALLOWED_IMAGE_HOSTS = new Set(['upload.wikimedia.org', 'commons.wikimedia.org']);

function sanitizeImageSrc(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  let s = raw.trim().slice(0, 800);
  if (!s.startsWith('https://')) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return null;
    if (!ALLOWED_IMAGE_HOSTS.has(u.hostname.toLowerCase())) return null;
    for (const k of [...u.searchParams.keys()]) {
      if (k.toLowerCase().startsWith('utm_')) u.searchParams.delete(k);
    }
    const out = u.toString();
    return out.length > 800 ? out.slice(0, 800) : out;
  } catch {
    return null;
  }
}

function parsePolygonPoints(s: string | null | undefined): [number, number][] | null {
  if (s == null || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const pts: [number, number][] = [];
  for (const tok of trimmed.split(/\s+/)) {
    const parts = tok.split(',');
    if (parts.length !== 2) return null;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    pts.push([x, y]);
  }
  return pts.length >= 3 ? pts : null;
}

function polygonCentroid(pts: [number, number][]): [number, number] {
  let sx = 0;
  let sy = 0;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / pts.length, sy / pts.length];
}

/** Loose bounding box for selection outline & hit priority (shape-local coordinates). */
export function shapeLocalBounds(raw: SceneShape): { x: number; y: number; w: number; h: number } | null {
  const t = (raw.type || '').toLowerCase();
  if (t === 'ground') {
    const y = num(raw.y, 580);
    return { x: 0, y: y - 30, w: 1000, h: 60 };
  }
  if (t === 'rect' || t === 'image') {
    const x = num(raw.x, 0);
    const y = num(raw.y, 0);
    const w = num(raw.w, t === 'image' ? 400 : 80);
    const h = num(raw.h, t === 'image' ? 300 : 40);
    const pad = t === 'image' ? 6 : 10;
    const lab = raw.label ? 28 : 0;
    return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 + lab };
  }
  if (t === 'ellipse') {
    const cx = num(raw.cx, 500);
    const cy = num(raw.cy, 350);
    const rx = num(raw.rx, 40);
    const ry = num(raw.ry, 25);
    const p = 12;
    return { x: cx - rx - p, y: cy - ry - p, w: 2 * (rx + p), h: 2 * (ry + p) };
  }
  if (t === 'circle') {
    const cx = num(raw.cx, 500);
    const cy = num(raw.cy, 350);
    const r = num(raw.r, 28);
    const p = 10;
    return { x: cx - r - p, y: cy - r - p, w: 2 * (r + p), h: 2 * (r + p) };
  }
  if (t === 'line' || t === 'arrow') {
    const x1 = num(raw.x1, 0);
    const y1 = num(raw.y1, 0);
    const x2 = num(raw.x2, 100);
    const y2 = num(raw.y2, 100);
    const mnx = Math.min(x1, x2);
    const mxx = Math.max(x1, x2);
    const mny = Math.min(y1, y2);
    const mxy = Math.max(y1, y2);
    const pad = 22;
    return { x: mnx - pad, y: mny - pad, w: mxx - mnx + pad * 2, h: mxy - mny + pad * 2 };
  }
  if (t === 'polygon') {
    const pts = parsePolygonPoints(raw.points);
    if (!pts) return null;
    let mnx = Infinity;
    let mxx = -Infinity;
    let mny = Infinity;
    let mxy = -Infinity;
    for (const [x, y] of pts) {
      mnx = Math.min(mnx, x);
      mxx = Math.max(mxx, x);
      mny = Math.min(mny, y);
      mxy = Math.max(mxy, y);
    }
    const pad = 12;
    return { x: mnx - pad, y: mny - pad, w: mxx - mnx + pad * 2, h: mxy - mny + pad * 2 };
  }
  if (t === 'path') {
    const d = sanitizePathD(raw.path_d ?? raw.d);
    if (!d) return null;
    const m = /^[Mm]\s*([\d.-]+)[,\s]+([\d.-]+)/.exec(d.trim());
    if (m) {
      const x0 = Number(m[1]);
      const y0 = Number(m[2]);
      if (Number.isFinite(x0) && Number.isFinite(y0)) {
        return { x: x0 - 70, y: y0 - 70, w: 260, h: 260 };
      }
    }
    return { x: 380, y: 260, w: 240, h: 240 };
  }
  if (t === 'icon') {
    const cx = num(raw.cx, 500);
    const cy = num(raw.cy, 350);
    const sc = num(raw.scale, 1);
    const br = 100 * sc;
    return { x: cx - br, y: cy - br - 44 * sc, w: 2 * br, h: 2 * br + 52 * sc };
  }
  return null;
}

function ShapeInteractiveWrap({
  raw,
  dx,
  dy,
  interactive,
  selected,
  bounds,
  accent,
  children,
  onShapePointerDown,
  onShapePointerMove,
  onShapePointerUp,
}: {
  raw: SceneShape;
  dx: number;
  dy: number;
  interactive: boolean;
  selected: boolean;
  bounds: { x: number; y: number; w: number; h: number } | null;
  accent: string;
  children: ReactNode;
  onShapePointerDown?: (e: ReactPointerEvent<SVGGElement>, shape: SceneShape) => void;
  onShapePointerMove?: (e: ReactPointerEvent<SVGGElement>, shapeId: string) => void;
  onShapePointerUp?: (e: ReactPointerEvent<SVGGElement>, shapeId: string) => void;
}) {
  return (
    <g
      transform={`translate(${dx},${dy})`}
      style={{ cursor: interactive ? 'grab' : undefined }}
      onPointerDown={interactive && onShapePointerDown ? (e) => onShapePointerDown(e, raw) : undefined}
      onPointerMove={interactive && onShapePointerMove ? (e) => onShapePointerMove(e, raw.id) : undefined}
      onPointerUp={interactive && onShapePointerUp ? (e) => onShapePointerUp(e, raw.id) : undefined}
    >
      {selected && bounds ? (
        <rect
          x={bounds.x}
          y={bounds.y}
          width={bounds.w}
          height={bounds.h}
          fill="none"
          stroke={accent}
          strokeWidth={2.5}
          strokeDasharray="6 4"
          rx={6}
          opacity={0.95}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </g>
  );
}

function IconCarSide({ scale, fill, stroke }: { scale: number; fill: string; stroke: string }) {
  const s = scale;
  return (
    <g>
      <rect x={-75 * s} y={-12 * s} width={150 * s} height={28 * s} rx={4 * s} fill={fill} stroke={stroke} strokeWidth={2} />
      <polygon
        points={`${-35 * s},${-12 * s} ${15 * s},${-32 * s} ${55 * s},${-12 * s}`}
        fill={alpha(fill, 0.95)}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <circle cx={-38 * s} cy={18 * s} r={11 * s} fill="#1a1a22" stroke={stroke} strokeWidth={1.5} />
      <circle cx={42 * s} cy={18 * s} r={11 * s} fill="#1a1a22" stroke={stroke} strokeWidth={1.5} />
    </g>
  );
}

function IconApple({ scale }: { scale: number }) {
  const s = scale;
  return (
    <g>
      <circle cx={0} cy={4 * s} r={22 * s} fill="#c62828" stroke="#8e0000" strokeWidth={2} />
      <line x1={0} y1={-18 * s} x2={4 * s} y2={-28 * s} stroke="#5d4037" strokeWidth={3 * s} strokeLinecap="round" />
      <ellipse cx={10 * s} cy={-26 * s} rx={8 * s} ry={5 * s} fill="#2e7d32" opacity={0.9} transform={`rotate(-25 ${10 * s} ${-26 * s})`} />
    </g>
  );
}

function IconTreeSimple({ scale }: { scale: number }) {
  const s = scale;
  return (
    <g>
      <rect x={-12 * s} y={0} width={24 * s} height={70 * s} fill="#6d4c41" stroke="#4e342e" strokeWidth={2} />
      <polygon points={`0,${-90 * s} ${-55 * s},${15 * s} ${55 * s},${15 * s}`} fill="#388e3c" stroke="#1b5e20" strokeWidth={2} />
    </g>
  );
}

function IconImpactBurst({ scale, stroke }: { scale: number; stroke: string }) {
  const s = scale;
  const rays = 10;
  const els = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const x2 = Math.cos(a) * 40 * s;
    const y2 = Math.sin(a) * 40 * s;
    els.push(<line key={i} x1={0} y1={0} x2={x2} y2={y2} stroke={stroke} strokeWidth={3} strokeLinecap="round" />);
  }
  return <g>{els}</g>;
}

function IconBarrierWall({ scale, fill }: { scale: number; fill: string }) {
  const s = scale;
  return (
    <g>
      <rect x={-10 * s} y={-70 * s} width={20 * s} height={140 * s} fill={fill} stroke="#bbb" strokeWidth={2} />
      <line x1={-10 * s} y1={-40 * s} x2={10 * s} y2={-35 * s} stroke={alpha('#fff', 0.25)} strokeWidth={2} />
    </g>
  );
}

function IconGenericSchematic({
  scale,
  fill,
  stroke,
  name,
  labelColor,
}: {
  scale: number;
  fill: string;
  stroke: string;
  name: string;
  labelColor: string;
}) {
  const s = scale;
  const w = 112 * s;
  const h = 38 * s;
  const display = name.length > 20 ? `${name.slice(0, 18)}…` : name;
  return (
    <g>
      <rect
        x={-w / 2}
        y={-h / 2}
        width={w}
        height={h}
        rx={8 * s}
        fill={alpha(fill, 0.28)}
        stroke={stroke}
        strokeWidth={2}
        strokeDasharray="7 5"
      />
      <text x={0} y={5 * s} textAnchor="middle" fill={labelColor} fontSize={Math.max(10, 12 * s)} fontWeight={700}>
        {display}
      </text>
    </g>
  );
}

export function VisualizeShapesLayer({
  shapes,
  theme,
  shapeOffsets = {},
  interactive = false,
  selectedShapeId = null,
  onShapePointerDown,
  onShapePointerMove,
  onShapePointerUp,
}: VisualizeShapesLayerProps) {
  const accent = theme.palette.secondary.main;
  const fg = alpha(theme.palette.primary.light, 0.9);

  return (
    <g aria-hidden={!interactive} style={{ pointerEvents: interactive ? 'auto' : 'none' }}>
      {shapes.map((raw) => {
        const t = (raw.type || '').toLowerCase();
        const stroke = raw.stroke || fg;
        const fill = raw.fill || alpha(theme.palette.background.paper, 0.85);
        const dx = shapeOffsets[raw.id]?.x ?? 0;
        const dy = shapeOffsets[raw.id]?.y ?? 0;
        const sel = Boolean(selectedShapeId && raw.id === selectedShapeId);
        const bounds = shapeLocalBounds(raw);

        let inner: ReactNode = null;

        if (t === 'ground') {
          const y = num(raw.y, 580);
          inner = (
            <>
              <line x1={0} y1={y} x2={1000} y2={y} stroke={stroke} strokeWidth={num(raw.stroke_width, 6)} strokeLinecap="square" />
              <line
                x1={0}
                y1={y + 3}
                x2={1000}
                y2={y + 3}
                stroke={alpha(stroke, 0.25)}
                strokeWidth={2}
                strokeDasharray="12 10"
              />
            </>
          );
        } else if (t === 'rect') {
          const x = num(raw.x, 0);
          const y = num(raw.y, 0);
          const w = num(raw.w, 80);
          const h = num(raw.h, 40);
          const rot = num(raw.rotation, 0);
          const cx = x + w / 2;
          const cy = y + h / 2;
          const sw = num(raw.stroke_width, 2);
          inner = (
            <g transform={`rotate(${rot}, ${cx}, ${cy})`}>
              <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} rx={4} />
              {raw.label ? (
                <text x={cx} y={cy + 5} textAnchor="middle" fill={theme.palette.text.primary} fontSize={13} fontWeight={600}>
                  {raw.label}
                </text>
              ) : null}
            </g>
          );
        } else if (t === 'image') {
          const src = sanitizeImageSrc(raw.src ?? raw.href);
          if (!src) return null;
          const x = num(raw.x, 0);
          const y = num(raw.y, 0);
          const w = num(raw.w, 400);
          const h = num(raw.h, 300);
          const rot = num(raw.rotation, 0);
          const mx = x + w / 2;
          const tf = rot !== 0 ? `rotate(${rot}, ${mx}, ${y + h / 2})` : undefined;
          inner = (
            <g transform={tf}>
              <image href={src} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
              {raw.label ? (
                <text
                  x={mx}
                  y={y + h + 18}
                  textAnchor="middle"
                  fill={theme.palette.text.primary}
                  fontSize={12}
                  fontWeight={600}
                  style={{ textShadow: '0 0 6px rgba(0,0,0,0.75)' }}
                >
                  {raw.label}
                </text>
              ) : null}
            </g>
          );
        } else if (t === 'ellipse') {
          const cx = num(raw.cx, 500);
          const cy = num(raw.cy, 350);
          const rx = num(raw.rx, 40);
          const ry = num(raw.ry, 25);
          const sw = num(raw.stroke_width, 2);
          inner = <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} stroke={stroke} strokeWidth={sw} />;
        } else if (t === 'circle') {
          const cx = num(raw.cx, 500);
          const cy = num(raw.cy, 350);
          const rad = num(raw.r, 28);
          const sw = num(raw.stroke_width, 2);
          inner = <circle cx={cx} cy={cy} r={rad} fill={fill} stroke={stroke} strokeWidth={sw} />;
        } else if (t === 'line') {
          const sw = num(raw.stroke_width, 2);
          inner = (
            <line
              x1={num(raw.x1, 0)}
              y1={num(raw.y1, 0)}
              x2={num(raw.x2, 100)}
              y2={num(raw.y2, 100)}
              stroke={stroke}
              strokeWidth={sw}
              strokeLinecap="round"
            />
          );
        } else if (t === 'arrow') {
          const x1 = num(raw.x1, 100);
          const y1 = num(raw.y1, 100);
          const x2 = num(raw.x2, 200);
          const y2 = num(raw.y2, 100);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          inner = (
            <g>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={accent}
                strokeWidth={num(raw.stroke_width, 4)}
                strokeLinecap="round"
                markerEnd="url(#viz-physics-arrow)"
              />
              {raw.label ? (
                <text
                  x={mx + 8}
                  y={my - 8}
                  fill={theme.palette.text.primary}
                  fontSize={14}
                  fontWeight={700}
                  style={{ textShadow: '0 0 8px rgba(0,0,0,0.8)' }}
                >
                  {raw.label}
                </text>
              ) : null}
            </g>
          );
        } else if (t === 'polygon') {
          const pts = parsePolygonPoints(raw.points);
          if (!pts) return null;
          const rot = num(raw.rotation, 0);
          const [cx, cy] = polygonCentroid(pts);
          const pointsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
          const sw = num(raw.stroke_width, 2);
          const tf = rot !== 0 ? `rotate(${rot}, ${cx}, ${cy})` : undefined;
          inner = (
            <g transform={tf}>
              <polygon points={pointsStr} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
              {raw.label ? (
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fill={theme.palette.text.primary}
                  fontSize={13}
                  fontWeight={600}
                  style={{ textShadow: '0 0 6px rgba(0,0,0,0.75)' }}
                >
                  {raw.label}
                </text>
              ) : null}
            </g>
          );
        } else if (t === 'path') {
          const d = sanitizePathD(raw.path_d ?? raw.d);
          if (!d) return null;
          const sw = num(raw.stroke_width, 2);
          inner = (
            <path d={d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" />
          );
        } else if (t === 'icon') {
          const cx = num(raw.cx, 500);
          const cy = num(raw.cy, 350);
          const sc = num(raw.scale, 1);
          const name = (raw.icon || '').toLowerCase();
          let ic: ReactNode = null;
          if (name === 'car_side') ic = <IconCarSide scale={sc} fill={fill} stroke={stroke} />;
          else if (name === 'apple') ic = <IconApple scale={sc} />;
          else if (name === 'tree_simple') ic = <IconTreeSimple scale={sc} />;
          else if (name === 'impact_burst') ic = <IconImpactBurst scale={sc} stroke={accent} />;
          else if (name === 'barrier_wall') ic = <IconBarrierWall scale={sc} fill={fill} />;
          else if ((raw.icon || '').trim())
            ic = (
              <IconGenericSchematic
                scale={sc}
                fill={fill}
                stroke={stroke}
                name={(raw.icon || '').trim()}
                labelColor={theme.palette.text.primary}
              />
            );
          else ic = <circle r={16 * sc} fill={fill} stroke={stroke} strokeWidth={2} />;
          const rot = num(raw.rotation, 0);
          inner = (
            <g transform={`translate(${cx}, ${cy}) rotate(${rot})`}>
              {ic}
              {raw.label ? (
                <text y={-40 * sc} textAnchor="middle" fill={theme.palette.text.secondary} fontSize={12}>
                  {raw.label}
                </text>
              ) : null}
            </g>
          );
        }

        if (inner === null) return null;

        return (
          <ShapeInteractiveWrap
            key={raw.id}
            raw={raw}
            dx={dx}
            dy={dy}
            interactive={Boolean(interactive)}
            selected={sel}
            bounds={bounds}
            accent={accent}
            onShapePointerDown={onShapePointerDown}
            onShapePointerMove={onShapePointerMove}
            onShapePointerUp={onShapePointerUp}
          >
            {inner}
          </ShapeInteractiveWrap>
        );
      })}
    </g>
  );
}
