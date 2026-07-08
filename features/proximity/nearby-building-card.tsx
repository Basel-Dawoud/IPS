import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useProximity } from "./proximity-provider";

export function NearbyBuildingCard() {
  const { nearestInsideZone, candidates } = useProximity();
  const router = useRouter();

  const target = nearestInsideZone ?? candidates[0];
  if (!target) return null;

  return (
    <Card className="border-brand/50 bg-surface-variant/90 shadow-lg">
      <View className="flex-row items-center justify-between mb-1">
        <Badge label={target.insideZone ? "You're here" : "Nearby"} tone="brand" />
        <Text className="text-xs text-neutral-300">
          {Math.round(target.distanceMeters)} m
        </Text>
      </View>
      <CardTitle>{target.name}</CardTitle>
      {target.description ? <CardDescription>{target.description}</CardDescription> : null}
      <View className="mt-4 flex-row gap-3">
        <Button
          label="Get directions"
          size="sm"
          onPress={() => router.push(`/navigation?buildingId=${target.id}` as any)}
        />
        <Button label="Later" size="sm" variant="ghost" onPress={() => { /* dismiss is handled by leaving the zone */ }} />
      </View>
    </Card>
  );
}
