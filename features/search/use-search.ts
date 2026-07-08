import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSearch } from "./api";

/** Debounce a fast-changing value (e.g. a search box) by `delay` ms. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Debounced global search hook for the Home screen. Only fires for queries of
 * at least 2 characters; keeps previous results while the next query loads.
 */
export function useSearch(query: string) {
  const q = useDebounced(query.trim(), 300);
  return useQuery({
    queryKey: ["search", q],
    queryFn: () => fetchSearch(q),
    enabled: q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}
