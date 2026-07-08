/**
 * Shared profile field controls — the gender toggle and age input used by both
 * the onboarding interests screen and the Edit Profile screen.
 */
import { Text, View, TouchableOpacity, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export function GenderSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (gender: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
        Gender
      </Text>
      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => onChange("MALE")}
          activeOpacity={0.8}
          className={`flex-1 flex-row items-center justify-center py-3.5 rounded-2xl border ${
            value === "MALE"
              ? "bg-brand/20 border-brand"
              : "bg-surface-variant/20 border-white/5"
          }`}
        >
          <Ionicons
            name="male-outline"
            size={16}
            color={value === "MALE" ? "#00e5ff" : "#94a3b8"}
            style={{ marginRight: 6 }}
          />
          <Text
            className={`font-bold text-sm ${value === "MALE" ? "text-white" : "text-slate-400"}`}
          >
            Male
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onChange("FEMALE")}
          activeOpacity={0.8}
          className={`flex-1 flex-row items-center justify-center py-3.5 rounded-2xl border ${
            value === "FEMALE"
              ? "bg-brand/20 border-brand"
              : "bg-surface-variant/20 border-white/5"
          }`}
        >
          <Ionicons
            name="female-outline"
            size={16}
            color={value === "FEMALE" ? "#00e5ff" : "#94a3b8"}
            style={{ marginRight: 6 }}
          />
          <Text
            className={`font-bold text-sm ${value === "FEMALE" ? "text-white" : "text-slate-400"}`}
          >
            Female
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function StepFreeToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (needsStepFree: boolean) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
        Accessibility
      </Text>
      <TouchableOpacity
        onPress={() => onChange(!value)}
        activeOpacity={0.8}
        className={`flex-row items-center gap-3 py-3.5 px-4 rounded-2xl border ${
          value ? "bg-brand/20 border-brand" : "bg-surface-variant/20 border-white/5"
        }`}
      >
        <Ionicons
          name="accessibility-outline"
          size={20}
          color={value ? "#00e5ff" : "#94a3b8"}
        />
        <View className="flex-1">
          <Text
            className={`font-bold text-sm ${value ? "text-white" : "text-slate-300"}`}
          >
            I need step-free routes
          </Text>
          <Text className="text-[11px] text-slate-400 mt-0.5">
            Navigate via elevators instead of stairs
          </Text>
        </View>
        <View
          className={`w-6 h-6 rounded-full items-center justify-center border ${
            value ? "bg-brand border-brand" : "border-white/20"
          }`}
        >
          {value ? <Ionicons name="checkmark" size={14} color="#0b1220" /> : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function ShareWithFriendsToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (shareWithFriends: boolean) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
        Privacy
      </Text>
      <TouchableOpacity
        onPress={() => onChange(!value)}
        activeOpacity={0.8}
        className={`flex-row items-center gap-3 py-3.5 px-4 rounded-2xl border ${
          value ? "bg-brand/20 border-brand" : "bg-surface-variant/20 border-white/5"
        }`}
      >
        <Ionicons
          name="people-outline"
          size={20}
          color={value ? "#00e5ff" : "#94a3b8"}
        />
        <View className="flex-1">
          <Text
            className={`font-bold text-sm ${value ? "text-white" : "text-slate-300"}`}
          >
            Friends can see my location
          </Text>
          <Text className="text-[11px] text-slate-400 mt-0.5">
            Show friends which building and floor you're in
          </Text>
        </View>
        <View
          className={`w-6 h-6 rounded-full items-center justify-center border ${
            value ? "bg-brand border-brand" : "border-white/20"
          }`}
        >
          {value ? <Ionicons name="checkmark" size={14} color="#0b1220" /> : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function AgeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (age: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="text-slate-300 text-xs font-semibold uppercase tracking-wider">
        Age
      </Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, ""))}
        placeholder="e.g. 25"
        placeholderTextColor="#475569"
        keyboardType="numeric"
        maxLength={2}
        className="w-full bg-surface-variant/20 border border-white/5 text-white font-semibold text-sm px-4 py-3.5 rounded-2xl"
      />
    </View>
  );
}
