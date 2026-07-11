import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAssetUrl } from "@/lib/assets";
import type { VectorMap } from "../types";

export interface FloorMapPoi {
  id: string;
  name: string;
  x: number;
  y: number;
  iconUrl?: string | null;
  areaX?: number | null;
  areaY?: number | null;
  areaW?: number | null;
  areaH?: number | null;
}

/** A POI zone rect (meters). `saved` = admin-drawn; false = auto-derived. */
export interface FloorMapZone {
  poiId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  saved: boolean;
}

/** An inaccessible/blocked area zone (meters) used for emergency overlays. */
export interface BlockedMapZone {
  id: string; // client-side id for key/delete
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FloorMapViewProps {
  vectorMap?: VectorMap | null;
  mapUrl?: string | null;
  widthMeters?: number | null;
  heightMeters?: number | null;
  /** POIs to draw (meter coords). With a matching zone → labelled inside it. */
  pois?: FloorMapPoi[];
  /** POI zones to draw as tinted rects (saved = solid, auto = dashed). */
  zones?: FloorMapZone[];
  /** Blocked/inaccessible area overlays rendered as red hatched rects. */
  blockedZones?: BlockedMapZone[];
  /** Highlight this POI (and its containing room). */
  highlightPoiId?: string | null;
  /** Selected placement point (meter coords) — shown as a pin. */
  value?: { x: number; y: number } | null;
  /** Click-to-place handler (meters). Enables the crosshair cursor. */
  onChange?: (x: number, y: number) => void;
  /**
   * Drag-to-draw a rectangle (meters). While set, dragging draws a rubber-band
   * rect and click-to-place is suppressed.
   */
  onDrawRect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** Drag-to-resize an existing rectangle. */
  onResizeRect?: (rect: { x: number; y: number; w: number; h: number }) => void;
  /** Tapping a POI marker/room. */
  onSelectPoi?: (id: string) => void;
  /** Draw a +x / +y axis legend + origin marker (helps orient the meter grid). */
  showAxes?: boolean;
  /** Enable wheel-zoom + drag-pan (default true). */
  zoomable?: boolean;
  className?: string;
  /**
   * Extra SVG layers rendered on top of everything else, in the same meter
   * viewBox — used by the live map for heatmap tints / device dots / alerts.
   */
  children?: React.ReactNode;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const MAX_ZOOM = 8;

/** Greedy word-wrap into at most 2 lines; overflow gets an ellipsis. */
function wrapLabel(name: string, maxChars: number): string[] {
  const words = name.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? `${cur} ${w}` : w;
    if (cand.length <= maxChars || !cur) cur = cand;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > 2) {
    lines.length = 2;
    lines[1] = `${lines[1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines.map((l) => (l.length > maxChars + 2 ? `${l.slice(0, maxChars + 1)}…` : l));
}

/** Keep a viewBox axis inside the map extent (centred when zoomed past it). */
function clampPan(v: number, size: number, extent: number): number {
  if (size >= extent) return (extent - size) / 2;
  return Math.min(extent - size, Math.max(0, v));
}

type Rect = { x: number; y: number; w: number; h: number };

function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * Room footprint for a POI derived from the vector map: the bounding box of the
 * room rects whose area contains the POI point. Mirrors the mobile app's
 * `computePoiArea` so a POI without an admin-drawn zone still gets its name
 * rendered INSIDE its room (sized to fit) instead of a floating label.
 */
function roomAreaForPoint(x: number, y: number, vectorMap?: VectorMap | null): Rect | null {
  if (!vectorMap) return null;
  for (const room of vectorMap.rooms) {
    if (room.rects.some((rc) => pointInRect(x, y, rc))) {
      const x0 = Math.min(...room.rects.map((r) => r.x));
      const y0 = Math.min(...room.rects.map((r) => r.y));
      const x1 = Math.max(...room.rects.map((r) => r.x + r.w));
      const y1 = Math.max(...room.rects.map((r) => r.y + r.h));
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
  }
  return null;
}

/**
 * Renders a floor's vector map (walls/rooms/stairs/elevators) as crisp SVG in
 * METER coords. POIs with a zone rect get their name wrapped and their icon
 * (circular) rendered INSIDE the zone — matching the mobile app; POIs without
 * a zone fall back to a dot + compact label. Supports wheel-zoom + drag-pan,
 * click-to-place, and drag-to-draw/resize zone rects.
 */
export function FloorMapView({
  vectorMap,
  mapUrl,
  widthMeters,
  heightMeters,
  pois,
  zones,
  blockedZones,
  highlightPoiId,
  value,
  onChange,
  onDrawRect,
  onResizeRect,
  onSelectPoi,
  showAxes,
  zoomable = true,
  className,
  children,
}: FloorMapViewProps) {
  const list = pois ?? [];
  // Rubber-band state while drag-drawing a zone (meter coords).
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );

  const justDraggedRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  // Active pan gesture: pointer start + the viewBox at gesture start.
  const panRef = useRef<{ cx: number; cy: number; view: ViewBox } | null>(null);

  // Resize drag state: tl (top-left), tr (top-right), bl (bottom-left), br (bottom-right)
  const [resizeDrag, setResizeDrag] = useState<{
    handle: "tl" | "tr" | "bl" | "br";
    rect: { x: number; y: number; w: number; h: number };
    x0: number;
    y0: number;
  } | null>(null);

  const { extentW, extentH } = useMemo(() => {
    if (vectorMap) return { extentW: vectorMap.widthM, extentH: vectorMap.heightM };
    if (widthMeters && heightMeters) return { extentW: widthMeters, extentH: heightMeters };
    const xs = list.map((p) => p.x);
    const ys = list.map((p) => p.y);
    if (value) {
      xs.push(value.x);
      ys.push(value.y);
    }
    const maxX = xs.length ? Math.max(...xs) : 0;
    const maxY = ys.length ? Math.max(...ys) : 0;
    return {
      extentW: Math.min(500, Math.max(10, Math.ceil(maxX * 1.1))),
      extentH: Math.min(500, Math.max(10, Math.ceil(maxY * 1.1))),
    };
  }, [vectorMap, widthMeters, heightMeters, list, value]);

  // Current viewBox (meters). Full extent = zoomed all the way out.
  type ViewBox = { x: number; y: number; w: number; h: number };
  const [view, setView] = useState<ViewBox>({ x: 0, y: 0, w: extentW, h: extentH });
  // Reset the view whenever the map extent changes (e.g. switching floors).
  useEffect(() => {
    setView({ x: 0, y: 0, w: extentW, h: extentH });
  }, [extentW, extentH]);

  // `s` = full extent (anchors in-zone label font to the room, so labels zoom
  // with the map). `vs` = visible extent (keeps dots/handles/strokes a stable
  // on-screen size as you zoom in).
  const s = Math.max(extentW, extentH);
  const vs = Math.max(view.w, view.h);

  const isEditor = !!(onChange || onDrawRect);
  const zoneByPoi = useMemo(() => {
    const m = new Map<string, FloorMapZone>();
    for (const z of zones ?? []) m.set(z.poiId, z);
    return m;
  }, [zones]);

  // Footprint for each POI's in-room label: an admin-drawn zone wins; otherwise
  // the vector-map room that contains the POI point (so most POIs get labelled
  // inside their room even without an explicit zone). null → dot + label.
  const poiAreas = useMemo(() => {
    const m = new Map<string, Rect | null>();
    for (const p of list) {
      const z = zoneByPoi.get(p.id);
      if (z) {
        m.set(p.id, { x: z.x, y: z.y, w: z.w, h: z.h });
      } else if (p.areaX != null && p.areaY != null && p.areaW != null && p.areaH != null) {
        m.set(p.id, { x: p.areaX, y: p.areaY, w: p.areaW, h: p.areaH });
      } else {
        m.set(p.id, roomAreaForPoint(p.x, p.y, vectorMap));
      }
    }
    return m;
  }, [list, zoneByPoi, vectorMap]);

  // Which room contains the highlighted POI (for the highlight fill).
  const highlightPoi = list.find((p) => p.id === highlightPoiId) ?? null;

  const editableZone = useMemo(() => {
    if (!onResizeRect) return null;
    return (zones ?? []).find((z) => z.saved);
  }, [zones, onResizeRect]);

  const cursorStyle = useMemo(() => {
    if (resizeDrag) {
      if (resizeDrag.handle === "tl" || resizeDrag.handle === "br") return "nwse-resize";
      return "nesw-resize";
    }
    if (panRef.current) return "grabbing";
    return onChange || onDrawRect ? "crosshair" : zoomable ? "grab" : "default";
  }, [resizeDrag, onChange, onDrawRect, zoomable]);

  // Screen point → meters, mapped through the CURRENT viewBox so click-to-place,
  // draw and resize all stay correct under pan/zoom.
  const toMeters = (e: React.MouseEvent<any>) => {
    const svgEl = (e.currentTarget.closest("svg") as SVGSVGElement) || svgRef.current;
    const rect = svgEl!.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    return {
      x: round2(Math.min(extentW, Math.max(0, view.x + fx * view.w))),
      y: round2(Math.min(extentH, Math.max(0, view.y + fy * view.h))),
    };
  };

  // Wheel-zoom toward the cursor. Attached natively (non-passive) so we can
  // preventDefault the page scroll.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || !zoomable) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = (e.clientY - rect.top) / rect.height;
      setView((v) => {
        const px = v.x + fx * v.w;
        const py = v.y + fy * v.h;
        const z = extentW / v.w;
        const nz = Math.min(MAX_ZOOM, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        const nw = extentW / nz;
        const nh = extentH / nz;
        return {
          x: clampPan(px - fx * nw, nw, extentW),
          y: clampPan(py - fy * nh, nh, extentH),
          w: nw,
          h: nh,
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomable, extentW, extentH]);

  const zoomBy = (k: number) => {
    setView((v) => {
      const z = extentW / v.w;
      const nz = Math.min(MAX_ZOOM, Math.max(1, z * k));
      const nw = extentW / nz;
      const nh = extentH / nz;
      const cx = v.x + v.w / 2;
      const cy = v.y + v.h / 2;
      return {
        x: clampPan(cx - nw / 2, nw, extentW),
        y: clampPan(cy - nh / 2, nh, extentH),
        w: nw,
        h: nh,
      };
    });
  };
  const resetView = () => setView({ x: 0, y: 0, w: extentW, h: extentH });

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (!onChange || onDrawRect) return; // draw mode replaces click-to-place
    const p = toMeters(e);
    onChange(p.x, p.y);
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Middle-mouse always pans (works even in editor draw/place modes).
    if (e.button === 1 && zoomable) {
      e.preventDefault();
      panRef.current = { cx: e.clientX, cy: e.clientY, view };
      return;
    }
    if (e.button !== 0) return;
    if (onDrawRect) {
      e.preventDefault();
      const p = toMeters(e);
      setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      return;
    }
    // View mode (no editing handlers): left-drag pans.
    if (!isEditor && zoomable) {
      panRef.current = { cx: e.clientX, cy: e.clientY, view };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (panRef.current) {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const start = panRef.current;
      const dxM = ((e.clientX - start.cx) / rect.width) * start.view.w;
      const dyM = ((e.clientY - start.cy) / rect.height) * start.view.h;
      setView({
        x: clampPan(start.view.x - dxM, start.view.w, extentW),
        y: clampPan(start.view.y - dyM, start.view.h, extentH),
        w: start.view.w,
        h: start.view.h,
      });
      justDraggedRef.current = true;
      return;
    }

    if (resizeDrag && onResizeRect) {
      const p = toMeters(e);
      const dx = p.x - resizeDrag.x0;
      const dy = p.y - resizeDrag.y0;

      let nextRect = { ...resizeDrag.rect };

      if (resizeDrag.handle === "tl") {
        const newX = Math.max(0, resizeDrag.rect.x + dx);
        const newY = Math.max(0, resizeDrag.rect.y + dy);
        const newW = (resizeDrag.rect.x + resizeDrag.rect.w) - newX;
        const newH = (resizeDrag.rect.y + resizeDrag.rect.h) - newY;

        if (newW >= 0.2 && newH >= 0.2) {
          nextRect.x = round2(newX);
          nextRect.y = round2(newY);
          nextRect.w = round2(newW);
          nextRect.h = round2(newH);
        }
      } else if (resizeDrag.handle === "tr") {
        const newY = Math.max(0, resizeDrag.rect.y + dy);
        const newH = (resizeDrag.rect.y + resizeDrag.rect.h) - newY;
        const newW = p.x - resizeDrag.rect.x;

        if (newW >= 0.2 && newH >= 0.2 && resizeDrag.rect.x + newW <= extentW) {
          nextRect.y = round2(newY);
          nextRect.w = round2(newW);
          nextRect.h = round2(newH);
        }
      } else if (resizeDrag.handle === "bl") {
        const newX = Math.max(0, resizeDrag.rect.x + dx);
        const newW = (resizeDrag.rect.x + resizeDrag.rect.w) - newX;
        const newH = p.y - resizeDrag.rect.y;

        if (newW >= 0.2 && newH >= 0.2 && resizeDrag.rect.y + newH <= extentH) {
          nextRect.x = round2(newX);
          nextRect.w = round2(newW);
          nextRect.h = round2(newH);
        }
      } else if (resizeDrag.handle === "br") {
        const newW = p.x - resizeDrag.rect.x;
        const newH = p.y - resizeDrag.rect.y;

        if (newW >= 0.2 && newH >= 0.2 && resizeDrag.rect.x + newW <= extentW && resizeDrag.rect.y + newH <= extentH) {
          nextRect.w = round2(newW);
          nextRect.h = round2(newH);
        }
      }

      onResizeRect(nextRect);
      return;
    }

    if (!onDrawRect || !drag) return;
    const p = toMeters(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  };

  const handleMouseUp = () => {
    if (panRef.current) {
      panRef.current = null;
      // Clear the drag flag on the next tick so a trailing click is swallowed.
      setTimeout(() => (justDraggedRef.current = false), 0);
      return;
    }
    if (resizeDrag) {
      setResizeDrag(null);
      justDraggedRef.current = true;
      return;
    }
    if (!onDrawRect || !drag) return;
    const x = Math.min(drag.x0, drag.x1);
    const y = Math.min(drag.y0, drag.y1);
    const w = round2(Math.abs(drag.x1 - drag.x0));
    const h = round2(Math.abs(drag.y1 - drag.y0));
    setDrag(null);
    if (w >= 0.3 && h >= 0.3) {
      onDrawRect({ x: round2(x), y: round2(y), w, h });
      justDraggedRef.current = true;
    }
  };

  const handleMouseLeave = () => {
    setDrag(null);
    setResizeDrag(null);
    panRef.current = null;
  };

  return (
    <div
      className={className}
      style={{ aspectRatio: `${extentW} / ${extentH}`, width: "100%", position: "relative" }}
    >
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        width="100%"
        height="100%"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{
          display: "block",
          borderRadius: 6,
          cursor: cursorStyle,
          background: "var(--muted)",
          userSelect: "none",
        }}
      >
        {vectorMap ? (
          <>
            {vectorMap.corridors.map((r, i) => (
              <rect key={`co${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="var(--accent)" />
            ))}
            {vectorMap.rooms.map((room, ri) => {
              const highlighted = highlightPoi
                ? room.rects.some(
                    (rc) =>
                      highlightPoi.x >= rc.x &&
                      highlightPoi.x <= rc.x + rc.w &&
                      highlightPoi.y >= rc.y &&
                      highlightPoi.y <= rc.y + rc.h,
                  )
                : false;
              return room.rects.map((rc, i) => (
                <rect
                  key={`rm${ri}-${i}`}
                  x={rc.x}
                  y={rc.y}
                  width={rc.w}
                  height={rc.h}
                  fill={highlighted ? "var(--primary)" : "var(--card)"}
                  stroke="var(--border)"
                  strokeWidth={vs * 0.002}
                />
              ));
            })}
            {vectorMap.walls.map((r, i) => (
              <rect
                key={`w${i}`}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                fill="var(--foreground)"
                opacity={0.55}
              />
            ))}
            {vectorMap.stairs.map((r, i) => (
              <rect key={`st${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="#f59e0b" />
            ))}
            {vectorMap.elevators.map((r, i) => (
              <rect key={`el${i}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="#10b981" />
            ))}
          </>
        ) : mapUrl ? (
          <image
            href={resolveAssetUrl(mapUrl)}
            x={0}
            y={0}
            width={extentW}
            height={extentH}
            preserveAspectRatio="none"
          />
        ) : null}

        {/* POI zones (saved = solid stroke, auto-derived = dashed) */}
        {(zones ?? []).map((z) => (
          <rect
            key={`z-${z.poiId}`}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            rx={vs * 0.004}
            fill="var(--primary)"
            fillOpacity={z.saved ? 0.16 : 0.07}
            stroke="var(--primary)"
            strokeOpacity={z.saved ? 0.85 : 0.5}
            strokeWidth={vs * 0.0025}
            strokeDasharray={z.saved ? undefined : `${vs * 0.008} ${vs * 0.006}`}
            pointerEvents="none"
          />
        ))}

        {/* Blocked/inaccessible zones (red hatched danger overlays) */}
        {(blockedZones ?? []).length > 0 && (
          <>
            <defs>
              <pattern
                id="blocked-zone-hatch"
                patternUnits="userSpaceOnUse"
                width={vs * 0.04}
                height={vs * 0.04}
                patternTransform="rotate(45)"
              >
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={vs * 0.04}
                  stroke="#ef4444"
                  strokeOpacity={0.55}
                  strokeWidth={vs * 0.01}
                />
              </pattern>
            </defs>
            {(blockedZones ?? []).map((z) => (
              <g key={z.id} pointerEvents="none">
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  fill="#ef4444"
                  fillOpacity={0.18}
                  stroke="#ef4444"
                  strokeOpacity={0.85}
                  strokeWidth={vs * 0.003}
                  rx={vs * 0.004}
                />
                <rect
                  x={z.x}
                  y={z.y}
                  width={z.w}
                  height={z.h}
                  fill={`url(#blocked-zone-hatch)`}
                  rx={vs * 0.004}
                />
              </g>
            ))}
          </>
        )}

        {/* Extra layers (heatmap tint, live device dots, alert pulses). Placed
            under the room labels so names stay readable over the tint. */}
        {children}

        {/* Editable zone resize handles */}
        {editableZone ? (
          <>
            {(["tl", "tr", "bl", "br"] as const).map((handle) => {
              const cx = handle === "tr" || handle === "br" ? editableZone.x + editableZone.w : editableZone.x;
              const cy = handle === "bl" || handle === "br" ? editableZone.y + editableZone.h : editableZone.y;
              const cursor = handle === "tl" || handle === "br" ? "nwse-resize" : "nesw-resize";
              return (
                <circle
                  key={handle}
                  cx={cx}
                  cy={cy}
                  r={vs * 0.012}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={vs * 0.0025}
                  style={{ cursor }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const p = toMeters(e);
                    setResizeDrag({ handle, rect: { ...editableZone }, x0: p.x, y0: p.y });
                  }}
                />
              );
            })}
          </>
        ) : null}

        {/* POIs: name + circular icon INSIDE the zone when one exists, else a
            dot + compact label above the point. */}
        {list
          .filter((poi) => !(value && poi.x === value.x && poi.y === value.y && poi.id !== "new" && poi.id !== highlightPoiId))
          .map((poi) => {
            const isHi = poi.id === highlightPoiId;
            const zone = poiAreas.get(poi.id) ?? null;

            if (zone) {
              const cx = zone.x + zone.w / 2;
              const cy = zone.y + zone.h / 2;
              const availW = zone.w * 0.92;
              const availH = zone.h * 0.8;
              const fs = Math.max(s * 0.008, Math.min(s * 0.02, availH / 3.2, availW / 6.5));
              const maxChars = Math.max(4, Math.floor(availW / (fs * 0.58)));
              const lines = wrapLabel(poi.name, maxChars);
              const lineH = fs * 1.2;
              const iconSz = Math.min(fs * 3.4, availH * 0.55, availW * 0.5);
              const showIcon = !!poi.iconUrl && availH > lines.length * lineH + iconSz * 1.05;
              const blockH = lines.length * lineH + (showIcon ? iconSz + fs * 0.3 : 0);
              const blockTop = cy - blockH / 2;
              const iconCy = blockTop + iconSz / 2;
              const firstBaseline = blockTop + (showIcon ? iconSz + fs * 0.3 : 0) + fs * 0.85;

              return (
                <g key={poi.id}>
                  {/* transparent hit target over the room (only if selectable) */}
                  {onSelectPoi ? (
                    <rect
                      x={zone.x}
                      y={zone.y}
                      width={zone.w}
                      height={zone.h}
                      fill="transparent"
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPoi(poi.id);
                      }}
                    />
                  ) : null}
                  <g pointerEvents="none">
                    {showIcon ? (
                      <>
                        <defs>
                          <clipPath id={`poi-clip-${poi.id}`}>
                            <circle cx={cx} cy={iconCy} r={iconSz / 2} />
                          </clipPath>
                        </defs>
                        <image
                          href={resolveAssetUrl(poi.iconUrl!)}
                          x={cx - iconSz / 2}
                          y={iconCy - iconSz / 2}
                          width={iconSz}
                          height={iconSz}
                          preserveAspectRatio="xMidYMid slice"
                          clipPath={`url(#poi-clip-${poi.id})`}
                        />
                        <circle
                          cx={cx}
                          cy={iconCy}
                          r={iconSz / 2}
                          fill="none"
                          stroke={isHi ? "#f87171" : "var(--background)"}
                          strokeWidth={vs * 0.002}
                        />
                      </>
                    ) : null}
                    {lines.map((ln, i) => (
                      <text
                        key={i}
                        x={cx}
                        y={firstBaseline + i * lineH}
                        fontSize={fs}
                        fontWeight={600}
                        textAnchor="middle"
                        fill={isHi ? "#f87171" : "var(--foreground)"}
                        stroke="var(--background)"
                        strokeWidth={fs * 0.22}
                        paintOrder="stroke"
                      >
                        {ln}
                      </text>
                    ))}
                  </g>
                </g>
              );
            }

            // No zone → dot + compact label above.
            return (
              <g
                key={poi.id}
                onClick={
                  onSelectPoi
                    ? (e) => {
                        e.stopPropagation();
                        onSelectPoi(poi.id);
                      }
                    : undefined
                }
                style={{ cursor: onSelectPoi ? "pointer" : undefined }}
              >
                <circle cx={poi.x} cy={poi.y} r={vs * 0.03} fill="transparent" />
                {poi.iconUrl ? (
                  <image
                    href={resolveAssetUrl(poi.iconUrl)}
                    x={poi.x - vs * 0.025}
                    y={poi.y - vs * 0.025}
                    width={vs * 0.05}
                    height={vs * 0.05}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : (
                  <circle
                    cx={poi.x}
                    cy={poi.y}
                    r={vs * 0.012}
                    fill={isHi ? "#f87171" : "var(--primary)"}
                    stroke="var(--background)"
                    strokeWidth={vs * 0.003}
                  />
                )}
                <text
                  x={poi.x}
                  y={poi.y - (poi.iconUrl ? vs * 0.032 : vs * 0.02)}
                  fill="var(--foreground)"
                  stroke="var(--background)"
                  strokeWidth={vs * 0.006}
                  paintOrder="stroke"
                  fontSize={vs * 0.022}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {poi.name}
                </text>
              </g>
            );
          })}

        {/* Rubber band while drag-drawing a zone */}
        {drag ? (
          <rect
            x={Math.min(drag.x0, drag.x1)}
            y={Math.min(drag.y0, drag.y1)}
            width={Math.abs(drag.x1 - drag.x0)}
            height={Math.abs(drag.y1 - drag.y0)}
            fill="var(--primary)"
            fillOpacity={0.2}
            stroke="var(--primary)"
            strokeWidth={vs * 0.003}
            pointerEvents="none"
          />
        ) : null}

        {/* Selected placement pin */}
        {value ? (
          <circle
            cx={value.x}
            cy={value.y}
            r={vs * 0.014}
            fill="var(--primary)"
            stroke="var(--background)"
            strokeWidth={vs * 0.004}
          />
        ) : null}

        {/* Axis legend: the meter grid is FIXED to this (unrotated) plan —
            origin (0,0) is the top-left corner, +x runs right, +y runs down. */}
        {showAxes ? (
          (() => {
            const m = vs * 0.045; // inset from the corner
            const L = vs * 0.22; // arrow length
            const head = vs * 0.022; // arrowhead size
            const fs = vs * 0.03;
            const col = "#06b6d4";
            const ox = view.x;
            const oy = view.y;
            return (
              <g pointerEvents="none" fontWeight={700} transform={`translate(${ox}, ${oy})`}>
                <circle cx={m} cy={m} r={vs * 0.008} fill={col} />
                <text x={m + vs * 0.012} y={m - vs * 0.012} fill={col} fontSize={fs * 0.8}>
                  0,0
                </text>
                <line x1={m} y1={m} x2={m + L} y2={m} stroke={col} strokeWidth={vs * 0.004} />
                <polygon
                  points={`${m + L},${m} ${m + L - head},${m - head * 0.6} ${m + L - head},${m + head * 0.6}`}
                  fill={col}
                />
                <text x={m + L + vs * 0.01} y={m + fs * 0.35} fill={col} fontSize={fs}>
                  +x (m)
                </text>
                <line x1={m} y1={m} x2={m} y2={m + L} stroke={col} strokeWidth={vs * 0.004} />
                <polygon
                  points={`${m},${m + L} ${m - head * 0.6},${m + L - head} ${m + head * 0.6},${m + L - head}`}
                  fill={col}
                />
                <text x={m + vs * 0.012} y={m + L + fs * 0.9} fill={col} fontSize={fs}>
                  +y (m)
                </text>
              </g>
            );
          })()
        ) : null}
      </svg>

      {/* Zoom controls */}
      {zoomable ? (
        <div
          style={{
            position: "absolute",
            right: 8,
            bottom: 8,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {[
            { label: "+", fn: () => zoomBy(1.4), title: "Zoom in" },
            { label: "−", fn: () => zoomBy(1 / 1.4), title: "Zoom out" },
            { label: "⤢", fn: resetView, title: "Reset view" },
          ].map((b) => (
            <button
              key={b.title}
              type="button"
              onClick={b.fn}
              title={b.title}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--foreground)",
                fontSize: 15,
                lineHeight: "1",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
