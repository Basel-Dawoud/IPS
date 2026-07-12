import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface BypassPositionPadProps {
  x: number;
  y: number;
  floor: number;
  step: number;
  onChange: (pos: { x?: number; y?: number; floor?: number }) => void;
}

function Stepper({
  label,
  value,
  unit,
  onDec,
  onInc,
}: {
  label: string;
  value: string;
  unit?: string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-white text-xs font-bold w-5">{label}</Text>
      <TouchableOpacity
        onPress={onDec}
        className="w-7 h-7 rounded-lg bg-neutral-800 border border-white/10 items-center justify-center"
      >
        <Ionicons name="remove" size={16} color="#e2e8f0" />
      </TouchableOpacity>
      <Text className="text-amber-200 text-xs font-bold text-center" style={{ width: 44 }}>
        {value}
        {unit}
      </Text>
      <TouchableOpacity
        onPress={onInc}
        className="w-7 h-7 rounded-lg bg-neutral-800 border border-white/10 items-center justify-center"
      >
        <Ionicons name="add" size={16} color="#e2e8f0" />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Debug pad shown while position bypass is on: nudges the fake X/Y (meters)
 * and floor so you can "walk" the dot and test live-location sharing without
 * real beacons. Changes flow to the position publisher, so a watching friend
 * sees you move.
 */
export function BypassPositionPad({ x, y, floor, step, onChange }: BypassPositionPadProps) {
  return (
    <View className="self-start bg-surface-variant/95 border border-amber-500/40 rounded-2xl px-3 py-2.5 gap-1.5">
      <Text className="text-[10px] font-bold tracking-widest text-amber-300 uppercase">
        Bypass position
      </Text>
      <Stepper
        label="X"
        value={x.toFixed(1)}
        unit="m"
        onDec={() => onChange({ x: x - step })}
        onInc={() => onChange({ x: x + step })}
      />
      <Stepper
        label="Y"
        value={y.toFixed(1)}
        unit="m"
        onDec={() => onChange({ y: y - step })}
        onInc={() => onChange({ y: y + step })}
      />
      <Stepper
        label="F"
        value={String(floor)}
        onDec={() => onChange({ floor: floor - 1 })}
        onInc={() => onChange({ floor: floor + 1 })}
      />
    </View>
  );
}
