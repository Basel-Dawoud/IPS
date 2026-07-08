import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/features/auth/auth-provider";
import { GoogleButton } from "@/features/auth/google-button";
import { AppleButton } from "@/features/auth/apple-button";

export default function SignInScreen() {
  const { isLoading, error, signInWithEmail, signUpWithEmail } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLocalError(null);
    Keyboard.dismiss();

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedPassword) {
      setLocalError("Email and Password are required.");
      return;
    }

    if (isSignUp && trimmedPassword.length < 6) {
      setLocalError("Password must be at least 6 characters.");
      return;
    }

    try {
      if (isSignUp) {
        await signUpWithEmail(trimmedEmail, trimmedPassword, trimmedName || undefined);
      } else {
        await signInWithEmail(trimmedEmail, trimmedPassword);
      }
    } catch (err: any) {
      // The error is already handled and set in useAuth, but catching here stops execution path.
    }
  };

  const handleToggleMode = () => {
    setIsSignUp((prev) => !prev);
    setLocalError(null);
  };

  const activeError = localError || error;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-between px-8 py-12"
          keyboardShouldPersistTaps="handled"
        >
          {/* Brand & Logo */}
          <View className="items-center">
            {/* <View className="w-24 h-24 rounded-3xl bg-surface-variant/60 border border-brand/30 items-center justify-center shadow-2xl mb-4"> */}
            <Image
              source={require("@/assets/images/logo.png")}
              className="w-32 h-32"
              resizeMode="contain"
            />
            {/* </View> */}
            <Text className="text-3xl font-bold text-white tracking-tight">Navimind</Text>
            <Text className="text-sm text-neutral-400 mt-2 text-center">
              Smart indoor positioning system
            </Text>
          </View>

          {/* Authentication Form */}
          <View className="gap-5 my-8">
            <Text className="text-lg font-bold text-white mb-1">
              {isSignUp ? "Create your account" : "Sign in to Navimind"}
            </Text>

            {isSignUp && (
              <View className="gap-2">
                <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                  Full Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="John Doe"
                  placeholderTextColor="#64748b"
                  autoCapitalize="words"
                  className="bg-surface-variant/40 border border-white/5 focus:border-cyan/50 rounded-2xl px-5 py-4 text-white text-base"
                />
              </View>
            )}

            <View className="gap-2">
              <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                Email Address
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#64748b"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-surface-variant/40 border border-white/5 focus:border-cyan/50 rounded-2xl px-5 py-4 text-white text-base"
              />
            </View>

            <View className="gap-2">
              <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">
                Password
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#64748b"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                className="bg-surface-variant/40 border border-white/5 focus:border-cyan/50 rounded-2xl px-5 py-4 text-white text-base"
              />
            </View>

            {activeError && (
              <Text className="text-error text-sm font-semibold text-center mt-1">
                ⚠️ {activeError}
              </Text>
            )}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              className="bg-brand rounded-2xl py-4 items-center justify-center shadow-lg active:bg-brand/80 mt-2"
            >
              {isLoading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-white text-base font-bold">
                  {isSignUp ? "Sign Up" : "Sign In"}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleToggleMode}
              disabled={isLoading}
              className="py-2"
            >
              <Text className="text-cyan text-sm font-semibold text-center">
                {isSignUp
                  ? "Already have an account? Sign In"
                  : "Don't have an account? Sign Up"}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Social Sign-in Divider & Actions */}
          <View className="gap-6">
            <View className="flex-row items-center gap-3">
              <View className="flex-grow h-[1px] bg-white/10" />
              <Text className="text-xs font-semibold text-neutral-500 uppercase tracking-widest">
                Or continue with
              </Text>
              <View className="flex-grow h-[1px] bg-white/10" />
            </View>

            <View className="gap-4">
              <GoogleButton />
              {Platform.OS === "ios" && <AppleButton />}
            </View>

            <Text className="text-xs text-neutral-500 text-center mt-2">
              By continuing you agree to our Terms and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
