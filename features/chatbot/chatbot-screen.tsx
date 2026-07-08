import React, { useState, useEffect, useRef } from "react";
import {
  Text,
  View,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
  Modal,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useRouter } from "expo-router";
import * as Speech from "expo-speech";

import { useProximity } from "@/features/proximity/proximity-provider";
import { useBuildingPois } from "@/features/poi/use-building-pois";
import { usePositioning } from "@/features/positioning/use-positioning";
import { useNavigationTarget } from "@/features/navigation/navigation-target-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useChatSocket, ChatMessage } from "./use-chat-socket";
import {
  useChatSessions,
  useDeleteSession,
  ChatPersistedMessage,
} from "./use-chat-history";
import { useVoiceRecognition } from "@/features/voice/use-voice-recognition";
import { apiClient } from "@/lib/api-client";

export function ChatbotScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [isLoadingHistoryMessages, setIsLoadingHistoryMessages] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const { width: SCREEN_WIDTH } = Dimensions.get("window");
  const DRAWER_WIDTH = SCREEN_WIDTH * 0.78;
  const drawerAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;

  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const keyboardOffset = Platform.OS === "ios" ? headerHeight : 0;

  const openDrawer = () => {
    setShowHistory(true);
    Animated.timing(drawerAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const closeDrawer = () => {
    Animated.timing(drawerAnim, {
      toValue: -DRAWER_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowHistory(false);
    });
  };

  const { nearestInsideZone, candidates } = useProximity();
  const positioning = usePositioning({ autoStart: false });
  const { user, hasToken } = useAuth();

  // Resolve building context
  const activeBuilding = nearestInsideZone ?? candidates[0] ?? null;
  const buildingId = activeBuilding?.id ?? null;
  const buildingName = activeBuilding?.name ?? null;

  // Retrieve building POIs for resolving action targets
  const { data: pois } = useBuildingPois(buildingId);

  // Set up socket hook
  const {
    messages,
    sessionId,
    isConnected,
    isSending,
    error,
    sendMessage,
    clearMessages,
    loadSessionMessages,
    lastSuggestedPoiId,
    setLastSuggestedPoiId,
  } = useChatSocket({
    buildingId,
    floorLevel: positioning.floor ?? undefined,
  });

  const { setTarget } = useNavigationTarget();

  // Fetch recent sessions from database if authenticated
  const isAuthenticated = !!user || hasToken;
  const { data: sessions, refetch: refetchSessions } = useChatSessions(
    buildingId,
    isAuthenticated,
  );

  const deleteSessionMutation = useDeleteSession();

  const {
    isListening,
    recognizedText,
    startListening,
    stopListening,
    error: voiceError,
  } = useVoiceRecognition();

  // Loop pulse animation for mic/welcome icons
  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (isListening || messages.length === 0) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      animation?.stop();
    };
  }, [isListening, messages.length]);

  // Sync speech recognition text with typing field
  useEffect(() => {
    if (recognizedText) {
      setInputText(recognizedText);
    }
  }, [recognizedText]);

  const lastSpokenMessageIdRef = useRef<string | null>(null);

  const speakText = (text: string) => {
    try {
      Speech.stop();
      const isAr = isArabicText(text);
      Speech.speak(text, { language: isAr ? "ar" : "en" });
    } catch (err) {
      console.warn("[Speech] TTS failed:", err);
    }
  };

  // Auto readout new assistant messages if TTS toggle is ON
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.sender === "assistant" && lastMsg.id !== lastSpokenMessageIdRef.current) {
      lastSpokenMessageIdRef.current = lastMsg.id;
      if (isTtsEnabled) {
        speakText(lastMsg.text);
      }
    }
  }, [messages, isTtsEnabled]);

  // Stop speaking when moving away from the screen
  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const toggleListening = async () => {
    if (isListening) {
      await stopListening();
    } else {
      const isArabicSession =
        messages.length > 0 ? isArabicText(messages[messages.length - 1].text) : false;
      await startListening(isArabicSession ? "ar-EG" : "en-US");
    }
  };

  // Scroll to bottom when messages or sending state changes
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages, isSending]);

  // Refetch history lists when a new session is established or messages are added
  useEffect(() => {
    if (isAuthenticated && sessionId) {
      refetchSessions();
    }
  }, [sessionId, messages.length, isAuthenticated, refetchSessions]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;

    sendMessage(text);
    setInputText("");
    Keyboard.dismiss();
  };

  const handleSuggestionPress = (prompt: string) => {
    sendMessage(prompt);
  };

  // Load a past session's messages
  const handleLoadSession = async (pastSessionId: string) => {
    setIsLoadingHistoryMessages(true);
    try {
      const { data } = await apiClient.get<ChatPersistedMessage[]>(
        `/client/chat/sessions/${pastSessionId}/messages`,
      );

      const mappedMessages: ChatMessage[] = data.map((msg) => ({
        id: msg.id,
        text: msg.text,
        sender: msg.sender.toLowerCase() as "user" | "assistant",
        timestamp: new Date(msg.createdAt),
        action: msg.action || undefined,
      }));

      loadSessionMessages(mappedMessages, pastSessionId);
      closeDrawer();
    } catch (err) {
      console.error("[ChatbotUI] Failed to load session messages:", err);
    } finally {
      setIsLoadingHistoryMessages(false);
    }
  };

  const handleDeleteSession = async (targetSessionId: string) => {
    try {
      await deleteSessionMutation.mutateAsync(targetSessionId);
      // If we are deleting the currently active session, clear the screen
      if (sessionId === targetSessionId) {
        clearMessages();
      }
    } catch (err) {
      console.error("[ChatbotUI] Failed to delete session:", err);
    }
  };

  const handleNewChat = () => {
    clearMessages();
    closeDrawer();
  };

  const isArabicText = (text: string) => {
    const arabicRegex = /[\u0600-\u06FF]/;
    return arabicRegex.test(text);
  };

  const renderSuggestionChips = () => {
    if (lastSuggestedPoiId) {
      const suggestedPoi = pois?.find((p) => p.id === lastSuggestedPoiId);
      const storeName = suggestedPoi ? suggestedPoi.name : "";

      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-3 pr-8"
        >
          <TouchableOpacity
            onPress={() =>
              sendMessage(isArabicText(storeName) ? "ماشي" : "Yes, take me there")
            }
            className="bg-brand border border-brand/50 rounded-full px-5 py-2.5 shadow-md"
          >
            <Text className="text-white font-semibold text-sm">
              👍 {isArabicText(storeName) ? "أه، وديني هناك" : "Yes, take me there"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              sendMessage(isArabicText(storeName) ? "لا" : "No, thank you");
              setLastSuggestedPoiId(null);
            }}
            className="bg-surface-variant/80 border border-white/10 rounded-full px-5 py-2.5"
          >
            <Text className="text-slate-400 font-medium text-sm">
              👎 {isArabicText(storeName) ? "لا شكراً" : "No, thank you"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }

    const defaults = [
      { text: "Take me to Gaming", icon: "game-controller" },
      { text: "Where can I find laptops?", icon: "laptop" },
      { text: "أين أجد غرفة النوم؟", icon: "bed" },
      { text: "Smart Devices Hub info", icon: "information-circle" },
    ];

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-3 pr-8"
      >
        {defaults.map((chip, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => handleSuggestionPress(chip.text)}
            className="bg-surface-variant/60 border border-cyan/20 rounded-full px-4 py-2 flex-row items-center gap-1.5"
          >
            <Ionicons name={chip.icon as any} size={14} color="#00e5ff" />
            <Text className="text-cyan font-medium text-sm">{chip.text}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      {/* Premium Header */}
      <View className="px-6 py-4 flex-row items-center justify-between border-b border-white/10 bg-surface/50 backdrop-blur-md">
        <View className="flex-row items-center flex-1">
          <TouchableOpacity
            onPress={() => {
              if (isAuthenticated) refetchSessions();
              openDrawer();
            }}
            className="mr-4"
          >
            <Ionicons name="menu" size={28} color="white" />
          </TouchableOpacity>
          <View className="justify-center">
            <Text className="text-lg font-bold text-white tracking-tight">
              Navimind AI
            </Text>
            <Text className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase mt-0.5">
              {buildingName ? buildingName : "ADHAM SMART MALL"}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <TouchableOpacity
            onPress={() => {
              setIsTtsEnabled((prev) => {
                const val = !prev;
                if (!val) Speech.stop();
                return val;
              });
            }}
            className="w-10 h-10 rounded-full border border-white/10 items-center justify-center active:bg-white/5"
          >
            <Ionicons
              name={isTtsEnabled ? "volume-high" : "volume-mute"}
              size={20}
              color={isTtsEnabled ? "white" : "#94a3b8"}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleNewChat}
            className="w-10 h-10 rounded-full bg-brand items-center justify-center active:bg-brand/80"
          >
            <Ionicons name="add" size={24} color="white" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main message area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
        keyboardVerticalOffset={keyboardOffset}
      >
        <ScrollView
          ref={scrollViewRef}
          className="flex-1 px-4"
          contentContainerClassName="py-6 gap-5"
        >
          {messages.length === 0 && (
            <View className="items-center mt-12 mb-8 px-4">
              <View className="w-16 h-16 bg-brand/10 border border-brand/20 rounded-full items-center justify-center mb-6">
                <Ionicons name="compass-outline" size={32} color="#007aff" />
              </View>
              <Text className="text-xl font-bold text-cyan text-center mb-2">
                How can I guide you today?
              </Text>
              <Text className="text-slate-400 text-center text-sm leading-6 max-w-[85%]">
                I can find gates, shops, or help you navigate the entire complex.
              </Text>

              {!buildingId && (
                <View className="mt-6 px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-2xl flex-row items-center gap-3">
                  <Ionicons name="warning-outline" size={20} color="#eab308" />
                  <Text className="text-yellow-500/90 text-xs font-semibold flex-1">
                    Please stand near a calibrated building to start chatting and
                    navigating.
                  </Text>
                </View>
              )}
            </View>
          )}

          {messages.length > 0 && (
            <View className="items-center my-2">
              <View className="bg-surface-variant/40 border border-white/5 rounded-full px-4 py-1.5">
                <Text className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Today,{" "}
                  {messages[0].timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            </View>
          )}

          {/* Message List */}
          {messages.map((msg) => {
            const isUser = msg.sender === "user";
            const rtl = isArabicText(msg.text);

            if (isUser) {
              return (
                <View key={msg.id} className="flex-col items-end mb-2">
                  <View
                    style={{
                      backgroundColor: "#007aff",
                      borderRadius: 24,
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      maxWidth: "82%",
                    }}
                  >
                    <Text className="text-white text-[15px] leading-6 font-normal">
                      {msg.text}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-slate-500 mt-1 mr-2">
                    {msg.timestamp.toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    • Delivered
                  </Text>
                </View>
              );
            }

            return (
              <View key={msg.id} className="flex-col items-start mb-2">
                <View
                  style={{
                    backgroundColor: "rgba(17, 32, 51, 0.8)",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 1,
                    borderRadius: 20,
                    padding: 16,
                    maxWidth: "82%",
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.15,
                    shadowRadius: 2,
                    elevation: 1,
                  }}
                >
                  <Text
                    style={{
                      writingDirection: rtl ? "rtl" : "ltr",
                    }}
                    className={`text-white text-[15px] leading-6 font-normal ${
                      rtl ? "text-right" : "text-left"
                    }`}
                  >
                    {msg.text}
                  </Text>

                  {/* Action buttons inside bubble side-by-side */}
                  <View className="flex-row items-center gap-3 mt-4 w-full">
                    {msg.action?.type === "navigate" && (
                      <TouchableOpacity
                        onPress={() => {
                          const matchedPoi = pois?.find(
                            (p) => p.id === msg.action?.poiId,
                          );
                          if (matchedPoi) {
                            setTarget(matchedPoi);
                            setLastSuggestedPoiId(null);
                            router.push("/navigation");
                          }
                        }}
                        className="bg-brand border border-brand flex-1 rounded-full py-2 px-3 flex-row items-center justify-center gap-2 active:bg-brand/85"
                        style={{
                          shadowColor: "#007AFF",
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.15,
                          shadowRadius: 4,
                          elevation: 2,
                        }}
                      >
                        <Ionicons name="paper-plane" size={14} color="white" />
                        <Text className="text-white font-bold text-xs">
                          {rtl ? "بدء الملاحة" : "Start Navigation"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => speakText(msg.text)}
                      className="bg-white/10 border border-white/5 flex-1 rounded-full py-2 px-3 flex-row items-center justify-center gap-2 active:bg-white/15"
                    >
                      <Ionicons name="ear-outline" size={14} color="#00e5ff" />
                      <Text className="text-white font-bold text-xs">
                        {rtl ? "استمع" : "Listen"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text className="text-[10px] text-slate-500 mt-1 ml-2">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>
              </View>
            );
          })}

          {/* Typing Indicator */}
          {isSending && (
            <View className="flex-row justify-start items-center gap-2">
              <View
                style={{
                  backgroundColor: "rgba(17, 32, 51, 0.8)",
                  borderColor: "rgba(255, 255, 255, 0.1)",
                  borderWidth: 1,
                  borderTopLeftRadius: 4,
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.15,
                  shadowRadius: 2,
                  elevation: 1,
                }}
                className="rounded-2xl px-4 py-3 flex-row items-center gap-2"
              >
                <Text className="text-slate-400 text-xs font-semibold">AI is typing</Text>
                <ActivityIndicator size="small" color="#00e5ff" />
              </View>
            </View>
          )}

          {/* Connection Error Message */}
          {error && (
            <View className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl self-center flex-row items-center gap-2">
              <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
              <Text className="text-red-400 text-xs font-semibold">{error}</Text>
            </View>
          )}

          {/* Voice Module Error Message */}
          {voiceError && (
            <View className="px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-xl self-center flex-row items-center gap-2 mt-2">
              <Ionicons name="mic-off-outline" size={16} color="#ef4444" />
              <Text className="text-red-400 text-xs font-semibold">{voiceError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Area: Suggestions + Input */}
        <View className="bg-surface/90 border-t border-white/5 pt-4 pb-6 px-4 backdrop-blur-md">
          {/* Suggestion Chips */}
          <View className="mb-4">{renderSuggestionChips()}</View>

          {/* Input Box */}
          <View className="flex-row items-center bg-surface-variant/50 border border-white/10 rounded-full px-4 py-2">
            <TextInput
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
              placeholder={
                !buildingId
                  ? "Select a building to chat..."
                  : isConnected
                    ? "Type a store or product..."
                    : "Connecting to server..."
              }
              placeholderTextColor="#64748b"
              editable={!!buildingId && isConnected}
              className="flex-1 text-white text-[15px] mx-2 py-1.5"
              style={{ textAlign: isArabicText(inputText) ? "right" : "left" }}
            />
            {buildingId && isConnected && (
              <TouchableOpacity
                onPress={toggleListening}
                style={
                  isListening
                    ? {
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        borderColor: "rgba(239, 68, 68, 0.4)",
                        borderWidth: 1,
                      }
                    : {
                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                      }
                }
                className="w-10 h-10 rounded-full items-center justify-center mr-1.5 overflow-hidden"
              >
                {isListening && (
                  <Animated.View
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: "rgba(239, 68, 68, 0.25)",
                      transform: [{ scale: pulseAnim }],
                    }}
                  />
                )}
                <Ionicons
                  name={isListening ? "mic" : "mic-outline"}
                  size={20}
                  color={isListening ? "#ef4444" : "#00e5ff"}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || !isConnected}
              style={
                inputText.trim() && isConnected
                  ? {
                      backgroundColor: "rgb(0, 122, 255)",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 4.65,
                      elevation: 8,
                    }
                  : {
                      backgroundColor: "rgb(51, 65, 85)",
                      opacity: 0.6,
                    }
              }
              className="w-10 h-10 rounded-full items-center justify-center"
            >
              <Ionicons name="arrow-up" size={20} color="white" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* History Drawer Modal */}
      <Modal
        visible={showHistory}
        transparent={true}
        animationType="none"
        onRequestClose={closeDrawer}
      >
        <View className="flex-1 flex-row">
          {/* Backdrop overlay */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeDrawer}
            className="absolute inset-0 bg-black/65"
          />

          {/* Drawer content */}
          <Animated.View
            style={{
              transform: [{ translateX: drawerAnim }],
              width: "80%",
              height: "100%",
              backgroundColor: "#08121f",
              borderRightWidth: 1,
              borderRightColor: "rgba(255, 255, 255, 0.08)",
              paddingTop: Platform.OS === "ios" ? 60 : 40,
            }}
            className="px-5 shadow-2xl"
          >
            {/* Drawer Header */}
            <View className="flex-row justify-between items-center pb-4 border-b border-white/10 mb-4">
              <View className="flex-row items-center gap-2">
                <Ionicons name="chatbubbles" size={22} color="#00e5ff" />
                <Text className="text-lg font-bold text-white tracking-tight">
                  Chat History
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeDrawer}
                className="w-8 h-8 rounded-full bg-white/5 items-center justify-center active:bg-white/10"
              >
                <Ionicons name="chevron-back" size={18} color="white" />
              </TouchableOpacity>
            </View>

            {/* Start New Chat Button */}
            <TouchableOpacity
              onPress={() => {
                handleNewChat();
                closeDrawer();
              }}
              className="flex-row items-center justify-center gap-2 bg-brand/10 border border-brand/40 rounded-2xl py-3.5 mb-4 active:bg-brand/20"
            >
              <Ionicons name="add" size={20} color="#00e5ff" />
              <Text className="text-cyan font-bold text-sm">Start New Chat</Text>
            </TouchableOpacity>

            {/* Loading Indicator */}
            {isLoadingHistoryMessages && (
              <View className="flex-1 items-center justify-center gap-3">
                <ActivityIndicator size="small" color="#00e5ff" />
                <Text className="text-slate-400 text-xs font-medium">
                  Loading session...
                </Text>
              </View>
            )}

            {/* Scrollable list of sessions */}
            {!isLoadingHistoryMessages && (
              <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerClassName="pb-10"
              >
                {!isAuthenticated ? (
                  <View className="py-10 items-center px-2 gap-4">
                    <Ionicons name="lock-closed-outline" size={40} color="#ef4444" />
                    <Text className="text-white text-base font-bold text-center">
                      Sync Chat History
                    </Text>
                    <Text className="text-slate-400 text-center text-xs leading-5">
                      Please sign in to save your conversations, browse past chats, and
                      sync history.
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setShowHistory(false);
                        router.push("/sign-in");
                      }}
                      className="bg-brand rounded-xl px-6 py-3 active:bg-brand/80"
                    >
                      <Text className="text-white font-bold text-sm">Sign In Now</Text>
                    </TouchableOpacity>
                  </View>
                ) : !sessions || sessions.length === 0 ? (
                  <View className="py-16 items-center">
                    <Ionicons name="chatbox-ellipses-outline" size={36} color="#64748b" />
                    <Text className="text-slate-500 font-semibold text-xs mt-3 text-center">
                      No recent chats.
                    </Text>
                  </View>
                ) : (
                  <View className="gap-3">
                    {sessions.map((sess) => {
                      const isActive = sess.id === sessionId;
                      return (
                        <View
                          key={sess.id}
                          style={
                            isActive
                              ? {
                                  backgroundColor: "rgba(0, 122, 255, 0.1)",
                                  borderColor: "rgba(0, 122, 255, 0.4)",
                                  borderWidth: 1,
                                }
                              : {
                                  backgroundColor: "rgba(17, 32, 51, 0.3)",
                                  borderColor: "rgba(255, 255, 255, 0.05)",
                                  borderWidth: 1,
                                }
                          }
                          className="flex-row items-center rounded-xl p-3.5 justify-between"
                        >
                          <TouchableOpacity
                            onPress={async () => {
                              await handleLoadSession(sess.id);
                              closeDrawer();
                            }}
                            className="flex-1 flex-row items-center gap-2.5 mr-2"
                          >
                            <Ionicons
                              name="chatbubble-outline"
                              size={16}
                              color={isActive ? "#00e5ff" : "#94a3b8"}
                            />
                            <View className="flex-1 gap-0.5">
                              <Text
                                numberOfLines={1}
                                className={`font-semibold text-xs ${
                                  isActive ? "text-cyan" : "text-white"
                                }`}
                              >
                                {sess.title || "Untitled Chat"}
                              </Text>
                              <Text className="text-[9px] text-slate-500 font-medium">
                                {new Date(sess.updatedAt).toLocaleDateString()}
                              </Text>
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteSession(sess.id)}
                            className="w-7 h-7 rounded-full bg-red-500/10 items-center justify-center active:bg-red-500/20 border border-red-500/10"
                          >
                            <Ionicons name="trash-outline" size={12} color="#ef4444" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
