import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  View,
  Image,
  useWindowDimensions,
  TextInput,
  TouchableOpacity,
  Keyboard,
  Animated,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useBuilding } from "@/features/buildings/use-building";
import { usePositioning } from "@/features/positioning/use-positioning";
import { BEACON_TOTAL, GAT_VARIANTS, getGatConfig } from "@/features/positioning/gat";
import { setBeaconServiceDataMap } from "@/features/ble/beacon-parsing";
import { useProximity } from "@/features/proximity/proximity-provider";
import type { NearbyBuilding } from "@/features/buildings/types";
import { useBuildingPois } from "@/features/poi/use-building-pois";
import type { Poi } from "@/features/poi/types";
import { findRoute } from "@/features/pathfinding";
import type { NavStep } from "@/features/pathfinding/instructions";
import { FloorMap } from "./floor-map";
import { useHeading } from "./use-heading";
import type { PathPoint } from "./types";
import { useNavigationTarget } from "@/features/navigation/navigation-target-provider";
import { env } from "@/lib/env";
import { apiClient, resolveAssetSource } from "@/lib/api-client";
import { recordBuildingVisit } from "@/features/visits/api";
import { useSettings } from "@/features/settings/settings-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { useEmergencyAlert } from "@/features/emergency/use-emergency-alert";
import { useLocationShare } from "@/features/location-sharing/use-location-share";
import { useLocationPublisher } from "@/features/location-sharing/use-location-publisher";
import { useFriendPosition } from "@/features/location-sharing/use-friend-position";
import { ShareLocationSheet } from "@/features/location-sharing/share-location-sheet";

// Fallback coordinate extent (meters) for floors without a vector map.
const FALLBACK_MAP_WIDTH = 95;
const FALLBACK_MAP_HEIGHT = 18;

// Bypass coordinates and floor for remote testing.
const BYPASS_X = 7;
const BYPASS_Y = 7;
const BYPASS_FLOOR = 3;

// The model only outputs the along-corridor coordinate; the cross-corridor
// position is assumed static on the corridor centerline (meters). The
// centerline differs per floor (floor 4's wide corridor sits at y≈8–13.4 in
// its grid; floor 3's at y≈6.2–8.8).
const CORRIDOR_CROSS_BY_FLOOR: Record<number, number> = { 3: 7, 4: 10.4 };
const CORRIDOR_CROSS_FALLBACK_M = 7;
const corridorCrossM = (floor: number | null | undefined): number =>
  CORRIDOR_CROSS_BY_FLOOR[floor ?? -1] ?? CORRIDOR_CROSS_FALLBACK_M;

// Auto-advance the turn card when the user gets this close to a step's end.
const STEP_ADVANCE_M = 2.5;

// Recompute the route to a followed friend when they move this far (m) from
// the position the current route was computed to, or change floors.
const FRIEND_REROUTE_M = 3;

const normalize360 = (d: number): number => ((d % 360) + 360) % 360;
/** Shortest signed arc a→b in (-180, 180]. */
const shortestArc = (a: number, b: number): number =>
  ((((b - a) % 360) + 540) % 360) - 180;

/**
 * Direction arrow for a nav step. For walking steps the base east-pointing
 * arrow is rotated by `headingDeg + mapRotationDeg` so it points along the
 * route as drawn on the (possibly rotated) map. Stairs / arrival keep their
 * fixed icons.
 */
function StepArrow({
  direction,
  headingDeg,
  rotationDeg,
  size,
  color,
}: {
  direction: string;
  headingDeg?: number;
  rotationDeg?: number | null;
  size: number;
  color: string;
}) {
  if (direction === "stairs")
    return <Ionicons name="swap-vertical" size={size} color={color} />;
  if (direction === "arrive") return <Ionicons name="flag" size={size} color={color} />;
  const angle = (headingDeg ?? -90) + (rotationDeg ?? 0);
  return (
    <View style={{ transform: [{ rotate: `${angle}deg` }] }}>
      <Ionicons name="arrow-forward" size={size} color={color} />
    </View>
  );
}

export function NavigationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { target, setTarget } = useNavigationTarget();
  const { debugMode, bypassEnabled } = useSettings();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    buildingId?: string;
    poiId?: string;
    shareToken?: string;
    friendUserId?: string;
    friendName?: string;
  }>();
  const deepLinkPoiId = typeof params.poiId === "string" ? params.poiId : null;
  const explicitId = typeof params.buildingId === "string" ? params.buildingId : null;
  // Follow-a-friend mode: entered via a share link (/share/[token]) or the
  // Friends screen. Exactly one of the two identifies who we're watching.
  const shareToken = typeof params.shareToken === "string" && params.shareToken ? params.shareToken : null;
  const followFriendUserId =
    typeof params.friendUserId === "string" && params.friendUserId ? params.friendUserId : null;
  const friendName =
    typeof params.friendName === "string" && params.friendName ? params.friendName : "Friend";
  const { nearestInsideZone, candidates } = useProximity();

  // Auto-fall-back to the building the user is physically inside, if any.
  // Sticky: hold the last auto-selected building through momentary proximity
  // dropouts (GPS jitter / nearby-query refetch) so the map never unmounts
  // mid-navigation. A NEW inside-zone building replaces it immediately; an
  // explicit route param always wins.
  const stickyAutoIdRef = useRef<string | null>(null);
  if (explicitId) {
    stickyAutoIdRef.current = null;
  } else if (nearestInsideZone?.id) {
    stickyAutoIdRef.current = nearestInsideZone.id;
  }
  const autoSelectedId = explicitId ? null : (nearestInsideZone?.id ?? stickyAutoIdRef.current);
  const effectiveId = explicitId ?? autoSelectedId;

  const { data: building } = useBuilding(effectiveId);
  const { data: allPois } = useBuildingPois(effectiveId);
  const positioning = usePositioning({ autoStart: true });
  const { isEmergencyActive, emergencyData } = useEmergencyAlert(effectiveId, building?.emergencyAlert);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // ── Live location sharing ──
  // Sharer side: create/stop a share link + stream my position.
  const locationShare = useLocationShare(effectiveId);
  const [shareSheetOpen, setShareSheetOpen] = useState(false);
  // Viewer side: watch the sharer/friend and optionally route to them.
  const friendWatch = useFriendPosition({ shareToken, friendUserId: followFriendUserId });
  const friendPos = friendWatch.position;
  const [friendFollowing, setFriendFollowing] = useState(false);
  const lastRoutedFriendRef = useRef<{ x: number; y: number; floor: number } | null>(null);

  useEffect(() => {
    if (isEmergencyActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(1);
    }
  }, [isEmergencyActive]);
  const window = useWindowDimensions();
  const [floorLevel, setFloorLevel] = useState(0);
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  const [infoExpanded, setInfoExpanded] = useState(false);

  // Feed the BLE scanner the building's 0xFFF0 service-data → beaconUid map so
  // beacons resolve on iOS (which hides the iBeacon payload) as well as Android.
  const beacons = building?.beacons;
  useEffect(() => {
    setBeaconServiceDataMap((beacons ?? []).map((b) => [b.serviceData, b.beaconUid]));
  }, [beacons]);

  // Denominator for the "Beacons X/N" readout — the building's registered beacon
  // count when known, else the model's configured beacon total.
  const beaconTotal = beacons?.length || BEACON_TOTAL;

  const [search, setSearch] = useState("");
  const [destPoi, setDestPoi] = useState<Poi | null>(null);
  const [selectedPreviewPoi, setSelectedPreviewPoi] = useState<Poi | null>(null);
  const [route, setRoute] = useState<PathPoint[] | null>(null);
  const [navSteps, setNavSteps] = useState<NavStep[]>([]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [showAllSteps, setShowAllSteps] = useState(false);

  const floors = building?.floors ?? [];
  const activeFloor = useMemo(
    () => floors.find((f) => f.level === floorLevel) ?? floors[0],
    [floors, floorLevel],
  );

  // Search matches name / code / aliases.
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return (allPois ?? [])
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.code ?? "").toLowerCase().includes(q) ||
          p.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [search, allPois]);

  // Pick a destination POI → compute the on-device route from the live position.
  const selectDestination = (poi: Poi) => {
    // A POI destination replaces any follow-a-friend routing.
    setFriendFollowing(false);
    lastRoutedFriendRef.current = null;
    setDestPoi(poi);
    setSelectedPreviewPoi(null);
    setSearch("");
    if (floors.some((f) => f.level === poi.floorLevel)) setFloorLevel(poi.floorLevel);
    const startFloor = bypassEnabled
      ? BYPASS_FLOOR
      : (positioning.floor ?? activeFloor?.level ?? poi.floorLevel);
    const startX = bypassEnabled ? BYPASS_X : (positioning.y ?? 0);
    const startY = bypassEnabled ? BYPASS_Y : corridorCrossM(startFloor);
    const res = findRoute({
      startFloor,
      startXm: startX,
      startYm: startY,
      endFloor: poi.floorLevel,
      endXm: poi.x,
      endYm: poi.y,
      stepFree: !!user?.needsStepFree,
    });
    setRoute(res?.waypoints ?? null);
    setNavSteps(res?.steps ?? []);
    setCurrentStepIdx(0);
    setShowAllSteps(false);
    setRecenterTrigger((prev) => prev + 1);

    // Record visit start in backend (recommendation analytics).
    apiClient.post(`/client/recommendations/${poi.id}/visit`).catch((err) => {
      console.warn("Failed to record navigation visit start:", err);
    });

    // "Visit Again": the user chose to navigate → record the building + shop
    // (drives the Home last-visited list; ignored for guests).
    const visitBuildingId = effectiveId ?? poi.buildingId;
    if (visitBuildingId) {
      recordBuildingVisit(visitBuildingId, poi.id).catch(() => {});
    }
  };

  const handleSelectPoi = (poi: Poi) => {
    const isPreviewType = ["ROOM", "LAB", "OTHER", "STORE"].includes(poi.type);
    if (isPreviewType) {
      setSelectedPreviewPoi(poi);
      setSearch("");
      if (floors.some((f) => f.level === poi.floorLevel)) {
        setFloorLevel(poi.floorLevel);
      }
    } else {
      selectDestination(poi);
    }
  };

  // Automatically select destination when target is set by chatbot
  useEffect(() => {
    if (target && floors.length > 0) {
      handleSelectPoi(target);
      setTarget(null);
    }
  }, [target, floors]);

  // Deep-link auto-select: /navigation?buildingId=X&poiId=Y (from deals,
  // search, and "Visit Again"). Fires once when the POI list is ready.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current || !deepLinkPoiId || !allPois) return;
    const poi = allPois.find((p) => p.id === deepLinkPoiId);
    if (poi) {
      deepLinkHandledRef.current = true;
      handleSelectPoi(poi);
    }
  }, [deepLinkPoiId, allPois]);

  const clearDestination = () => {
    setDestPoi(null);
    setSelectedPreviewPoi(null);
    setFriendFollowing(false);
    lastRoutedFriendRef.current = null;
    setRoute(null);
    setNavSteps([]);
    setCurrentStepIdx(0);
    setShowAllSteps(false);
    setRecenterTrigger((prev) => prev + 1);
  };

  const currentStep = navSteps[currentStepIdx] ?? null;
  const totalDistanceM = navSteps.reduce((sum, s) => sum + s.distanceM, 0);
  // Rough ETA: ~1.2 m/s walking speed
  const remainingDistanceM = navSteps
    .slice(currentStepIdx)
    .reduce((sum, s) => sum + s.distanceM, 0);
  const etaSeconds = Math.round(remainingDistanceM / 1.2);

  // Auto-follow the predicted floor on each transition when a matching floor tab
  // exists. Manual taps still win between transitions (until the model's floor changes again).
  const lastAutoFloorRef = useRef<number | null>(null);
  useEffect(() => {
    const pf = positioning.floor;
    if (pf == null || pf === lastAutoFloorRef.current) return;
    if (floors.some((f) => f.level === pf)) {
      lastAutoFloorRef.current = pf;
      setFloorLevel(pf);
    }
  }, [positioning.floor, floors]);

  // 1-D corridor: the model returns the along-corridor position (x); the cross
  // position is the corridor centerline. Both in METER coords (same as POIs/route).
  const userPosition = useMemo(() => {
    if (bypassEnabled) {
      return { x: BYPASS_X, y: BYPASS_Y };
    }
    return positioning.y == null
      ? null
      : { x: positioning.y, y: corridorCrossM(positioning.floor) };
  }, [positioning.y, positioning.floor, bypassEnabled]);

  // Automatically manage route calculations and evacuation destination during an emergency
  useEffect(() => {
    if (!isEmergencyActive || !allPois || !floors.length) return;

    let targetPoi: Poi | null = null;
    if (emergencyData?.gatheringPointId) {
      targetPoi = allPois.find((p) => p.id === emergencyData.gatheringPointId) ?? null;
    }

    if (!targetPoi) {
      const exits = allPois.filter((p) => p.isEmergencyExit);
      if (exits.length > 0) {
        const startFloor = bypassEnabled ? BYPASS_FLOOR : (positioning.floor ?? activeFloor?.level ?? 0);
        const startX = bypassEnabled ? BYPASS_X : (positioning.y ?? 0);
        const startY = bypassEnabled ? BYPASS_Y : corridorCrossM(startFloor);

        let bestExit = exits[0];
        let minDist = Infinity;
        for (const exit of exits) {
          const floorDiffPenalty = exit.floorLevel === startFloor ? 0 : 50;
          const dist = Math.hypot(exit.x - startX, exit.y - startY) + floorDiffPenalty;
          if (dist < minDist) {
            minDist = dist;
            bestExit = exit;
          }
        }
        targetPoi = bestExit;
      }
    }

    if (!targetPoi) {
      const fallbackExits = allPois.filter((p) => p.type === "STAIRS" || p.type === "ELEVATOR");
      if (fallbackExits.length > 0) {
        targetPoi = fallbackExits[0];
      }
    }

    if (targetPoi) {
      setDestPoi(targetPoi);
      if (floors.some((f) => f.level === targetPoi.floorLevel)) {
        setFloorLevel(targetPoi.floorLevel);
      }

      const startFloor = bypassEnabled ? BYPASS_FLOOR : (positioning.floor ?? activeFloor?.level ?? targetPoi.floorLevel);
      const startX = bypassEnabled ? BYPASS_X : (positioning.y ?? 0);
      const startY = bypassEnabled ? BYPASS_Y : corridorCrossM(startFloor);

      const res = findRoute({
        startFloor,
        startXm: startX,
        startYm: startY,
        endFloor: targetPoi.floorLevel,
        endXm: targetPoi.x,
        endYm: targetPoi.y,
        stepFree: !!user?.needsStepFree,
        blockedPoiIds: emergencyData?.blockedPoiIds,
        allPois,
      });

      setRoute(res?.waypoints ?? null);
      setNavSteps(res?.steps ?? []);
      setCurrentStepIdx(0);
      setShowAllSteps(false);
    }
  }, [isEmergencyActive, emergencyData, userPosition?.x, userPosition?.y, allPois, floors]);

  // Clear emergency destination when alert is cleared
  const prevEmergencyActiveRef = useRef(false);
  useEffect(() => {
    if (prevEmergencyActiveRef.current && !isEmergencyActive) {
      clearDestination();
    }
    prevEmergencyActiveRef.current = isEmergencyActive;
  }, [isEmergencyActive]);

  // Proximity arrival tracking
  useEffect(() => {
    if (!destPoi || !userPosition) return;

    const currentFloor = bypassEnabled ? BYPASS_FLOOR : positioning.floor;
    if (currentFloor !== destPoi.floorLevel) return;

    const dist = Math.sqrt(
      Math.pow(userPosition.x - destPoi.x, 2) + Math.pow(userPosition.y - destPoi.y, 2),
    );

    // Read arrival threshold from configuration environment (defaults to 2.0 meters)
    const threshold = Number(process.env.EXPO_PUBLIC_POI_ARRIVE_THRESHOLD_METERS ?? 2.0);

    if (dist <= threshold) {
      apiClient
        .post(`/client/recommendations/${destPoi.id}/arrive`)
        .then(() => {
          console.log("Successfully recorded arrival at POI:", destPoi.name);
        })
        .catch((err) => {
          console.warn("Failed to record navigation arrival:", err);
        });
    }
  }, [userPosition, destPoi, positioning.floor, bypassEnabled]);

  const userFloor = bypassEnabled ? BYPASS_FLOOR : positioning.floor;
  const showUserDot = userFloor === (activeFloor?.level ?? 0);

  // Stream my live position to the backend relay: while I have an active
  // share link, or (signed-in with "friends can see me" on) for presence.
  const presenceEnabled = !!user && (user.shareWithFriends ?? true);
  useLocationPublisher({
    enabled: !!effectiveId && (locationShare.activeShare != null || presenceEnabled),
    buildingId: effectiveId,
    x: userPosition?.x ?? null,
    y: userPosition?.y ?? null,
    floorLevel: userFloor ?? null,
    refreshKey: locationShare.refreshKey,
  });

  // Follow-a-friend live re-route: recompute when the friend moves more than
  // FRIEND_REROUTE_M from where the current route ends, or changes floor.
  // The route starts at my live position, so resetting to step 0 stays correct.
  useEffect(() => {
    if (!friendFollowing || !friendPos || isEmergencyActive) return;
    const last = lastRoutedFriendRef.current;
    const moved =
      !last ||
      last.floor !== friendPos.floorLevel ||
      Math.hypot(friendPos.x - last.x, friendPos.y - last.y) > FRIEND_REROUTE_M;
    if (!moved) return;
    lastRoutedFriendRef.current = {
      x: friendPos.x,
      y: friendPos.y,
      floor: friendPos.floorLevel,
    };
    const startFloor = bypassEnabled
      ? BYPASS_FLOOR
      : (positioning.floor ?? activeFloor?.level ?? friendPos.floorLevel);
    const startX = bypassEnabled ? BYPASS_X : (positioning.y ?? 0);
    const startY = bypassEnabled ? BYPASS_Y : corridorCrossM(startFloor);
    const res = findRoute({
      startFloor,
      startXm: startX,
      startYm: startY,
      endFloor: friendPos.floorLevel,
      endXm: friendPos.x,
      endYm: friendPos.y,
      stepFree: !!user?.needsStepFree,
    });
    setRoute(res?.waypoints ?? null);
    setNavSteps(res?.steps ?? []);
    setCurrentStepIdx(0);
  }, [friendFollowing, friendPos, isEmergencyActive]);

  // The sharer stopped (or the link expired) while we were watching.
  useEffect(() => {
    if (!friendWatch.ended) return;
    Alert.alert("Live location ended", `${friendName} stopped sharing their location.`);
    if (friendFollowing) {
      setRoute(null);
      setNavSteps([]);
      setCurrentStepIdx(0);
    }
    setFriendFollowing(false);
    lastRoutedFriendRef.current = null;
  }, [friendWatch.ended]);

  // ── User facing direction (compass + IMU), Google-Maps-style cone ──
  const heading = useHeading({ enabled: showUserDot && !bypassEnabled });

  // Movement bearing in the MAP frame from recent along-corridor deltas: +x
  // (increasing metres) → 90°, −x → 270°. Used as a gentle nudge so the cone
  // agrees with the direction the user is actually walking.
  const posHistRef = useRef<{ x: number; t: number }[]>([]);
  const movementBearingRef = useRef<number | null>(null);
  useEffect(() => {
    if (!userPosition) return;
    const now = Date.now();
    const hist = posHistRef.current;
    hist.push({ x: userPosition.x, t: now });
    while (hist.length > 1 && now - hist[0].t > 3000) hist.shift();
    const dx = userPosition.x - hist[0].x;
    movementBearingRef.current = Math.abs(dx) > 1.5 ? (dx > 0 ? 90 : 270) : null;
  }, [userPosition]);

  const northOffset = building?.northOffsetDeg ?? 0;
  let headingMapDeg: number | null =
    heading.headingDeg == null
      ? null
      : normalize360(heading.headingDeg - northOffset);
  // Display-only movement nudge; skip when far off to avoid 180° flips.
  if (headingMapDeg != null && movementBearingRef.current != null) {
    const diff = shortestArc(headingMapDeg, movementBearingRef.current);
    if (Math.abs(diff) < 60) headingMapDeg = normalize360(headingMapDeg + 0.1 * diff);
  }

  // Auto-advance the turn card as the live position reaches each step's end
  // anchor. Stairs steps advance when the predicted floor becomes the target
  // floor. Manual Previous/Next still work between updates.
  useEffect(() => {
    const step = navSteps[currentStepIdx];
    if (!step || step.direction === "arrive") return;
    if (step.direction === "stairs") {
      if (userFloor === step.floorLevel) {
        setCurrentStepIdx((i) => Math.min(navSteps.length - 1, i + 1));
      }
      return;
    }
    if (!userPosition || userFloor !== step.floorLevel) return;
    const dist = Math.hypot(userPosition.x - step.endXm, userPosition.y - step.endYm);
    if (dist <= STEP_ADVANCE_M) {
      setCurrentStepIdx((i) => Math.min(navSteps.length - 1, i + 1));
    }
  }, [navSteps, currentStepIdx, userPosition, userFloor]);

  // Header bar height (safe-area top + padding + content + padding)
  const HEADER_HEIGHT = insets.top + 30;
  const BOTTOM_INSET = 120; // keep the map away from the screen bottom
  // While navigating, the turn card overlays the top of the map — pad the map
  // down a bit so the full route stays visible beneath it.
  const NAV_TOP_PAD = destPoi || friendFollowing ? 10 : 0;
  const displayWidth = window.width;
  const displayHeight = window.height - HEADER_HEIGHT - BOTTOM_INSET - NAV_TOP_PAD;

  // No effective building → empty state (adaptive to nearby candidates).
  if (!building) {
    return <NavigationEmptyState candidates={candidates} />;
  }

  const showInsideBanner = !!autoSelectedId && !!nearestInsideZone;

  return (
    <View
      className="flex-1 bg-background"
      onStartShouldSetResponderCapture={() => {
        Keyboard.dismiss();
        return false;
      }}
    >
      {/* Header bar (Branded Normal OR Red Emergency Alert Header) */}
      <View
        style={{ paddingTop: insets.top, zIndex: 20 }}
        className={`border-b px-6 pb-3 ${
          isEmergencyActive
            ? "bg-red-700 border-red-900"
            : "bg-background/85 border-white/5"
        }`}
      >
        <View className="flex-row items-center justify-between">
          {isEmergencyActive ? (
            <View className="flex-1 flex-row items-center gap-3">
              <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
                <Ionicons name="alert-circle" size={26} color="white" />
              </Animated.View>
              <View className="flex-1">
                <Text className="text-white font-black text-xs uppercase tracking-wide">
                  Emergency Alert
                </Text>
                <Text className="text-red-100 text-[13px] font-bold leading-tight" numberOfLines={1}>
                  {emergencyData?.message || "Evacuate Immediately!"}
                </Text>
              </View>
            </View>
          ) : (
            <View className="flex-row items-center gap-2">
              <Image
                source={require("@/assets/images/logo.png")}
                className="w-8 h-8"
                resizeMode="contain"
              />
              <Text className="text-xl font-bold text-white tracking-tight">Navimind</Text>
            </View>
          )}

          <View className="flex-row items-center">
            {!isEmergencyActive ? (
              <TouchableOpacity
                onPress={() => {
                  if (!user) {
                    Alert.alert("Sign in required", "Sign in to share your live location.");
                    return;
                  }
                  setShareSheetOpen(true);
                }}
                className="ml-2"
              >
                <Ionicons name="share-social-outline" size={22} color="#d4e4fa" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => router.back()} className="ml-4">
              <Ionicons
                name="arrow-back"
                size={22}
                color={isEmergencyActive ? "white" : "#d4e4fa"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Map layer — starts below header, stops above bottom area */}
      <View style={{ flex: 1, paddingTop: NAV_TOP_PAD }}>
        <FloorMap
          vectorMap={activeFloor?.vectorMap ?? null}
          mapUrl={activeFloor?.mapUrl ?? null}
          width={
            activeFloor?.widthMeters ??
            activeFloor?.vectorMap?.widthM ??
            FALLBACK_MAP_WIDTH
          }
          height={
            activeFloor?.heightMeters ??
            activeFloor?.vectorMap?.heightM ??
            FALLBACK_MAP_HEIGHT
          }
          rotationDeg={activeFloor?.rotationDeg ?? 0}
          position={showUserDot ? userPosition : null}
          friendMarker={
            friendPos && friendPos.floorLevel === (activeFloor?.level ?? 0)
              ? { x: friendPos.x, y: friendPos.y, name: friendName }
              : null
          }
          headingMapDeg={showUserDot ? headingMapDeg : null}
          headingAccuracyDeg={heading.accuracyDeg}
          path={route ?? undefined}
          pois={allPois ?? []}
          destinationPoiId={destPoi?.id ?? selectedPreviewPoi?.id ?? null}
          onSelectPoi={handleSelectPoi}
          currentFloorLevel={activeFloor?.level ?? 0}
          displayWidth={displayWidth}
          displayHeight={displayHeight}
          recenterTrigger={recenterTrigger}
        />
      </View>

      {/* Debug-only north rose — shows where real-world north sits on the map.
          Screen angle = floor rotationDeg − building northOffsetDeg. */}
      {debugMode && (
        <View
          pointerEvents="none"
          className="absolute items-center justify-center rounded-full bg-black/50 border border-white/15"
          style={{
            top: HEADER_HEIGHT + 16,
            right: 16,
            width: 44,
            height: 44,
          }}
        >
          <View
            style={{
              transform: [
                { rotate: `${(activeFloor?.rotationDeg ?? 0) - northOffset}deg` },
              ],
            }}
            className="items-center"
          >
            <Ionicons name="arrow-up" size={20} color="#f87171" />
          </View>
          <Text className="text-[8px] font-bold text-white absolute bottom-1">N</Text>
        </View>
      )}

      {/* Overlay controls (search, destination, floor selector, details card) */}
      <View
        className="absolute inset-0"
        style={{ top: HEADER_HEIGHT }}
        pointerEvents="box-none"
      >
        <View className="flex-1 justify-between p-6 pb-8" pointerEvents="box-none">
          {/* Top layout area */}
          <View className="gap-4" pointerEvents="box-none">
            {/* Header row / Search bar OR Turn Instructions Card */}
            {isEmergencyActive && (!destPoi || !currentStep) ? (
              <View
                className="w-full flex-row items-center border border-red-600 rounded-2xl px-4 py-3.5 bg-red-950/95"
              >
                <View className="w-10 h-10 rounded-xl bg-red-900 border border-red-600 items-center justify-center mr-3">
                  <Ionicons name="warning" size={22} color="white" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base leading-snug animate-pulse">
                    Calculating Evacuation Route...
                  </Text>
                  <Text className="text-xs text-red-200 mt-0.5">
                    Please stand by or head to the nearest exit.
                  </Text>
                </View>
              </View>
            ) : (destPoi || friendFollowing) && currentStep ? (
              <View
                className={`w-full flex-row items-center border rounded-2xl px-4 py-3.5 ${
                  isEmergencyActive ? "border-red-600/50" : "border-brand/40"
                }`}
                style={{
                  backgroundColor: isEmergencyActive
                    ? "rgba(127, 29, 29, 0.95)"
                    : "rgba(17, 32, 51, 0.95)",
                }}
              >
                {/* Direction icon — rotated to match the drawn route */}
                <View
                  className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${
                    isEmergencyActive ? "bg-red-950/20 border border-red-500/30" : "bg-brand/20 border border-brand/40"
                  }`}
                >
                  <StepArrow
                    direction={currentStep.direction}
                    headingDeg={currentStep.headingDeg}
                    rotationDeg={activeFloor?.rotationDeg ?? 0}
                    size={22}
                    color={isEmergencyActive ? "#ff4b4b" : "#00e5ff"}
                  />
                </View>
                {/* Instruction Text */}
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base leading-snug">
                    {currentStep.text}
                  </Text>
                  <Text className={`text-xs mt-0.5 ${isEmergencyActive ? "text-red-300" : "text-neutral-400"}`}>
                    Step {currentStepIdx + 1} of {navSteps.length}
                    {currentStep.distanceM > 0 &&
                      ` • In ${currentStep.distanceM.toFixed(0)}m`}
                  </Text>
                </View>
              </View>
            ) : (
              <View className="flex-row items-center">
                <View
                  className="flex-1 flex-row items-center border border-white/10 rounded-full px-4 py-2.5 shadow-lg"
                  style={{ backgroundColor: "rgba(17, 32, 51, 0.85)" }}
                >
                  <Ionicons name="search" size={20} color="#94a3b8" />
                  <TextInput
                    placeholder="Search places..."
                    placeholderTextColor="#94a3b8"
                    className="flex-1 text-white text-base ml-3"
                    value={search}
                    onChangeText={setSearch}
                  />
                  <TouchableOpacity className="ml-2">
                    <Ionicons name="mic" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Search results */}
            {searchResults.length > 0 ? (
              <View
                className="border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
                style={{ backgroundColor: "rgba(17, 32, 51, 0.95)" }}
              >
                {searchResults.map((poi) => (
                  <TouchableOpacity
                    key={poi.id}
                    className="flex-row items-center gap-3 px-4 py-3 border-b border-white/5"
                    onPress={() => handleSelectPoi(poi)}
                  >
                    <Ionicons name="location" size={18} color="#38bdf8" />
                    <View className="flex-1">
                      <Text className="text-white font-medium" numberOfLines={1}>
                        {poi.name}
                      </Text>
                      <Text className="text-xs text-neutral-400">
                        {poi.category ?? poi.type} • Floor {poi.floorLevel}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Active live-location share pill */}
            {locationShare.activeShare ? (
              <View className="self-start flex-row items-center gap-2 bg-emerald-950/90 border border-emerald-500/40 rounded-full pl-3 pr-1.5 py-1.5">
                <View className="w-2 h-2 rounded-full bg-emerald-400" />
                <Text className="text-emerald-200 text-xs font-semibold">
                  Sharing live location
                </Text>
                <TouchableOpacity
                  onPress={locationShare.stop}
                  className="bg-emerald-900 border border-emerald-500/40 rounded-full px-2.5 py-1 ml-1"
                >
                  <Text className="text-emerald-100 text-[11px] font-bold">Stop</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Status badge - Only visible when debug mode is enabled */}
            {debugMode ? (
              <View className="self-start bg-surface-variant/80 border border-white/10 rounded-full px-4 py-2 shadow-sm">
                <Text className="text-xs font-bold tracking-widest text-brand uppercase">
                  {activeFloor?.name ?? "Floor"} •{" "}
                  {bypassEnabled
                    ? `BYPASS • FLOOR ${BYPASS_FLOOR} • ${BYPASS_X.toFixed(1)}M, ${BYPASS_Y.toFixed(1)}M`
                    : positioning.active
                      ? `${positioning.ready ? "TRACKING" : "WARMING UP"}${
                          positioning.floor != null ? ` • FLOOR ${positioning.floor}` : ""
                        }${positioning.y != null ? ` • ${positioning.y.toFixed(1)}M` : ""}`
                      : "IDLE"}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Middle/Bottom area layout */}
          <View className="gap-4 items-stretch" pointerEvents="box-none">
            {/* Floor selector & floating controls (recenter, chatbot) */}
            <View className="self-end gap-3 items-center mb-2" pointerEvents="box-none">
              {/* Floor selector (vertical pill float) */}
              {floors.length > 1 ? (
                <View className="bg-neutral-900/85 border border-white/10 rounded-3xl p-1 shadow-2xl gap-2 items-center">
                  {floors.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      className={`w-10 h-10 items-center justify-center rounded-full ${
                        f.level === floorLevel ? "bg-brand/80" : "bg-transparent"
                      }`}
                      onPress={() => setFloorLevel(f.level)}
                    >
                      <Text
                        className={`font-semibold text-xs ${
                          f.level === floorLevel ? "text-white" : "text-neutral-400"
                        }`}
                      >
                        L{f.level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View className="w-8 h-px bg-white/10 my-1" />
                  <View className="w-10 h-10 items-center justify-center">
                    <Ionicons name="layers-outline" size={18} color="#94a3b8" />
                  </View>
                </View>
              ) : null}

              {/* Recenter Button */}
              <TouchableOpacity
                className="w-12 h-12 rounded-2xl bg-neutral-900/85 border border-white/10 items-center justify-center shadow-lg active:bg-neutral-800"
                onPress={() => {
                  if (userFloor != null && floors.some((f) => f.level === userFloor)) {
                    setFloorLevel(userFloor);
                  }
                  setRecenterTrigger((prev) => prev + 1);
                }}
              >
                <Ionicons name="locate" size={22} color="#00e5ff" />
              </TouchableOpacity>

              {/* Chatbot Button */}
              <TouchableOpacity
                className="w-12 h-12 rounded-full bg-neutral-950 border border-white/10 items-center justify-center shadow-lg active:bg-neutral-900"
                onPress={() => router.push("/chatbot" as any)}
              >
                <Ionicons name="chatbubbles" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Bottom Panel Conditional: Show Navigation Info Card if navigating, else if selectedPreviewPoi show Place Preview Card, else Building Info Bar */}
            {(destPoi || friendFollowing) && currentStep ? (
              <View className="gap-2">
                {/* Navigation Status Card */}
                <View
                  className={`border border-white/10 rounded-2xl px-5 py-4 ${
                    isEmergencyActive ? "bg-red-950/95 border-red-500/50" : "bg-[#112033]/95"
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 mr-3">
                      <Text className={`text-[10px] font-bold tracking-wider uppercase ${
                        isEmergencyActive ? "text-red-400" : "text-cyan"
                      }`}>
                        {isEmergencyActive ? "🚨 EMERGENCY EVACUATION ROUTE" : "Navigate to"}
                      </Text>
                      <Text
                        className="text-white font-bold text-lg mt-0.5"
                        numberOfLines={1}
                      >
                        {destPoi?.name ?? friendName}
                      </Text>
                      <Text className={`text-xs font-semibold mt-1 ${
                        isEmergencyActive ? "text-red-300" : "text-brand"
                      }`}>
                        {etaSeconds < 60
                           ? `${etaSeconds}s`
                           : `${Math.ceil(etaSeconds / 60)} min`}{" "}
                        • {remainingDistanceM.toFixed(0)}m left
                      </Text>
                      <Text className="text-[11px] text-neutral-400 mt-0.5">
                        Floor {destPoi?.floorLevel ?? friendPos?.floorLevel ?? "—"}{" "}
                        {destPoi?.category
                          ? `• ${destPoi.category}`
                          : friendFollowing
                            ? "• Live location"
                            : ""}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-2.5">
                      {/* Toggle Steps List Button */}
                      <TouchableOpacity
                        className="py-2.5 px-3 rounded-xl items-center bg-neutral-800 border border-white/10 h-11 justify-center"
                        activeOpacity={0.8}
                        onPress={() => setShowAllSteps((v) => !v)}
                      >
                        <Ionicons
                           name={showAllSteps ? "chevron-up" : "list"}
                          size={20}
                          color="#94a3b8"
                        />
                      </TouchableOpacity>

                      {/* Cancel Navigation Button (hidden during emergency) */}
                      {!isEmergencyActive && (
                        <TouchableOpacity
                          onPress={clearDestination}
                          activeOpacity={0.8}
                          className="bg-neutral-800 border border-red-500/30 w-11 h-11 rounded-xl items-center justify-center"
                        >
                          <Ionicons name="close" size={22} color="#ff4b4b" />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Progress Line */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginTop: 12,
                    }}
                  >
                    <Text className="text-[11px] text-neutral-400 font-medium">
                      Step {currentStepIdx + 1} of {navSteps.length}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 4,
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        borderRadius: 2,
                        marginLeft: 12,
                        overflow: "hidden",
                      }}
                    >
                      <View
                        style={{
                          height: "100%",
                          backgroundColor: isEmergencyActive ? "#ef4444" : "#007AFF",
                          borderRadius: 2,
                          width: `${((currentStepIdx + 1) / navSteps.length) * 100}%`,
                        }}
                      />
                    </View>
                  </View>
                </View>

                {/* Expanded all-steps list */}
                {showAllSteps && (
                  <View
                    className={`border border-white/10 rounded-2xl overflow-hidden ${
                      isEmergencyActive ? "bg-red-950/95" : "bg-[#112033]/95"
                    }`}
                  >
                    <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                      {navSteps.map((step, idx) => (
                        <TouchableOpacity
                          key={idx}
                          className={`flex-row items-center gap-3 px-4 py-3 border-b border-white/5 ${
                            idx === currentStepIdx ? "bg-brand/10" : ""
                          }`}
                          activeOpacity={0.8}
                          onPress={() => {
                            setCurrentStepIdx(idx);
                            setShowAllSteps(false);
                          }}
                        >
                          <View
                            className={`w-7 h-7 rounded-lg items-center justify-center ${
                              idx === currentStepIdx ? "bg-brand/25" : "bg-neutral-800"
                            }`}
                          >
                            <StepArrow
                              direction={step.direction}
                              headingDeg={step.headingDeg}
                              rotationDeg={activeFloor?.rotationDeg ?? 0}
                              size={14}
                              color={idx === currentStepIdx ? "#66b0ff" : "#94a3b8"}
                            />
                          </View>
                          <Text
                            className={`flex-1 text-sm ${
                              idx === currentStepIdx
                                ? "text-white font-semibold"
                                : "text-neutral-300"
                            }`}
                            numberOfLines={1}
                          >
                            {step.text}
                          </Text>
                          {step.distanceM > 0 && (
                            <Text className="text-[10px] text-neutral-500 font-medium">
                              {step.distanceM.toFixed(0)}m
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>
            ) : selectedPreviewPoi ? (
              <View
                className="border border-white/10 rounded-2xl p-5 gap-4 bg-[#112033]/95"
              >
                {/* Header row: Icon and Name/Category */}
                <View className="flex-row items-center">
                  <View className="w-12 h-12 rounded-full overflow-hidden border border-white/15 bg-neutral-900 items-center justify-center mr-3">
                    {selectedPreviewPoi.iconUrl ? (
                      <Image
                        source={resolveAssetSource(selectedPreviewPoi.iconUrl) as any}
                        style={{ width: "100%", height: "100%" }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="location" size={24} color="#00e5ff" />
                    )}
                  </View>
                  <View className="flex-1 mr-2">
                    <Text className="text-white font-bold text-lg leading-tight" numberOfLines={1}>
                      {selectedPreviewPoi.name}
                    </Text>
                    <Text className="text-xs text-cyan font-bold uppercase tracking-wider mt-0.5" numberOfLines={1}>
                      {selectedPreviewPoi.category ?? selectedPreviewPoi.type} • Floor {selectedPreviewPoi.floorLevel}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedPreviewPoi(null)}
                    activeOpacity={0.8}
                    className="w-8 h-8 rounded-full bg-white/5 items-center justify-center"
                  >
                    <Ionicons name="close" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                {/* Description & Gallery Section */}
                <View className="gap-3">
                  {/* Short Description */}
                  {selectedPreviewPoi.description ? (
                    <Text className="text-sm text-neutral-300 leading-normal" numberOfLines={3}>
                      {selectedPreviewPoi.description}
                    </Text>
                  ) : null}

                  {/* Image Gallery */}
                  {selectedPreviewPoi.images && selectedPreviewPoi.images.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      className="flex-row gap-2 mt-1"
                      nestedScrollEnabled
                    >
                      {selectedPreviewPoi.images.map((imgUrl, idx) => (
                        <View key={idx} className="w-48 h-28 rounded-xl overflow-hidden border border-white/5 bg-neutral-900 mr-2">
                          <Image
                            source={resolveAssetSource(imgUrl) as any}
                            style={{ width: "100%", height: "100%" }}
                            resizeMode="cover"
                          />
                        </View>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>

                {/* Action Buttons: Navigate or Cancel */}
                <View className="flex-row gap-3 mt-1">
                  <TouchableOpacity
                    className="flex-1 h-12 bg-brand rounded-2xl items-center justify-center flex-row gap-2"
                    activeOpacity={0.8}
                    onPress={() => {
                      selectDestination(selectedPreviewPoi);
                    }}
                  >
                    <Ionicons name="navigate" size={18} color="white" />
                    <Text className="text-white font-bold text-sm">Navigate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="h-12 px-6 bg-neutral-800 border border-white/10 rounded-2xl items-center justify-center"
                    activeOpacity={0.8}
                    onPress={() => setSelectedPreviewPoi(null)}
                  >
                    <Text className="text-neutral-300 font-semibold text-sm">Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (shareToken || followFriendUserId) && !friendFollowing && !friendWatch.ended ? (
              /* Watching a shared location, not routing yet */
              friendPos ? (
                <View className="border border-emerald-500/30 rounded-2xl p-5 gap-4 bg-[#112033]/95">
                  <View className="flex-row items-center gap-3">
                    <View className="w-11 h-11 rounded-full bg-emerald-500/15 border border-emerald-500/40 items-center justify-center">
                      <Ionicons name="person" size={20} color="#34d399" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-white font-bold text-lg" numberOfLines={1}>
                        {friendName}
                      </Text>
                      <Text className="text-xs text-emerald-300 font-semibold mt-0.5">
                        Live • Floor {friendPos.floorLevel}
                        {friendPos.floorLevel !== (activeFloor?.level ?? 0)
                          ? " — switch floors to see them"
                          : ""}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    className="h-12 bg-emerald-600 rounded-2xl items-center justify-center flex-row gap-2"
                    activeOpacity={0.85}
                    onPress={() => {
                      setDestPoi(null);
                      setSelectedPreviewPoi(null);
                      setFriendFollowing(true);
                      setRecenterTrigger((prev) => prev + 1);
                    }}
                  >
                    <Ionicons name="navigate" size={18} color="white" />
                    <Text className="text-white font-bold text-sm">Navigate to them</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View className="border border-white/10 rounded-2xl px-5 py-4 bg-[#112033]/95 flex-row items-center gap-3">
                  <Ionicons name="radio-outline" size={20} color="#34d399" />
                  <View className="flex-1">
                    <Text className="text-white font-semibold">
                      Locating {friendName}…
                    </Text>
                    <Text className="text-xs text-neutral-400 mt-0.5">
                      {friendWatch.error ??
                        "Waiting for their live position. They need the app open."}
                    </Text>
                  </View>
                </View>
              )
            ) : (
              /* Compact building info bar (collapsible) */
              <View className="bg-surface-variant/90 border border-white/10 rounded-2xl overflow-hidden">
                {/* Collapsed row — always visible */}
                <TouchableOpacity
                  className="flex-row items-center gap-3 px-4 py-3"
                  onPress={() => setInfoExpanded((v) => !v)}
                  activeOpacity={0.8}
                >
                  {/* Building name */}
                  <Text
                    className="text-white font-semibold text-sm flex-1"
                    numberOfLines={1}
                  >
                    {building.name}
                  </Text>

                  {/* Accuracy badge */}
                  <View className="flex-row items-center gap-1">
                    <View
                      className={`w-1.5 h-1.5 rounded-full ${positioning.ready ? "bg-emerald-400" : "bg-amber-400"}`}
                    />
                    <Text className="text-[10px] font-semibold text-neutral-300">
                      {positioning.ready ? "High Accuracy" : "Locating..."}
                    </Text>
                  </View>

                  {/* Distance */}
                  <Text className="text-cyan text-[10px] font-bold">
                    {candidates.find((c) => c.id === building.id)
                      ? `${Math.round(candidates.find((c) => c.id === building.id)!.distanceMeters)}m`
                      : ""}
                  </Text>

                  {/* Beacons detected (only when > 0) */}
                  {positioning.uniqueBeacons > 0 && (
                    <View className="flex-row items-center gap-1 bg-brand/10 border border-brand/20 rounded-full px-2 py-0.5">
                      <Ionicons name="radio-outline" size={10} color="#66b0ff" />
                      <Text className="text-brand text-[10px] font-bold">
                        {positioning.uniqueBeacons}
                      </Text>
                    </View>
                  )}

                  {/* Expand chevron */}
                  <Ionicons
                    name={infoExpanded ? "chevron-up" : "chevron-down"}
                    size={14}
                    color="#94a3b8"
                  />
                </TouchableOpacity>

                {/* Expanded section */}
                {infoExpanded && (
                  <View className="px-4 pb-3 gap-3 border-t border-white/5 pt-3">
                    {/* Floor & beacons row */}
                    <View className="flex-row gap-3">
                      <View className="flex-1 flex-row items-center gap-2 bg-neutral-900/40 border border-white/5 rounded-xl px-3 py-2">
                        <Ionicons name="layers" size={12} color="#94a3b8" />
                        <Text className="text-neutral-300 text-xs">
                          {activeFloor?.name ?? `Level ${floorLevel}`}
                        </Text>
                      </View>
                      <View className="flex-1 flex-row items-center gap-2 bg-neutral-900/40 border border-white/5 rounded-xl px-3 py-2">
                        <Ionicons name="radio-outline" size={12} color="#94a3b8" />
                        <Text className="text-neutral-300 text-xs">
                          Beacons {positioning.uniqueBeacons}/{beaconTotal}
                        </Text>
                      </View>
                    </View>

                    {/* Retry button — only when no beacons detected */}
                    {positioning.uniqueBeacons === 0 && positioning.active && (
                      <TouchableOpacity
                        className="flex-row items-center justify-center gap-2 bg-amber-500/15 border border-amber-500/30 rounded-xl py-2.5"
                        onPress={() => {
                          positioning.stop();
                          positioning.start();
                        }}
                      >
                        <Ionicons name="refresh" size={14} color="#f59e0b" />
                        <Text className="text-amber-400 text-xs font-semibold">
                          Retry BLE Scan
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* Debug controls — only in debugMode */}
                    {debugMode && (
                      <>
                        {/* Compass / heading calibration readout. To calibrate a
                            building's northOffsetDeg: stand in the corridor facing
                            the +x direction (increasing metres) and set
                            northOffsetDeg = (Compass − 90), normalised to 0-360. */}
                        <View className="gap-1 bg-neutral-900/40 border border-white/5 rounded-xl px-3 py-2">
                          <Text className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider">
                            Heading / Compass
                          </Text>
                          <Text className="text-neutral-300 text-xs">
                            Compass:{" "}
                            {heading.headingDeg == null
                              ? "—"
                              : `${heading.headingDeg.toFixed(0)}°`}
                            {heading.accuracyDeg != null &&
                              `  (±${heading.accuracyDeg.toFixed(0)}°)`}
                          </Text>
                          <Text className="text-neutral-300 text-xs">
                            Map heading:{" "}
                            {headingMapDeg == null
                              ? "—"
                              : `${headingMapDeg.toFixed(0)}°`}
                            {"   "}North offset: {northOffset.toFixed(0)}°
                          </Text>
                          <Text className="text-neutral-500 text-[10px]">
                            Face +x (along corridor) → set offset = Compass − 90
                          </Text>
                        </View>

                        {/* Model selector (GAT configs) */}
                        <View className="gap-2">
                          <Text className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider px-1">
                            Active Variant
                          </Text>
                          <View className="flex-row gap-2">
                            {GAT_VARIANTS.map((v) => {
                              const selected = positioning.variant === v;
                              return (
                                <TouchableOpacity
                                  key={v}
                                  className={`flex-1 items-center justify-center rounded-xl border py-2 ${
                                    selected
                                      ? "bg-brand/20 border-brand/50"
                                      : "bg-transparent border-white/10"
                                  }`}
                                  onPress={() => positioning.setVariant(v)}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      selected ? "text-brand" : "text-neutral-300"
                                    }`}
                                  >
                                    {getGatConfig(v).label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Smoother selector */}
                        <View className="gap-2">
                          <Text className="text-neutral-400 text-[10px] font-bold uppercase tracking-wider px-1">
                            Smoother Mode
                          </Text>
                          <View className="flex-row gap-2">
                            {(["pdr", "kalman", "motion_gated"] as const).map((mode) => {
                              const selected = positioning.postProcessMode === mode;
                              return (
                                <TouchableOpacity
                                  key={mode}
                                  className={`flex-1 items-center justify-center rounded-xl border py-2 ${
                                    selected
                                      ? "bg-brand/20 border-brand/50"
                                      : "bg-transparent border-white/10"
                                  }`}
                                  onPress={() => positioning.setPostProcessMode(mode)}
                                >
                                  <Text
                                    className={`text-xs font-semibold ${
                                      selected ? "text-brand" : "text-neutral-300"
                                    }`}
                                  >
                                    {mode === "motion_gated"
                                      ? "Motion"
                                      : mode === "pdr"
                                        ? "PDR"
                                        : "Kalman"}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>

                        {/* Diagnostics text */}
                        <Text className="text-neutral-400 text-xs px-1">
                          {positioning.error ??
                            (positioning.available ? "ONNX ready" : "Unavailable")}
                        </Text>
                      </>
                    )}
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Live-location share duration picker */}
      <ShareLocationSheet
        visible={shareSheetOpen}
        onClose={() => setShareSheetOpen(false)}
        onPick={(durationMin) => locationShare.start(durationMin)}
      />
    </View>
  );
}

/**
 * Shown when no buildingId is in the URL AND the user isn't physically
 * inside any supported building's zone. Adapts to whether anything is
 * nearby — DRY: same component handles both candidates + nothing-near.
 */
function NavigationEmptyState({ candidates }: { candidates: NearbyBuilding[] }) {
  const router = useRouter();
  const hasCandidates = candidates.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top"]}>
      <ScrollView contentContainerClassName="p-6 gap-6 pb-24">
        <View>
          <Text className="text-3xl font-bold text-white tracking-tight">Navigate</Text>
          <Text className="text-base text-neutral-400 mt-1">
            {hasCandidates
              ? "You're not inside a supported building yet — pick one near you to plan ahead."
              : "Step inside a supported building to start navigating."}
          </Text>
        </View>

        {hasCandidates ? (
          <View className="gap-3">
            <View className="flex-row items-center gap-2">
              <Ionicons name="locate-outline" size={16} color="#00e5ff" />
              <Text className="text-sm font-semibold text-cyan tracking-wide uppercase">
                Buildings near you
              </Text>
            </View>
            {candidates.map((b) => (
              <TouchableOpacity
                key={b.id}
                activeOpacity={0.85}
                onPress={() => router.push(`/navigation?buildingId=${b.id}` as any)}
                className="flex-row items-center gap-3 bg-surface-variant/80 border border-white/10 rounded-2xl p-4"
              >
                <View className="w-10 h-10 rounded-full bg-brand/20 border border-brand/40 items-center justify-center">
                  <Ionicons name="business-outline" size={20} color="#66b0ff" />
                </View>
                <View className="flex-1">
                  <Text className="text-white font-semibold text-base" numberOfLines={1}>
                    {b.name}
                  </Text>
                  <Text className="text-xs text-neutral-400 mt-0.5">
                    {Math.round(b.distanceMeters)} m away
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#64748b" />
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <Card className="items-center py-8">
            <View className="w-20 h-20 rounded-full bg-brand/15 border border-brand/30 items-center justify-center mb-4">
              <Ionicons name="navigate-outline" size={36} color="#66b0ff" />
            </View>
            <CardTitle className="text-center">No supported building near you</CardTitle>
            <CardDescription className="text-center mt-1">
              Browse all buildings on the Home tab, or move closer to one we support.
            </CardDescription>
            <View className="mt-5">
              <Button label="Browse on Home" onPress={() => router.push("/" as any)} />
            </View>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
