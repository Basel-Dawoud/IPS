import { useLocalSearchParams } from "expo-router";
import { InterestsScreen, type InterestsMode } from "@/features/interests/interests-screen";

export default function InterestsRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const resolved: InterestsMode = mode === "edit" ? "edit" : "onboarding";
  return <InterestsScreen mode={resolved} />;
}
