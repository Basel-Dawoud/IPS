/**
 * Map-pin editor — react-leaflet map where the admin clicks to drop (or drags)
 * the building's outdoor map pin. Controlled: `value` in, `onChange` out; the
 * parent persists on save. Uses a divIcon so we don't depend on Leaflet's
 * default marker image assets (broken under bundlers).
 */
import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface PinLatLng {
  lat: number;
  lng: number;
}

interface PinEditorMapProps {
  value: PinLatLng | null;
  onChange: (next: PinLatLng) => void;
  /** Map center fallback when `value` is null. Defaults to GUC. */
  defaultCenter?: [number, number];
  defaultZoom?: number;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [29.9866, 31.4393]; // GUC main building

const pinIcon = L.divIcon({
  className: "",
  html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function ClickToPlace({ onChange }: { onChange: (next: PinLatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: round6(e.latlng.lat), lng: round6(e.latlng.lng) });
    },
  });
  return null;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

/**
 * Location search box (OpenStreetMap Nominatim). Lets admins type a place
 * name and fly the map there instead of hand-panning across the globe.
 */
function MapSearch() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=" +
          encodeURIComponent(q);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const goTo = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (r.boundingbox) {
      const [s, n, w, e] = r.boundingbox.map(parseFloat);
      map.fitBounds(
        [
          [s, w],
          [n, e],
        ],
        { padding: [20, 20], maxZoom: 18 },
      );
    } else {
      map.flyTo([lat, lon], 18);
    }
    setOpen(false);
    setQuery(r.display_name.split(",")[0]);
  };

  return (
    <div
      className="absolute right-3 top-3 z-[1000] w-64 max-w-[60%]"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="relative">
        {loading ? (
          <Loader2 className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search for a place…"
          className="bg-background/95 pl-8 shadow-sm backdrop-blur"
        />
      </div>
      {open && results.length > 0 ? (
        <ul className="mt-1 max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => goTo(r)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                title={r.display_name}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function PinEditorMap({
  value,
  onChange,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = 16,
  className,
}: PinEditorMapProps) {
  const center: [number, number] = value ? [value.lat, value.lng] : defaultCenter;
  return (
    <div className={className} style={{ position: "relative" }}>
      <MapContainer
        center={center}
        zoom={defaultZoom}
        style={{ width: "100%", height: "100%" }}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <ClickToPlace onChange={onChange} />
        {value ? (
          <Marker
            position={[value.lat, value.lng]}
            icon={pinIcon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onChange({ lat: round6(p.lat), lng: round6(p.lng) });
              },
            }}
          />
        ) : null}
        <MapSearch />
      </MapContainer>
    </div>
  );
}
