import { useMemo, useEffect, useState } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Polyline,
  Rect,
  Text as SvgText,
  Path,
  Defs,
  ClipPath,
} from "react-native-svg";
import type { PathPoint } from "./types";
import type { Poi } from "@/features/poi/types";
import type { VectorMap, VectorRect } from "@/features/buildings/types";
import { computePoiArea, type PoiAreaM } from "@/features/pathfinding/poi-area";
import { resolveAssetSource } from "@/lib/api-client";

interface FloorMapProps {
  /** Vector floor map (preferred). When present, drives the coordinate extent. */
  vectorMap?: VectorMap | null;
  /** Raster fallback when there is no vector map. */
  mapUrl?: string | null;
  /** Coordinate extent (meters) when there is no vectorMap. */
  width: number;
  height: number;
  /** Display rotation of the whole map, degrees: 0 | 90 | 180 | 270. */
  rotationDeg?: number | null;
  /** Live user position (meter coords). */
  position?: { x: number; y: number } | null;
  /** A followed friend's live position (meter coords) — only pass it when the
   *  friend is on the displayed floor. */
  friendMarker?: { x: number; y: number; name: string } | null;
  /**
   * User facing direction in the MAP frame (deg clockwise from map-up / -y),
   * already offset-corrected by the building's northOffsetDeg. Null → no cone.
   */
  headingMapDeg?: number | null;
  /** Heading accuracy half-width (deg); widens the cone when the compass is poor. */
  headingAccuracyDeg?: number | null;
  /** Route as ordered points; drawn between consecutive points on the current floor. */
  path?: PathPoint[];
  /** POIs to render as tappable points (already filtered or filtered here by floor). */
  pois?: Poi[];
  /** The selected destination POI id (its room is highlighted). */
  destinationPoiId?: string | null;
  onSelectPoi?: (poi: Poi) => void;
  currentFloorLevel?: number;
  displayWidth: number;
  displayHeight: number;
  recenterTrigger?: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
// Extra pan slack (pixels) so the map can be dragged past its edges, letting
// users reveal content hidden behind overlaid UI (search bar, info card, etc.).
const PAN_SLACK = 60;

function pointInRect(x: number, y: number, r: VectorRect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/**
 * SVG path for a filled direction wedge (Google-Maps-style cone), apex at
 * (cx,cy), pointing up (-y) before rotation. The arc is emitted as line
 * segments to avoid SVG arc sweep-flag ambiguity.
 */
function wedgePath(cx: number, cy: number, r: number, halfAngleDeg: number): string {
  const half = (halfAngleDeg * Math.PI) / 180;
  const steps = 10;
  let d = `M ${cx} ${cy}`;
  for (let i = 0; i <= steps; i++) {
    const a = -half + (2 * half * i) / steps; // sweep from -half..+half around up
    const x = cx + Math.sin(a) * r;
    const y = cy - Math.cos(a) * r;
    d += ` L ${x} ${y}`;
  }
  return d + " Z";
}

// POI types whose footprint the vectorMap already draws (amber/green rects).
const AREA_EXEMPT_TYPES = new Set(["STAIRS", "ELEVATOR"]);

// Labels are laid out at this nominal font size and scaled down via a group
// transform. Rendering text directly at sub-1-unit font sizes makes
// react-native-svg quantize glyph advances (letters overlap / split apart).
const LABEL_BASE_FS = 14;

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

export function FloorMap({
  vectorMap,
  mapUrl,
  width,
  height,
  rotationDeg,
  position,
  friendMarker,
  headingMapDeg,
  headingAccuracyDeg,
  path,
  pois,
  destinationPoiId,
  onSelectPoi,
  currentFloorLevel = 0,
  displayWidth,
  displayHeight,
  recenterTrigger,
}: FloorMapProps) {
  const [autoFollow, setAutoFollow] = useState(true);
  const viewW = vectorMap ? vectorMap.widthM : width;
  const viewH = vectorMap ? vectorMap.heightM : height;
  const s = Math.max(viewW, viewH);

  // Normalise rotation to one of 0/90/180/270 and derive the rotated extent.
  const rot = (((Math.round((rotationDeg ?? 0) / 90) * 90) % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const rw = swap ? viewH : viewW;
  const rh = swap ? viewW : viewH;
  // Rotate the whole scene about its centre, then re-centre in the rotated box.
  const sceneTransform = `translate(${rw / 2}, ${rh / 2}) rotate(${rot}) translate(${-viewW / 2}, ${-viewH / 2})`;
  const iconSize = s * 0.05;

  // Expand the viewBox to match the display aspect ratio so the map fills the
  // screen width (or height) without distortion. The actual map content is
  // centered, and extra space is filled by the background rect.
  const displayAspect = displayWidth / displayHeight;
  const mapAspect = rw / rh;
  let vbX: number, vbY: number, vbW: number, vbH: number;
  if (displayAspect > mapAspect) {
    // Display is wider than the map — extend viewBox width.
    vbH = rh;
    vbW = rh * displayAspect;
    vbX = -(vbW - rw) / 2;
    vbY = 0;
  } else {
    // Display is taller than the map — extend viewBox height.
    vbW = rw;
    vbH = rw / displayAspect;
    vbX = 0;
    vbY = -(vbH - rh) / 2;
  }

  // The viewBox above is letterboxed to the display aspect (contain fit), so a
  // long, thin corridor renders as a small centered strip. Default the map
  // zoomed so its short (cross-corridor) dimension fills the screen; the extra
  // length overflows and is reachable by panning. `vbW/rw` and `vbH/rh` are the
  // exact contain→fill ratios (one axis is 1, the other is the fill factor).
  const fillScale = Math.min(MAX_SCALE, Math.max(1, vbW / rw, vbH / rh));

  const scaleX = displayWidth / rw;
  const scaleY = displayHeight / rh;
  const scaleFactor = Math.min(scaleX, scaleY);

  const svgW = rw * scaleFactor;
  const svgH = rh * scaleFactor;
  const svgLeft = (displayWidth - svgW) / 2;
  const svgTop = (displayHeight - svgH) / 2;

  const floorPois = useMemo(
    () => (pois ?? []).filter((p) => p.floorLevel === currentFloorLevel),
    [pois, currentFloorLevel],
  );

  const destPoi = useMemo(
    () => floorPois.find((p) => p.id === destinationPoiId) ?? null,
    [floorPois, destinationPoiId],
  );

  // Shop footprints: an admin-drawn zone wins (no cap/exemption — it's
  // explicit); otherwise derive from the wall grid (null → dot marker).
  const poiAreas = useMemo(() => {
    const m = new Map<string, PoiAreaM | null>();
    for (const p of floorPois) {
      if (p.areaX != null && p.areaY != null && p.areaW != null && p.areaH != null) {
        m.set(p.id, { x: p.areaX, y: p.areaY, w: p.areaW, h: p.areaH });
        continue;
      }
      m.set(
        p.id,
        AREA_EXEMPT_TYPES.has(p.type)
          ? null
          : computePoiArea(currentFloorLevel, p.x, p.y),
      );
    }
    return m;
  }, [floorPois, currentFloorLevel]);

  const polyline = useMemo(() => {
    if (!path || path.length < 2) return null;
    const onFloor = path.filter((p) => p.floorLevel === currentFloorLevel);
    if (onFloor.length < 2) return null;
    return onFloor.map((p) => `${p.x},${p.y}`).join(" ");
  }, [path, currentFloorLevel]);

  // --- Pinch-to-zoom + pan, clamped so the map can't be lost off-screen. ---
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  // Default the zoom so the map fills the screen width (re-applied when the
  // rotated extent or display size changes). Auto-follow keeps this scale.
  useEffect(() => {
    scale.value = fillScale;
    savedScale.value = fillScale;
  }, [fillScale]);

  // Recenter trigger effect
  useEffect(() => {
    if (recenterTrigger) {
      setAutoFollow(true);
    }
  }, [recenterTrigger]);

  // Center on coordinates helper
  const centerOnCoords = (cxM: number, cyM: number, targetZoom?: number) => {
    const rotRad = (rot * Math.PI) / 180;
    const mapCx = viewW / 2;
    const mapCy = viewH / 2;

    const dx = cxM - mapCx;
    const dy = cyM - mapCy;

    const rx = dx * Math.cos(rotRad) - dy * Math.sin(rotRad) + rw / 2;
    const ry = dx * Math.sin(rotRad) + dy * Math.cos(rotRad) + rh / 2;

    const scaleX = displayWidth / rw;
    const scaleY = displayHeight / rh;
    const scaleFactor = Math.min(scaleX, scaleY);

    const px = rx * scaleFactor;
    const py = ry * scaleFactor;

    const svgW = rw * scaleFactor;
    const svgH = rh * scaleFactor;
    const svgLeft = (displayWidth - svgW) / 2;
    const svgTop = (displayHeight - svgH) / 2;

    const targetPx = svgLeft + px;
    const targetPy = svgTop + py;

    const screenCx = displayWidth / 2;
    const screenCy = displayHeight / 2;

    const zoom = targetZoom ?? (scale.value > 1.1 ? scale.value : 2);
    scale.value = withTiming(zoom);
    savedScale.value = zoom;

    const ctxVal = (screenCx - targetPx) * zoom;
    const ctyVal = (screenCy - targetPy) * zoom;

    const bx = (displayWidth * (zoom - 1)) / 2 + PAN_SLACK;
    const by = (displayHeight * (zoom - 1)) / 2 + PAN_SLACK;
    const clampedTx = Math.min(bx, Math.max(-bx, ctxVal));
    const clampedTy = Math.min(by, Math.max(-by, ctyVal));

    tx.value = withTiming(clampedTx);
    ty.value = withTiming(clampedTy);
    savedTx.value = clampedTx;
    savedTy.value = clampedTy;
  };

  // Auto-follow position updates
  useEffect(() => {
    if (!autoFollow || !position) return;
    centerOnCoords(position.x, position.y);
  }, [position, autoFollow, rot, viewW, viewH, rw, rh, displayWidth, displayHeight]);

  // Center on destination POI updates
  useEffect(() => {
    if (destinationPoiId) {
      const selectedPoi = floorPois.find((p) => p.id === destinationPoiId);
      if (selectedPoi) {
        setAutoFollow(false);
        centerOnCoords(selectedPoi.x, selectedPoi.y, 2.5);
      }
    }
  }, [destinationPoiId, floorPois]);

  const pinch = Gesture.Pinch()
    .onBegin(() => {
      "worklet";
      runOnJS(setAutoFollow)(false);
    })
    .onUpdate((e) => {
      "worklet";
      const next = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    })
    .onEnd(() => {
      "worklet";
      savedScale.value = scale.value;
      const bx = (displayWidth * (scale.value - 1)) / 2 + PAN_SLACK;
      const by = (displayHeight * (scale.value - 1)) / 2 + PAN_SLACK;
      const cx = Math.min(bx, Math.max(-bx, tx.value));
      const cy = Math.min(by, Math.max(-by, ty.value));
      tx.value = withTiming(cx);
      ty.value = withTiming(cy);
      savedTx.value = cx;
      savedTy.value = cy;
    });

  const pan = Gesture.Pan()
    .minDistance(10) // let short taps reach the POI markers
    .onBegin(() => {
      "worklet";
      runOnJS(setAutoFollow)(false);
    })
    .onUpdate((e) => {
      "worklet";
      const bx = (displayWidth * (scale.value - 1)) / 2 + PAN_SLACK;
      const by = (displayHeight * (scale.value - 1)) / 2 + PAN_SLACK;
      tx.value = Math.min(bx, Math.max(-bx, savedTx.value + e.translationX));
      ty.value = Math.min(by, Math.max(-by, savedTy.value + e.translationY));
    })
    .onEnd(() => {
      "worklet";
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const gesture = Gesture.Simultaneous(pinch, pan);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View
      style={{ width: displayWidth, height: displayHeight }}
      className="overflow-hidden bg-[#0f172a]"
    >
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[{ width: displayWidth, height: displayHeight }, animatedStyle]}
        >
          <Svg
            viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
            width={displayWidth}
            height={displayHeight}
          >
            {/* Full-extent background so expanded viewBox area isn't transparent */}
            <Rect x={vbX} y={vbY} width={vbW} height={vbH} fill="#0f172a" />
            <G transform={sceneTransform}>
              {vectorMap ? (
                <>
                  {/* Floor background */}
                  <Rect x={0} y={0} width={viewW} height={viewH} fill="#0f172a" />
                  {vectorMap.corridors.map((r, i) => (
                    <Rect
                      key={`co${i}`}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill="#1e293b"
                    />
                  ))}
                  {/* Rooms (destination highlighted) */}
                  {vectorMap.rooms.map((room, ri) => {
                    const highlighted = destPoi
                      ? room.rects.some((rc) => pointInRect(destPoi.x, destPoi.y, rc))
                      : false;
                    return (
                      <G key={`rm${ri}`}>
                        {room.rects.map((rc, i) => (
                          <Rect
                            key={i}
                            x={rc.x}
                            y={rc.y}
                            width={rc.w}
                            height={rc.h}
                            fill={highlighted ? "#1d4ed8" : "#243044"}
                            opacity={highlighted ? 0.9 : 1}
                          />
                        ))}
                      </G>
                    );
                  })}
                  {/* Walls */}
                  {vectorMap.walls.map((r, i) => (
                    <Rect
                      key={`w${i}`}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill="#475569"
                    />
                  ))}
                  {/* Stairs / elevators */}
                  {vectorMap.stairs.map((r, i) => (
                    <Rect
                      key={`st${i}`}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill="#f59e0b"
                    />
                  ))}
                  {vectorMap.elevators.map((r, i) => (
                    <Rect
                      key={`el${i}`}
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill="#10b981"
                    />
                  ))}
                </>
              ) : mapUrl ? (
                <SvgImage
                  href={resolveAssetSource(mapUrl)}
                  x={0}
                  y={0}
                  width={viewW}
                  height={viewH}
                  preserveAspectRatio="xMidYMid slice"
                />
              ) : null}

              {/* POI zones, under the route. Only the DESTINATION's zone is
                  visible (highlight); other zones stay invisible but remain
                  tappable and still drive label placement. */}
              {floorPois.map((poi) => {
                const area = poiAreas.get(poi.id);
                if (!area) return null;
                const isDest = poi.id === destinationPoiId;
                return (
                  <Rect
                    key={`area-${poi.id}`}
                    x={area.x}
                    y={area.y}
                    width={area.w}
                    height={area.h}
                    rx={s * 0.005}
                    fill={isDest ? "#1d4ed8" : "transparent"}
                    fillOpacity={isDest ? 0.4 : 1}
                    stroke={isDest ? "#60a5fa" : "none"}
                    strokeOpacity={0.9}
                    strokeWidth={isDest ? s * 0.0015 : 0}
                    onPress={onSelectPoi ? () => onSelectPoi(poi) : undefined}
                  />
                );
              })}

              {/* Route */}
              {polyline ? (
                <Polyline
                  points={polyline}
                  stroke="#60a5fa"
                  strokeWidth={s * 0.01}
                  fill="none"
                />
              ) : null}

              {/* POI markers + labels. Positions rotate with the scene; labels are
                  counter-rotated so they stay upright. POIs with a grid-derived
                  area get the name wrapped INSIDE the footprint; open-space POIs
                  keep a dot with a compact label above it. */}
              {floorPois.map((poi) => {
                const isDest = poi.id === destinationPoiId;
                const area = poiAreas.get(poi.id) ?? null;

                // Label geometry. The counter-rotated label occupies the area's
                // on-screen extent, so its width/height swap with the rotation.
                const cx = area ? area.x + area.w / 2 : poi.x;
                const cy = area ? area.y + area.h / 2 : poi.y;
                const availW = area ? (swap ? area.h : area.w) * 0.92 : s * 0.14;
                const availH = area ? (swap ? area.w : area.h) * 0.8 : s * 0.05;
                const fs = area
                  ? Math.max(s * 0.008, Math.min(s * 0.018, availH / 3.2, availW / 6.5))
                  : s * 0.013;
                const maxChars = Math.max(4, Math.floor(availW / (fs * 0.58)));
                const lines = wrapLabel(poi.name, maxChars);
                const lineH = fs * 1.2;

                const iconSz = area ? Math.min(fs * 3.2, availH * 0.55) : iconSize * 1.5;
                const showIcon =
                  !!poi.iconUrl &&
                  (!area || availH > lines.length * lineH + iconSz * 1.05);

                // Vertical block layout: [icon] + lines, centered in the area,
                // or stacked above the dot for open-space POIs.
                let iconCy = poi.y;
                let firstBaseline: number;
                if (area) {
                  const blockH =
                    lines.length * lineH + (showIcon ? iconSz + fs * 0.3 : 0);
                  const blockTop = cy - blockH / 2;
                  iconCy = blockTop + iconSz / 2;
                  firstBaseline =
                    blockTop + (showIcon ? iconSz + fs * 0.3 : 0) + fs * 0.85;
                } else {
                  firstBaseline =
                    poi.y -
                    (showIcon ? iconSz * 0.62 : s * 0.02) -
                    (lines.length - 1) * lineH;
                }

                return (
                  <G
                    key={poi.id}
                    onPress={onSelectPoi ? () => onSelectPoi(poi) : undefined}
                  >
                    {/* large transparent hit target (dot POIs only — areas are pressable) */}
                    {!area ? (
                      <Circle cx={poi.x} cy={poi.y} r={s * 0.03} fill="transparent" />
                    ) : null}
                    <G transform={rot ? `rotate(${-rot}, ${cx}, ${cy})` : undefined}>
                      {showIcon ? (
                        <G
                          transform={`translate(${area ? cx : poi.x}, ${area ? iconCy : poi.y}) scale(${iconSz / 96})`}
                        >
                          <Defs>
                            <ClipPath id={`poi-clip-${poi.id}`}>
                              <Circle cx={0} cy={0} r={48} />
                            </ClipPath>
                          </Defs>
                          <SvgImage
                            href={resolveAssetSource(poi.iconUrl!)}
                            x={-48}
                            y={-48}
                            width={96}
                            height={96}
                            preserveAspectRatio="xMidYMid meet"
                            clipPath={`url(#poi-clip-${poi.id})`}
                          />
                        </G>
                      ) : !area ? (
                        isDest ? (
                          <Path
                            d="M 0 0 C -4 -4, -8 -8, -8 -12 A 8 8 0 1 1 8 -12 C 8 -8, 4 -4, 0 0 Z M 0 -15 A 3 3 0 1 0 0 -9 A 3 3 0 1 0 0 -15 Z"
                            fill="#f87171"
                            stroke="#0b1220"
                            strokeWidth={1.2}
                            transform={`translate(${poi.x}, ${poi.y}) scale(${s * 0.0022})`}
                          />
                        ) : (
                          <Circle
                            cx={poi.x}
                            cy={poi.y}
                            r={s * 0.012}
                            fill="#38bdf8"
                            stroke="#0b1220"
                            strokeWidth={s * 0.003}
                          />
                        )
                      ) : null}
                      {/* destination keeps a pin marking the exact route endpoint */}
                      {area && isDest ? (
                        <Path
                          d="M 0 0 C -4 -4, -8 -8, -8 -12 A 8 8 0 1 1 8 -12 C 8 -8, 4 -4, 0 0 Z M 0 -15 A 3 3 0 1 0 0 -9 A 3 3 0 1 0 0 -15 Z"
                          fill="#f87171"
                          stroke="#0b1220"
                          strokeWidth={1.2}
                          transform={`translate(${poi.x}, ${poi.y}) scale(${s * 0.0018})`}
                        />
                      ) : null}
                      {lines.map((ln, i) => (
                        // Lay out at LABEL_BASE_FS and scale down — see the
                        // constant's comment (tiny font sizes break kerning).
                        <G
                          key={i}
                          transform={`translate(${cx}, ${firstBaseline + i * lineH}) scale(${fs / LABEL_BASE_FS})`}
                        >
                          {/* halo pass for readability over any background */}
                          <SvgText
                            x={0}
                            y={0}
                            fontSize={LABEL_BASE_FS}
                            fontWeight="600"
                            textAnchor="middle"
                            stroke="#0b1220"
                            strokeWidth={LABEL_BASE_FS * 0.22}
                            fill="#0b1220"
                            opacity={0.85}
                          >
                            {ln}
                          </SvgText>
                          <SvgText
                            x={0}
                            y={0}
                            fontSize={LABEL_BASE_FS}
                            fontWeight="600"
                            textAnchor="middle"
                            fill="#e2e8f0"
                          >
                            {ln}
                          </SvgText>
                        </G>
                      ))}
                    </G>
                  </G>
                );
              })}

              {/* User position — Google-Maps-style dot + direction cone. The
                  cone lives inside the scene <G>, so the floor rotationDeg is
                  applied automatically; headingMapDeg is already offset-corrected
                  into the (pre-rotation) map frame. */}
              {position ? (
                <>
                  {/* Soft accuracy halo */}
                  <Circle
                    cx={position.x}
                    cy={position.y}
                    r={s * 0.02}
                    fill="#2563eb"
                    opacity={0.18}
                  />
                  {/* Direction cone (only when we have a heading) */}
                  {headingMapDeg != null ? (
                    <G transform={`rotate(${headingMapDeg}, ${position.x}, ${position.y})`}>
                      <Path
                        d={wedgePath(
                          position.x,
                          position.y,
                          s * 0.05,
                          // Widen when the compass is uncertain.
                          (headingAccuracyDeg ?? 0) > 25 ? 42 : 26,
                        )}
                        fill="#2563eb"
                        opacity={0.35}
                      />
                    </G>
                  ) : null}
                  {/* White ring + inner blue dot */}
                  <Circle cx={position.x} cy={position.y} r={s * 0.013} fill="#ffffff" />
                  <Circle cx={position.x} cy={position.y} r={s * 0.009} fill="#2563eb" />
                </>
              ) : null}

              {/* Followed friend's live dot — emerald so it can't be confused
                  with the blue user dot; name label counter-rotated upright. */}
              {friendMarker ? (
                <>
                  <Circle
                    cx={friendMarker.x}
                    cy={friendMarker.y}
                    r={s * 0.02}
                    fill="#10b981"
                    opacity={0.2}
                  />
                  <Circle cx={friendMarker.x} cy={friendMarker.y} r={s * 0.013} fill="#ffffff" />
                  <Circle cx={friendMarker.x} cy={friendMarker.y} r={s * 0.009} fill="#10b981" />
                  <G
                    transform={
                      rot
                        ? `rotate(${-rot}, ${friendMarker.x}, ${friendMarker.y})`
                        : undefined
                    }
                  >
                    <SvgText
                      x={friendMarker.x}
                      y={friendMarker.y - s * 0.022}
                      fontSize={s * 0.018}
                      fontWeight="bold"
                      fill="#34d399"
                      stroke="#0b1220"
                      strokeWidth={s * 0.004}
                      textAnchor="middle"
                    >
                      {friendMarker.name}
                    </SvgText>
                    <SvgText
                      x={friendMarker.x}
                      y={friendMarker.y - s * 0.022}
                      fontSize={s * 0.018}
                      fontWeight="bold"
                      fill="#34d399"
                      textAnchor="middle"
                    >
                      {friendMarker.name}
                    </SvgText>
                  </G>
                </>
              ) : null}
            </G>
          </Svg>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
