/**
 * Shown from Home search when the tapped shop/building is one the user is NOT
 * physically inside. Offers outdoor directions (Google/Apple Maps) or entering
 * the indoor navigation screen anyway.
 */
import { Modal, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { formatDistance } from "@/features/location/directions";

export interface AwayDestinationDialogProps {
  visible: boolean;
  kind: "shop" | "building";
  name: string;
  buildingName: string;
  distanceMeters: number | null;
  hasMapsLocation: boolean;
  onOpenMaps: () => void;
  onEnter: () => void;
  onClose: () => void;
}

export function AwayDestinationDialog({
  visible,
  kind,
  name,
  buildingName,
  distanceMeters,
  hasMapsLocation,
  onOpenMaps,
  onEnter,
  onClose,
}: AwayDestinationDialogProps) {
  const distanceLabel =
    distanceMeters != null ? `${formatDistance(distanceMeters)} away` : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <TouchableWithoutFeedback>
            <View className="w-full bg-surface-variant/90 border border-white/10 rounded-3xl p-6">
              {/* Header */}
              <View className="flex-row justify-between items-start mb-4">
                <View className="flex-row items-center gap-3 flex-1 mr-2">
                  <View className="w-11 h-11 rounded-2xl bg-brand/10 border border-brand/20 items-center justify-center">
                    <Ionicons
                      name={kind === "shop" ? "storefront-outline" : "business-outline"}
                      size={20}
                      color="#00e5ff"
                    />
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-bold text-white tracking-tight" numberOfLines={1}>
                      {name}
                    </Text>
                    {distanceLabel ? (
                      <Text className="text-xs text-cyan font-semibold mt-0.5">{distanceLabel}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Body */}
              <Text className="text-sm text-slate-300 leading-5 mb-6">
                {kind === "shop" ? (
                  <>
                    This shop is in <Text className="font-bold text-white">{buildingName}</Text>
                    {distanceLabel ? `, ${formatDistance(distanceMeters as number)} away` : ""}. You're
                    not there yet — open maps to get directions, or enter navigation anyway.
                  </>
                ) : (
                  <>
                    <Text className="font-bold text-white">{buildingName}</Text>
                    {distanceLabel ? ` is ${formatDistance(distanceMeters as number)} away` : " isn't nearby"}.
                    Open maps to get directions, or enter navigation anyway.
                  </>
                )}
              </Text>

              {/* Actions */}
              <View className="gap-3">
                {hasMapsLocation ? (
                  <TouchableOpacity
                    onPress={onOpenMaps}
                    className="w-full py-3.5 bg-brand rounded-xl flex-row items-center justify-center gap-2 shadow-lg"
                  >
                    <Ionicons name="navigate" size={16} color="white" />
                    <Text className="text-white font-bold text-sm">Navigate in Maps</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={onEnter}
                  className="w-full py-3.5 border border-white/10 rounded-xl items-center"
                >
                  <Text className="text-slate-300 font-semibold text-sm">Enter anyway</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
