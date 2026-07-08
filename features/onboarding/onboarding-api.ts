import { apiClient } from "@/lib/api-client";

export interface OnboardingCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface OnboardingSaveResult {
  success: boolean;
  onboardingComplete: boolean;
  interests: string[];
}

export async function fetchOnboardingCategories(): Promise<OnboardingCategory[]> {
  const { data } = await apiClient.get<OnboardingCategory[]>("/client/user/categories");
  return data;
}

export async function postSaveInterests(
  categoryIds: string[],
  age?: number | null,
  gender?: string | null,
  needsStepFree?: boolean
): Promise<OnboardingSaveResult> {
  const { data } = await apiClient.patch<OnboardingSaveResult>("/client/user/interests", {
    categoryIds,
    age,
    gender,
    needsStepFree,
  });
  return data;
}

export async function postSkipOnboarding(
  age?: number | null,
  gender?: string | null,
  needsStepFree?: boolean
): Promise<OnboardingSaveResult> {
  const { data } = await apiClient.patch<OnboardingSaveResult>("/client/user/skip-onboarding", {
    age,
    gender,
    needsStepFree,
  });
  return data;
}
