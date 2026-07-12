import { useEffect, useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface JoinShareSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}

/** Lets a viewer type a 6-char location-share code to follow someone. */
export function JoinShareSheet({ visible, onClose, onSubmit }: JoinShareSheetProps) {
  const [code, setCode] = useState("");

  useEffect(() => {
    if (visible) setCode("");
  }, [visible]);

  const ready = code.trim().length >= 4;

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
                <Ionicons name="enter-outline" size={20} color="#66b0ff" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">Follow a location code</Text>
                <Text className="text-xs text-neutral-400 mt-0.5">
                  Enter the 6-char code someone shared with you.
                </Text>
              </View>
            </View>

            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="e.g. 4F9K2Q"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              className="bg-surface-variant/20 border border-white/5 text-white font-bold tracking-[6px] text-lg text-center px-4 py-4 rounded-2xl"
            />

            <TouchableOpacity
              disabled={!ready}
              onPress={() => onSubmit(code.trim())}
              className={`w-full h-14 rounded-2xl items-center justify-center flex-row gap-2 ${
                ready ? "bg-brand" : "bg-neutral-800"
              }`}
            >
              <Ionicons name="navigate" size={18} color="white" />
              <Text className="text-white font-bold text-base">Follow</Text>
            </TouchableOpacity>

            <TouchableOpacity className="items-center py-2" onPress={onClose}>
              <Text className="text-neutral-400 font-semibold">Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
