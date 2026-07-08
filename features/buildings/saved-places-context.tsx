import React, { createContext, useContext, useState, useEffect } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const STORAGE_KEY = "saved_buildings_v1";

interface SavedPlacesContextType {
  savedIds: string[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => Promise<void>;
  isLoading: boolean;
}

const SavedPlacesContext = createContext<SavedPlacesContextType>({
  savedIds: [],
  isSaved: () => false,
  toggleSave: async () => {},
  isLoading: true,
});

export function SavedPlacesProvider({ children }: { children: React.ReactNode }) {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSaved() {
      try {
        let stored = null;
        if (Platform.OS !== "web") {
          stored = await SecureStore.getItemAsync(STORAGE_KEY);
        }
        if (stored) {
          setSavedIds(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Failed to load saved buildings", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadSaved();
  }, []);

  const isSaved = (id: string) => savedIds.includes(id);

  const toggleSave = async (id: string) => {
    let next: string[];
    if (savedIds.includes(id)) {
      next = savedIds.filter((x) => x !== id);
    } else {
      next = [...savedIds, id];
    }
    setSavedIds(next);

    try {
      if (Platform.OS !== "web") {
        await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      }
    } catch (e) {
      console.warn("Failed to persist saved buildings", e);
    }
  };

  return (
    <SavedPlacesContext.Provider value={{ savedIds, isSaved, toggleSave, isLoading }}>
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces() {
  return useContext(SavedPlacesContext);
}
