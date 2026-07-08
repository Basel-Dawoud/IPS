import { Modal, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ShareDurationMin } from "./types";

const OPTIONS: { label: string; hint: string; value: ShareDurationMin }[] = [
  { label: "15 minutes", hint: "Quick meetup", value: 15 },
  { label: "1 hour", hint: "Longer visit", value: 60 },
  { label: "Until I stop", hint: "Ends when you tap Stop or close the app", value: null },
];

interface ShareLocationSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (durationMin: ShareDurationMin) => void;
}

/** Duration picker shown before creating a live-location share link. */
export function ShareLocationSheet({ visible, onClose, onPick }: ShareLocationSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/60 justify-end"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View className="bg-[#112033] border-t border-white/10 rounded-t-3xl p-6 pb-10 gap-4">
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-brand/20 border border-brand/40 items-center justify-center">
                <Ionicons name="share-social" size={20} color="#66b0ff" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">Share live location</Text>
                <Text className="text-xs text-neutral-400 mt-0.5">
                  Anyone with the link sees where you are and can navigate to you.
                </Text>
              </View>
            </View>

            <View className="gap-2.5">
              {OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  activeOpacity={0.85}
                  className="flex-row items-center gap-3 bg-neutral-900/60 border border-white/10 rounded-2xl px-4 py-3.5"
                  onPress={() => {
                    onClose();
                    onPick(opt.value);
                  }}
                >
                  <Ionicons name="time-outline" size={18} color="#38bdf8" />
                  <View className="flex-1">
                    <Text className="text-white font-semibold">{opt.label}</Text>
                    <Text className="text-[11px] text-neutral-500">{opt.hint}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#64748b" />
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity className="items-center py-2" onPress={onClose}>
              <Text className="text-neutral-400 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
