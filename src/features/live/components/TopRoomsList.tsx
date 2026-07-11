import { useMemo } from "react";
import type { TopRoomItem } from "../types";

interface TopRoomsListProps {
  items: TopRoomItem[];
}

/** "Most visited stores" ranking (ported from analytics.html). */
export function TopRoomsList({ items }: TopRoomsListProps) {
  const peak = useMemo(
    () => Math.max(1, ...items.map((r) => r.total_visits)),
    [items],
  );

  if (items.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-8 text-center">
        No room visits recorded in this window yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((room, i) => (
        <div key={room.room_id} className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground w-5 text-right shrink-0">
            {i + 1}.
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium truncate">{room.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                L{room.floor} · {room.total_visits} visit{room.total_visits === 1 ? "" : "s"}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(room.total_visits / peak) * 100}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
