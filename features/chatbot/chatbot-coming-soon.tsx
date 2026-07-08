import { Text, View, TextInput, ScrollView, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";

export function ChatbotComingSoon() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Header */}
      <View className="px-6 py-4 flex-row items-center justify-center border-b border-white/5">
        <View className="w-10 h-10 rounded-full bg-brand/20 border border-brand/50 items-center justify-center mr-3 shadow-lg">
          <Ionicons name="hardware-chip" size={20} color="#00e5ff" />
        </View>
        <Text className="text-xl font-bold text-white tracking-tight">AI Assistant</Text>
      </View>

      <ScrollView className="flex-1 px-4" contentContainerClassName="py-10 gap-6">
        {/* Intro with Glowing Halo */}
        <View className="items-center mb-8">
          <View className="relative w-24 h-24 items-center justify-center mb-6">
            {/* Glowing Halo */}
            <View className="absolute inset-0 bg-brand/30 rounded-full scale-125 opacity-70" />
            <View className="absolute inset-0 bg-cyan/20 rounded-full scale-150 opacity-50" />
            {/* Center Icon */}
            <View className="w-20 h-20 bg-surface border border-cyan/50 rounded-full items-center justify-center z-10 shadow-lg">
              <Ionicons name="sparkles" size={32} color="#00e5ff" />
            </View>
          </View>
          <Text className="text-sm font-semibold text-brand uppercase tracking-widest mb-1">Navimind AI</Text>
          <Text className="text-2xl font-bold text-white text-center">How can I help you navigate?</Text>
        </View>

        {/* AI Message */}
        <View className="flex-row justify-start">
          <View className="bg-surface-variant/80 border border-white/10 rounded-2xl rounded-tl-sm p-4 max-w-[80%]">
            <Text className="text-white text-base leading-6">
              Welcome to Terminal 2! I can help you find your gate, locate restrooms, or discover dining options nearby.
            </Text>
          </View>
        </View>

        {/* User Message */}
        <View className="flex-row justify-end">
          <View className="bg-brand border border-brand/50 rounded-2xl rounded-tr-sm p-4 max-w-[80%] shadow-lg">
            <Text className="text-white text-base leading-6">
              Where is the nearest artisan coffee shop?
            </Text>
          </View>
        </View>

        {/* AI Message */}
        <View className="flex-row justify-start">
          <View className="bg-surface-variant/80 border border-white/10 rounded-2xl rounded-tl-sm p-4 max-w-[80%]">
            <Text className="text-white text-base leading-6">
              Artisan Roasters is on Level 2, North Wing. It's about a 3-minute walk from your current location. Would you like me to start navigation?
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Bottom Area: Suggestions + Input */}
      <View className="bg-surface/80 border-t border-white/5 pt-4 pb-4 px-4">
        {/* Suggested Prompts */}
        <View className="mb-4">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 pr-8">
            {["Find Restroom", "Take me to Gate A12", "Where's the elevator?"].map((prompt, i) => (
              <TouchableOpacity key={i} className="bg-surface-variant/60 border border-cyan/30 rounded-full px-4 py-2">
                <Text className="text-cyan font-medium text-sm">{prompt}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Area */}
        <View className="flex-row items-center bg-surface-variant/50 border border-white/10 rounded-full px-4 py-2">
          <TouchableOpacity className="p-2">
            <Ionicons name="mic" size={24} color="#007AFF" />
          </TouchableOpacity>
          <TextInput 
            placeholder="Type a message..." 
            placeholderTextColor="#64748b"
            className="flex-1 text-white text-base mx-2"
          />
          <TouchableOpacity className="w-10 h-10 rounded-full bg-brand items-center justify-center shadow-lg">
            <Ionicons name="arrow-up" size={20} color="white" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
