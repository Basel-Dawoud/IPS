import { useEffect, useState } from "react";
import { Modal, Share, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";

interface ShareResultSheetProps {
  visible: boolean;
  onClose: () => void;
  onStop: () => void;
  share: { url: string; code: string; expiresAt: string | null } | null;
}

/** Human hint for how long the share lasts, derived from `expiresAt`. */
function expiryHint(expiresAt: string | null): string {
  if (!expiresAt) return "Shares until you tap Stop";
  const mins = Math.round((new Date(expiresAt).getTime() - Date.now()) / 60_000);
  if (mins <= 0) return "Expired";
  if (mins <= 30) return `Valid for ${mins} minute${mins === 1 ? "" : "s"}`;
  const hrs = Math.round(mins / 60);
  return `Valid for ${hrs} hour${hrs === 1 ? "" : "s"}`;
}

/**
 * Shown right after a live-location share is created. Presents the link (copy /
 * native share), the 6-char code, and a scannable QR of the https URL (any
 * phone camera opens it → backend redirects into the app).
 */
export function ShareResultSheet({ visible, onClose, onStop, share }: ShareResultSheetProps) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reset the transient UI each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setShowQr(false);
      setCopied(false);
    }
  }, [visible]);

  if (!share) return null;

  const copyLink = async () => {
    await Clipboard.setStringAsync(share.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const shareLink = () =>
    // `message` (not `url`) so the link survives on Android share targets.
    Share.share({ message: `Follow my live location on Navimind: ${share.url}` });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        className="flex-1 bg-black/60 justify-end"
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View className="bg-[#112033] border-t border-white/10 rounded-t-3xl p-6 pb-10 gap-4">
            {/* Header */}
            <View className="flex-row items-center gap-3">
              <View className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 items-center justify-center">
                <Ionicons name="radio" size={20} color="#34d399" />
              </View>
              <View className="flex-1">
                <Text className="text-white font-bold text-lg">You're sharing live location</Text>
                <Text className="text-xs text-neutral-400 mt-0.5">{expiryHint(share.expiresAt)}</Text>
              </View>
            </View>

            {/* QR code (toggle) */}
            {showQr ? (
              <View className="items-center gap-2">
                <View className="bg-white p-5 rounded-3xl">
                  <QRCode value={share.url} size={200} backgroundColor="white" color="#0b1220" />
                </View>
                <Text className="text-[11px] text-neutral-500">
                  Ask your friend to scan this with their camera.
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowQr(true)}
                className="flex-row items-center justify-center gap-2 bg-neutral-900/60 border border-white/10 rounded-2xl px-4 py-3.5"
              >
                <Ionicons name="qr-code-outline" size={18} color="#66b0ff" />
                <Text className="text-white font-semibold">Show QR code</Text>
              </TouchableOpacity>
            )}

            {/* Link row: copy + share */}
            <View className="flex-row items-center gap-2 bg-neutral-900/60 border border-white/10 rounded-2xl px-4 py-3">
              <Text className="flex-1 text-neutral-300 text-xs" numberOfLines={1}>
                {share.url}
              </Text>
              <TouchableOpacity
                onPress={copyLink}
                className="flex-row items-center gap-1 bg-brand/20 border border-brand/40 rounded-full px-3 py-1.5"
              >
                <Ionicons
                  name={copied ? "checkmark" : "copy-outline"}
                  size={14}
                  color="#66b0ff"
                />
                <Text className="text-brand text-xs font-bold">{copied ? "Copied" : "Copy"}</Text>
              </TouchableOpacity>
            </View>

            {/* Manual code */}
            <View className="items-center gap-1">
              <Text className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
                Or share this code
              </Text>
              <Text className="text-white font-black text-4xl tracking-[8px]">{share.code}</Text>
            </View>

            {/* Actions */}
            <TouchableOpacity
              className="w-full h-14 bg-brand rounded-2xl items-center justify-center flex-row gap-2"
              activeOpacity={0.85}
              onPress={shareLink}
            >
              <Ionicons name="share-social" size={20} color="white" />
              <Text className="text-white font-bold text-base">Share link</Text>
            </TouchableOpacity>

            <View className="flex-row gap-3">
              <TouchableOpacity className="flex-1 items-center py-3" onPress={onClose}>
                <Text className="text-neutral-300 font-semibold">Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 items-center py-3 bg-red-500/10 border border-red-500/30 rounded-2xl"
                onPress={() => {
                  onStop();
                  onClose();
                }}
              >
                <Text className="text-red-300 font-bold">Stop sharing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
