import React, { useState, useEffect } from "react";
import {
  Modal,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { apiClient } from "@/lib/api-client";

interface PoiReviewModalProps {
  visible: boolean;
  poiId: string;
  poiName: string;
  onClose: () => void;
}

export function PoiReviewModal({ visible, poiId, poiName, onClose }: PoiReviewModalProps) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset states on POI change
  useEffect(() => {
    setRating(5);
    setComment("");
    setError(null);
  }, [poiId]);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.post(`/client/recommendations/${poiId}/reviews`, {
        rating,
        comment: comment.trim() || null,
      });
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      console.error("[PoiReviewModal] Failed submitting review:", err);
      setError(
        err?.response?.data?.error ?? "Failed to submit review. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className="w-full bg-surface-variant/90 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
            {/* Header */}
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-bold text-white tracking-tight">
                Rate Store
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text className="text-sm font-semibold text-slate-300 mb-4">
              What do you think of {poiName}?
            </Text>

            {error && (
              <View className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4 flex-row items-center gap-2">
                <Ionicons name="alert-circle-outline" size={16} color="#ef4444" />
                <Text className="text-red-400 text-xs font-semibold flex-1">
                  {error}
                </Text>
              </View>
            )}

            {/* Stars Row */}
            <View className="flex-row justify-center gap-3 mb-6">
              {[1, 2, 3, 4, 5].map((star) => (
                <TouchableOpacity
                  key={star}
                  onPress={() => setRating(star)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={star <= rating ? "star" : "star-outline"}
                    size={36}
                    color={star <= rating ? "#ffd700" : "#64748b"}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional Comment Input */}
            <View className="gap-2 mb-6">
              <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Review Comment (Optional)
              </Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Share your experience at this store..."
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={4}
                className="w-full bg-surface/50 border border-white/5 rounded-2xl p-4 text-white text-sm"
                style={{ height: 100, textAlignVertical: "top" }}
              />
            </View>

            {/* Actions */}
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-3.5 border border-white/10 rounded-xl items-center"
              >
                <Text className="text-slate-300 font-semibold text-sm">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3.5 bg-brand rounded-xl items-center justify-center shadow-lg"
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text className="text-white font-bold text-sm">Submit Review</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
