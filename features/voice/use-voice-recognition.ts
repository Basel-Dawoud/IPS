import { useState, useEffect, useCallback } from "react";
import { requireNativeModule } from "expo";

// Safely require the native module to prevent startup crashes in unsupported environments like Expo Go.
let ExpoSpeechRecognitionModule: any = null;
try {
  ExpoSpeechRecognitionModule = requireNativeModule("ExpoSpeechRecognition");
} catch (e) {
  console.warn("[Voice] ExpoSpeechRecognition native module not found. Rebuild the app with npx expo run:android.");
}

export function useVoiceRecognition() {
  const isSupported = !!ExpoSpeechRecognitionModule;
  const [isListening, setIsListening] = useState(false);
  const [recognizedText, setRecognizedText] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Set up event listeners safely if supported
  useEffect(() => {
    if (!isSupported || !ExpoSpeechRecognitionModule) return;

    let startSub: any = null;
    let endSub: any = null;
    let errorSub: any = null;
    let resultSub: any = null;

    try {
      startSub = ExpoSpeechRecognitionModule.addListener("start", () => {
        setIsListening(true);
        setError(null);
      });

      endSub = ExpoSpeechRecognitionModule.addListener("end", () => {
        setIsListening(false);
      });

      errorSub = ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
        console.warn("[SpeechRecognition] error:", event.error, event.message);
        setIsListening(false);
        setError(event.message || event.error || "Speech recognition error");
      });

      resultSub = ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
        if (event.results && event.results.length > 0) {
          setRecognizedText(event.results[0]?.transcript || "");
        }
      });
    } catch (err) {
      console.warn("[Voice] Failed to attach speech listeners:", err);
    }

    return () => {
      startSub?.remove();
      endSub?.remove();
      errorSub?.remove();
      resultSub?.remove();
    };
  }, [isSupported]);

  const startListening = useCallback(async (locale: string = "en-US") => {
    if (!isSupported || !ExpoSpeechRecognitionModule) {
      setError("Speech recognition is not supported. Please run npx expo run:android to compile the native module.");
      return;
    }
    setRecognizedText("");
    setError(null);
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError("Microphone and Speech Recognition permissions are required.");
        return;
      }

      ExpoSpeechRecognitionModule.start({
        lang: locale,
        interimResults: true,
      });
    } catch (err: any) {
      console.error("[SpeechRecognition] start failed:", err);
      setError(err?.message || "Failed to start listening");
    }
  }, [isSupported]);

  const stopListening = useCallback(async () => {
    if (!isSupported || !ExpoSpeechRecognitionModule) return;
    try {
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } catch (err: any) {
      console.error("[SpeechRecognition] stop failed:", err);
    }
  }, [isSupported]);

  const cancelListening = useCallback(async () => {
    if (!isSupported || !ExpoSpeechRecognitionModule) return;
    try {
      ExpoSpeechRecognitionModule.abort();
      setIsListening(false);
    } catch (err: any) {
      console.error("[SpeechRecognition] abort failed:", err);
    }
  }, [isSupported]);

  const clearRecognizedText = useCallback(() => {
    setRecognizedText("");
  }, []);

  return {
    isListening,
    recognizedText,
    error,
    startListening,
    stopListening,
    cancelListening,
    clearRecognizedText,
  };
}
