/**
 * OSM/Leaflet map in a WebView (no API key needed — Remon's pick over Google
 * Maps). Self-contained HTML with CDN Leaflet; building pins are divIcons,
 * the user is a pulsing blue dot. Marker taps post {type:"marker", id} over
 * the RN bridge; selecting a marker from RN (selectedId) flies the map to it.
 *
 * Markers are baked into the HTML (remount on change — building lists are
 * small and stable); selection/flyTo use injectJavaScript so swiping the
 * bottom carousel doesn't reload the map.
 */
import { useEffect, useMemo, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { WebView } from "react-native-webview";

export interface MapMarker {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: "user" | "building";
  /** Resolved (absolute) building photo URL — shown inside the pin when set. */
  imageUrl?: string | null;
}

interface LeafletMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  markers: MapMarker[];
  /** Highlighted building marker; changing it flies the map there. */
  selectedId?: string | null;
  flyToId?: { id: string; timestamp: number } | null;
  /** false → static preview (no pan/zoom/taps). */
  interactive?: boolean;
  onMarkerPress?: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}

function buildHtml(
  center: { lat: number; lng: number },
  zoom: number,
  markers: MapMarker[],
  interactive: boolean,
): string {
  const markersJson = JSON.stringify(markers);
  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b1220; }
  .pin-wrap { display: flex; flex-direction: column; align-items: center; }
  .pin-photo { border-radius: 50%; background-size: cover; background-position: center;
               background-color: #1e3a5f; border: 3px solid #fff;
               box-shadow: 0 2px 6px rgba(0,0,0,.45);
               display: flex; align-items: center; justify-content: center; }
  .pin-photo span { color: #fff; font: bold 13px sans-serif; }
  .pin-wrap.selected .pin-photo { border-color: #00e5ff; }
  .pin-tail { width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent;
              border-top: 8px solid #fff; margin-top: -3px; }
  .pin-wrap.selected .pin-tail { border-top-color: #00e5ff; }
  .user-dot { width: 16px; height: 16px; border-radius: 50%; background: #2563eb;
              border: 3px solid #fff; box-shadow: 0 0 0 8px rgba(37,99,235,.25); }
  .leaflet-container { font: 12px sans-serif; }
  .leaflet-top.leaflet-left { margin-top: 106px !important; margin-left: 12px !important; }
</style>
</head>
<body>
<div id="map"></div>
<script>
  var interactive = ${interactive};
  var map = L.map('map', {
    zoomControl: interactive,
    dragging: interactive,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    scrollWheelZoom: interactive,
    boxZoom: interactive,
    keyboard: interactive,
    tap: interactive,
    attributionControl: true
  }).setView([${center.lat}, ${center.lng}], ${zoom});

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  var markers = ${markersJson};
  var layerById = {};

  // Pin shows the building's photo (cropped circle) when it has one, else the
  // first letter of its name — with a small pointer tail anchored to the pin.
  function pinHtml(name, selected, imageUrl) {
    var size = selected ? 44 : 34;
    var body;
    if (imageUrl) {
      var safeUrl = String(imageUrl).replace(/'/g, '%27');
      body = '<div class="pin-photo" style="width:' + size + 'px;height:' + size + 'px;background-image:url(\\'' + safeUrl + '\\')"></div>';
    } else {
      var initial = (name || '?').trim().charAt(0).toUpperCase();
      body = '<div class="pin-photo" style="width:' + size + 'px;height:' + size + 'px"><span>' + initial + '</span></div>';
    }
    return '<div class="pin-wrap' + (selected ? ' selected' : '') + '">' + body + '<div class="pin-tail"></div></div>';
  }

  function pinIcon(m, selected) {
    var size = selected ? 44 : 34;
    var totalH = size + 8; // photo + tail
    return L.divIcon({
      className: '',
      html: pinHtml(m.name, selected, m.imageUrl),
      iconSize: [size, totalH],
      iconAnchor: [size / 2, totalH]
    });
  }

  markers.forEach(function (m) {
    var icon;
    if (m.kind === 'user') {
      icon = L.divIcon({ className: '', html: '<div class="user-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
    } else {
      icon = pinIcon(m, false);
    }
    var layer = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
    if (m.kind === 'building') {
      layer.bindTooltip(m.name, { direction: 'top', offset: [0, -38] });
      if (interactive) {
        layer.on('click', function () {
          window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'marker', id: m.id }));
        });
      }
    }
    layerById[m.id] = { layer: layer, data: m };
  });

  window.__setSelected = function (id, shouldFly) {
    Object.keys(layerById).forEach(function (key) {
      var entry = layerById[key];
      if (entry.data.kind !== 'building') return;
      var selected = key === id;
      entry.layer.setIcon(pinIcon(entry.data, selected));
      if (selected && shouldFly) map.flyTo([entry.data.lat, entry.data.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    });
  };
</script>
</body>
</html>`;
}

export function LeafletMap({
  center,
  zoom = 14,
  markers,
  selectedId,
  flyToId,
  interactive = true,
  onMarkerPress,
  style,
}: LeafletMapProps) {
  const webRef = useRef<WebView>(null);

  // HTML is keyed on the marker set; selection changes go through the bridge.
  const html = useMemo(
    () => buildHtml(center, zoom, markers, interactive),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(markers), interactive],
  );

  useEffect(() => {
    if (selectedId !== undefined) {
      webRef.current?.injectJavaScript(
        `window.__setSelected && window.__setSelected(${JSON.stringify(selectedId)}, false); true;`,
      );
    }
  }, [selectedId, html]);

  useEffect(() => {
    if (flyToId?.id) {
      webRef.current?.injectJavaScript(
        `window.__setSelected && window.__setSelected(${JSON.stringify(flyToId.id)}, true); true;`,
      );
    }
  }, [flyToId, html]);

  return (
    <WebView
      ref={webRef}
      source={{ html }}
      originWhitelist={["*"]}
      style={[{ backgroundColor: "#0b1220" }, style]}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
      onMessage={(e) => {
        if (!onMarkerPress) return;
        try {
          const msg = JSON.parse(e.nativeEvent.data);
          if (msg?.type === "marker" && typeof msg.id === "string") onMarkerPress(msg.id);
        } catch {
          // ignore malformed bridge messages
        }
      }}
    />
  );
}
