import React, { createContext, useContext, useState, ReactNode } from "react";
import type { Poi } from "@/features/poi/types";

interface NavigationTargetContextType {
  target: Poi | null;
  setTarget: (poi: Poi | null) => void;
}

const NavigationTargetContext = createContext<NavigationTargetContextType | undefined>(
  undefined
);

export function NavigationTargetProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Poi | null>(null);

  return (
    <NavigationTargetContext.Provider value={{ target, setTarget }}>
      {children}
    </NavigationTargetContext.Provider>
  );
}

export function useNavigationTarget() {
  const context = useContext(NavigationTargetContext);
  if (context === undefined) {
    throw new Error("useNavigationTarget must be used within a NavigationTargetProvider");
  }
  return context;
}
