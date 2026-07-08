import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";

import { HapticTab } from "@/components/haptic-tab";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? "light"].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? "light"].icon,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme ?? "light"].background,
          borderTopWidth: 1,
          borderTopColor: "#112033", // surface-variant
          elevation: 0,
          height: 75,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused, size }) => (
            <View
              className={`items-center justify-center rounded-full w-10 h-10 ${focused ? "bg-brand/20 border border-brand/30 shadow-lg" : ""}`}
            >
              <Ionicons
                name={focused ? "home" : "home-outline"}
                size={20}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="navigation"
        options={{
          title: "Navigate",
          tabBarIcon: ({ color, focused, size }) => (
            <View
              className={`items-center justify-center rounded-full w-10 h-10 ${focused ? "bg-brand/20 border border-brand/30 shadow-lg" : ""}`}
            >
              <Ionicons
                name={focused ? "navigate" : "navigate-outline"}
                size={20}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="chatbot"
        options={{
          title: "Chat",
          tabBarIcon: ({ color, focused, size }) => (
            <View
              className={`items-center justify-center rounded-full w-10 h-10 ${focused ? "bg-brand/20 border border-brand/30 shadow-lg" : ""}`}
            >
              <Ionicons
                name={focused ? "chatbubbles" : "chatbubbles-outline"}
                size={20}
                color={color}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused, size }) => (
            <View
              className={`items-center justify-center rounded-full w-10 h-10 ${focused ? "bg-brand/20 border border-brand/30 shadow-lg" : ""}`}
            >
              <Ionicons
                name={focused ? "person" : "person-outline"}
                size={20}
                color={color}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
