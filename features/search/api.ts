import { apiClient } from "@/lib/api-client";
import type { SearchResults } from "./types";

/** Global search across building names + shop (POI) names/aliases. */
export async function fetchSearch(q: string): Promise<SearchResults> {
  const { data } = await apiClient.get<SearchResults>("/client/search", {
    params: { q },
  });
  return data;
}
