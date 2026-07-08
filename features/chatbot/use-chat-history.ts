import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface ChatSession {
  id: string;
  userId: string | null;
  buildingId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatPersistedMessage {
  id: string;
  sessionId: string;
  sender: "USER" | "ASSISTANT";
  text: string;
  action: {
    type: "navigate";
    poiId: string;
    floorLevel: number;
  } | null;
  createdAt: string;
}

export function useChatSessions(buildingId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["chat", "sessions", buildingId],
    queryFn: async (): Promise<ChatSession[]> => {
      const { data } = await apiClient.get<ChatSession[]>("/client/chat/sessions", {
        params: { buildingId },
      });
      return data;
    },
    enabled: !!buildingId && enabled,
  });
}

export function useChatMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ["chat", "messages", sessionId],
    queryFn: async (): Promise<ChatPersistedMessage[]> => {
      const { data } = await apiClient.get<ChatPersistedMessage[]>(
        `/client/chat/sessions/${sessionId}/messages`
      );
      return data;
    },
    enabled: !!sessionId,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string): Promise<{ deleted: boolean }> => {
      const { data } = await apiClient.delete<{ deleted: boolean }>(
        `/client/chat/sessions/${sessionId}`
      );
      return data;
    },
    onSuccess: () => {
      // Invalidate both sessions list to refresh the UI
      queryClient.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}
