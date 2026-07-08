import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image as ExpoImage } from "expo-image";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBleScanner } from "@/features/ble/use-ble-scanner";
import { isOrtAvailable } from "@/features/positioning/gat";
import { useProximity } from "@/features/proximity/proximity-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useSettings } from "@/features/settings/settings-provider";
import { resolveAssetSource } from "@/lib/api-client";
import { fetchRecentVisits } from "./recent-visits-api";
import { RecentVisitRow, useNavigateToVisit } from "./recent-visit-row";
import { clearRecentVisits, deleteAccount } from "./api";
import { fetchBuildings } from "@/features/buildings/api";
import type { Building } from "@/features/buildings/types";
import { useSavedPlaces } from "@/features/buildings/saved-places-context";

// Where "Send feedback" and legal links point. Adjust when real URLs exist.
const FEEDBACK_EMAIL = "support@navimind.app";
const TERMS_URL = "https://navimind.app/terms";
const PRIVACY_URL = "https://navimind.app/privacy";

function ToggleRow({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (val: boolean) => void;
}) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-white/5">
      <View className="flex-1 mr-4">
        <Text className="text-base text-neutral-200 font-medium">{label}</Text>
        {description ? (
          <Text className="text-xs text-neutral-400 mt-0.5">{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "#334155", true: "#007AFF" }}
        thumbColor={value ? "#ffffff" : "#cbd5e1"}
        ios_backgroundColor="#334155"
      />
    </View>
  );
}

function StatusRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-white/5">
      <Text className="text-base text-neutral-200 font-medium">{label}</Text>
      <View className="flex-row items-center gap-2">
        {detail ? <Text className="text-xs text-neutral-400">{detail}</Text> : null}
        <Ionicons
          name={ok ? "checkmark-circle" : "alert-circle"}
          size={20}
          color={ok ? "#00e5ff" : "#ff4b4b"}
        />
      </View>
    </View>
  );
}

function NavRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      className="flex-row items-center justify-between py-3 border-b border-white/5"
    >
      <View className="flex-row items-center gap-3">
        <Ionicons name={icon} size={18} color={danger ? "#ff4b4b" : "#94a3b8"} />
        <Text
          className={`text-base font-medium ${danger ? "text-error" : "text-neutral-200"}`}
        >
          {label}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#64748b" />
    </TouchableOpacity>
  );
}

export function ProfileScreen() {
  const ble = useBleScanner();
  const proximity = useProximity();
  const ortReady = isOrtAvailable();
  const { user, hasToken, signOut } = useAuth();
  const {
    debugMode,
    setDebugMode,
    bypassEnabled,
    setBypassEnabled,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useSettings();
  const router = useRouter();
  const queryClient = useQueryClient();
  const navigateToVisit = useNavigateToVisit();
  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "Welcome";
  const displayEmail = user?.email ?? "Not signed in";
  const avatarSource = resolveAssetSource(user?.avatarUrl);

  const authed = !!user || hasToken;

  const { isSaved, toggleSave, isLoading: savedLoading } = useSavedPlaces();

  const { data: buildings } = useQuery<Building[]>({
    queryKey: ["buildings", "all"],
    queryFn: fetchBuildings,
  });

  const savedBuildings = (buildings ?? []).filter((b) => isSaved(b.id));

  const { data: recentVisits, isLoading: recentLoading } = useQuery({
    queryKey: ["recent-visits"],
    queryFn: fetchRecentVisits,
    enabled: authed,
  });

  const visibleVisits = recentVisits?.slice(0, 4) ?? [];
  const hasMoreVisits = (recentVisits?.length ?? 0) > 4;

  const handleClearHistory = () => {
    Alert.alert(
      "Clear visit history",
      "This removes all your recorded building and shop visits. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearRecentVisits();
              queryClient.invalidateQueries({ queryKey: ["recent-visits"] });
              queryClient.invalidateQueries({ queryKey: ["visits", "recent"] });
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Failed to clear history.");
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and all associated data. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteAccount();
              await signOut();
            } catch (err: any) {
              Alert.alert("Error", err?.message ?? "Failed to delete account.");
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-6 gap-6 pb-12">
        {/* Header / User Info */}
        <View className="items-center mb-4">
          <View className="w-24 h-24 rounded-full bg-brand/20 border-2 border-brand items-center justify-center mb-4 shadow-lg overflow-hidden">
            {avatarSource ? (
              <ExpoImage
                source={avatarSource}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
                transition={200}
              />
            ) : (
              <Ionicons name="person" size={40} color="#66b0ff" />
            )}
          </View>
          <Text className="text-2xl font-bold text-white tracking-tight">
            {displayName}
          </Text>
          <Text className="text-sm text-cyan font-medium mt-1">{displayEmail}</Text>
        </View>

        {authed && (
          <>
            {/* Account */}
            <Card>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="person-circle-outline" size={20} color="#007AFF" />
                <CardTitle>Account</CardTitle>
              </View>
              <CardDescription>Manage your profile and sign-in details.</CardDescription>
              <View className="mt-2">
                <NavRow
                  icon="create-outline"
                  label="Edit Profile"
                  onPress={() => router.push("/edit-profile")}
                />
                {user?.hasPassword && (
                  <NavRow
                    icon="lock-closed-outline"
                    label="Change Password"
                    onPress={() => router.push("/change-password")}
                  />
                )}
                <NavRow
                  icon="sparkles-outline"
                  label="Interests"
                  onPress={() => router.push("/interests?mode=edit")}
                />
                <NavRow
                  icon="people-outline"
                  label="Friends"
                  onPress={() => router.push("/friends" as any)}
                />
              </View>
            </Card>

            {/* Saved Places */}
            <Card>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="bookmark-outline" size={20} color="#007AFF" />
                <CardTitle>Saved Places</CardTitle>
              </View>
              <CardDescription>
                Your bookmarked venues — tap to view on map.
              </CardDescription>
              <View className="mt-2">
                {savedLoading ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator size="small" color="#00e5ff" />
                  </View>
                ) : savedBuildings.length === 0 ? (
                  <Text className="text-sm text-neutral-400 py-2">
                    No saved places yet.
                  </Text>
                ) : (
                  savedBuildings.map((b) => (
                    <TouchableOpacity
                      key={b.id}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push(`/map-explore?selectedId=${b.id}` as any)
                      }
                      className="flex-row items-center justify-between py-3 border-b border-white/5"
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="w-8 h-8 rounded-full bg-brand/20 items-center justify-center">
                          <Ionicons name="business" size={16} color="#66b0ff" />
                        </View>
                        <Text className="text-base font-medium text-neutral-200">
                          {b.name}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => toggleSave(b.id)} className="p-1">
                        <Ionicons name="trash-outline" size={18} color="#ff4b4b" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </Card>

            {/* Recently Visited */}
            <Card>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="time-outline" size={20} color="#007AFF" />
                <CardTitle>Recently Visited</CardTitle>
              </View>
              <CardDescription>
                Places you navigated to — tap to go again.
              </CardDescription>
              <View className="mt-2">
                {recentLoading ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator size="small" color="#00e5ff" />
                  </View>
                ) : visibleVisits.length === 0 ? (
                  <Text className="text-sm text-neutral-400 py-4">
                    No places visited yet.
                  </Text>
                ) : (
                  <>
                    {visibleVisits.map((visit) => (
                      <RecentVisitRow
                        key={visit.poiId}
                        visit={visit}
                        onPress={navigateToVisit}
                      />
                    ))}
                    {hasMoreVisits && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => router.push("/recent-visits")}
                        className="flex-row items-center justify-center gap-1 py-3"
                      >
                        <Text className="text-sm font-semibold text-cyan">View more</Text>
                        <Ionicons name="chevron-forward" size={14} color="#00e5ff" />
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            </Card>

            {/* Notifications */}
            <Card>
              <View className="flex-row items-center gap-2 mb-2">
                <Ionicons name="notifications-outline" size={20} color="#007AFF" />
                <CardTitle>Notifications</CardTitle>
              </View>
              <CardDescription>
                Choose what you'd like to be alerted about.
              </CardDescription>
              <View className="mt-2">
                <ToggleRow
                  label="Push notifications"
                  description="Nearby deals and navigation updates"
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                />
              </View>
            </Card>
          </>
        )}

        <Card>
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="hardware-chip-outline" size={20} color="#007AFF" />
            <CardTitle>System Status</CardTitle>
          </View>
          <CardDescription>Required services and their current state.</CardDescription>
          <View className="mt-2">
            <StatusRow
              label="Bluetooth scanner"
              ok={ble.available}
              detail={ble.bluetoothState}
            />
            <StatusRow label="ONNX runtime" ok={ortReady} />
            <StatusRow
              label="Location services"
              ok={proximity.locationStatus === "granted"}
              detail={proximity.locationStatus}
            />
          </View>
        </Card>

        <Card>
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="shield-checkmark-outline" size={20} color="#007AFF" />
            <CardTitle>Permissions</CardTitle>
          </View>
          <CardDescription>
            Re-request platform permissions if you previously denied them.
          </CardDescription>
          <View className="mt-4 gap-3">
            <Button
              label="Request Bluetooth permissions"
              variant="secondary"
              onPress={() => ble.requestPermissions()}
              className="border-white/10"
            />
          </View>
        </Card>

        <Card>
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="construct-outline" size={20} color="#007AFF" />
            <CardTitle>Developer Controls</CardTitle>
          </View>
          <CardDescription>
            Configure advanced options for system testing.
          </CardDescription>
          <View className="mt-2">
            <ToggleRow
              label="Debug Mode"
              description="Show diagnostic selectors on map screen"
              value={debugMode}
              onValueChange={setDebugMode}
            />
            <ToggleRow
              label="Position Bypass"
              description="Overrule real BLE positioning with test coordinates"
              value={bypassEnabled}
              onValueChange={setBypassEnabled}
            />
          </View>
        </Card>

        {/* Help & About */}
        <Card>
          <View className="flex-row items-center gap-2 mb-2">
            <Ionicons name="help-circle-outline" size={20} color="#007AFF" />
            <CardTitle>Help & About</CardTitle>
          </View>
          <CardDescription>
            Navimind — precision indoor navigation powered by BLE beacons and on-device
            AI.
          </CardDescription>
          <View className="mt-2">
            <NavRow
              icon="mail-outline"
              label="Send feedback"
              onPress={() =>
                Linking.openURL(`mailto:${FEEDBACK_EMAIL}?subject=Navimind%20Feedback`)
              }
            />
            <NavRow
              icon="document-text-outline"
              label="Terms of Service"
              onPress={() => Linking.openURL(TERMS_URL)}
            />
            <NavRow
              icon="shield-outline"
              label="Privacy Policy"
              onPress={() => Linking.openURL(PRIVACY_URL)}
            />
          </View>
        </Card>

        {/* Danger Zone */}
        {authed && (
          <Card className="border-error/40">
            <CardDescription>Irreversible actions — proceed with care.</CardDescription>
            <View className="mt-2">
              <NavRow
                icon="trash-outline"
                label="Clear visit history"
                onPress={handleClearHistory}
                danger
              />
              <NavRow
                icon="person-remove-outline"
                label="Delete account"
                onPress={handleDeleteAccount}
                danger
              />
            </View>
          </Card>
        )}

        <View className="mt-4">
          <Button
            label="Sign Out"
            variant="outline"
            className="border-error/50 bg-error/10"
            labelClasses="text-error"
            onPress={() => signOut()}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
