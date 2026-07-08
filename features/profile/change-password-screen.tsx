import { useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { changePassword } from "./api";

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <View className="gap-2">
      <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
        {label}
      </Text>
      <View className="flex-row items-center bg-surface-variant/20 border border-white/5 rounded-2xl px-4">
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#475569"
          secureTextEntry={hidden}
          autoCapitalize="none"
          className="flex-1 text-white font-semibold text-sm py-3.5"
        />
        <TouchableOpacity onPress={() => setHidden((h) => !h)} hitSlop={10}>
          <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={20} color="#64748b" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function ChangePasswordScreen() {
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async () => {
    setError(null);
    if (!current) {
      setError("Please enter your current password.");
      return;
    }
    if (next.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords do not match.");
      return;
    }

    setIsSaving(true);
    try {
      await changePassword(current, next);
      setSuccess(true);
      setTimeout(() => router.back(), 900);
    } catch (err: any) {
      setError(err?.message ?? "Failed to change password.");
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <View className="px-6 pt-6 pb-2 flex-row justify-between items-center">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center gap-1"
        >
          <Ionicons name="chevron-back" size={20} color="#64748b" />
          <Text className="text-sm font-semibold text-slate-400">Back</Text>
        </TouchableOpacity>
      </View>

      <View className="px-6 mt-4">
        <Text className="text-2xl font-bold text-white tracking-tight">Change Password</Text>
        <Text className="text-xs text-slate-400 font-medium mt-1">
          Choose a new password for your account
        </Text>
      </View>

      {error && (
        <View className="mx-6 my-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex-row items-center gap-2">
          <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
          <Text className="text-red-400 text-xs font-semibold flex-1">{error}</Text>
        </View>
      )}

      {success && (
        <View className="mx-6 my-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex-row items-center gap-2">
          <Ionicons name="checkmark-circle-outline" size={18} color="#10b981" />
          <Text className="text-emerald-400 text-xs font-semibold flex-1">
            Password changed successfully.
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 20 }}
        showsVerticalScrollIndicator={false}
      >
        <PasswordField
          label="Current Password"
          value={current}
          onChange={setCurrent}
          placeholder="Enter current password"
        />
        <PasswordField
          label="New Password"
          value={next}
          onChange={setNext}
          placeholder="At least 6 characters"
        />
        <PasswordField
          label="Confirm New Password"
          value={confirm}
          onChange={setConfirm}
          placeholder="Re-enter new password"
        />
      </ScrollView>

      <View className="p-6 pt-2">
        <TouchableOpacity
          onPress={handleSave}
          disabled={isSaving || success}
          className="w-full bg-brand py-4 rounded-2xl items-center justify-center shadow-lg shadow-brand/20"
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Update Password</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
