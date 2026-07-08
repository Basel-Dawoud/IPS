export function getGreeting(lang: "en" | "ar"): string {
  if (lang === "ar") {
    return "أهلاً بك 👋 أنا مساعد Navimind الذكي. أخبرني باسم المتجر أو رقم الغرفة، أو إلى أين تريد الذهاب.";
  }
  return "Hello 👋 Welcome to Navimind Assistant! Tell me a store name, a room number, or where you want to go.";
}

export function getRejectionResponse(lang: "en" | "ar"): string {
  if (lang === "ar") {
    return "تمام، قولي لو محتاج أي حاجة تانية.";
  }
  return "Okay, let me know if you need anything else.";
}

export function getThanksResponse(lang: "en" | "ar"): string {
  if (lang === "ar") {
    return "العفو! أنا هنا لمساعدتك دائماً. 😊";
  }
  return "You are very welcome! Let me know if you need anything else. 😊";
}

export function getStoreInfoResponse(description: string, storeName: string, roomCode: string, lang: "en" | "ar"): string {
  const room = roomCode ? (lang === "ar" ? ` (غرفة ${roomCode})` : ` (room ${roomCode})`) : "";
  const header = `🏪 ${storeName}${room}`;
  const descText = description ? `\n📝 ${description}` : "";
  
  if (lang === "ar") {
    return `${header}${descText}\n\nتحب أوصّلك هناك؟`;
  }
  return `${header}${descText}\n\nWant me to guide you there?`;
}

export function getProductLocationResponse(storeName: string, roomCode: string, lang: "en" | "ar"): string {
  const room = roomCode ? (lang === "ar" ? ` (غرفة ${roomCode})` : ` (room ${roomCode})`) : "";
  if (lang === "ar") {
    return `ده موجود في ${storeName}${room} 👍 تحب أوصّلك هناك؟`;
  }
  return `You'll find that at ${storeName}${room}. 👍 Want me to guide you there?`;
}

export function getNavigationResponse(storeName: string, roomCode: string, lang: "en" | "ar"): string {
  const room = roomCode ? (lang === "ar" ? ` (غرفة ${roomCode})` : ` (room ${roomCode})`) : "";
  if (lang === "ar") {
    return `🗺️ تمام! بوصّلك لـ ${storeName}${room} دلوقتي. اتبع الطريق على الخريطة.`;
  }
  return `🗺️ On it! Guiding you to ${storeName}${room} now — just follow the route on the map.`;
}

export function getFallbackResponse(lang: "en" | "ar"): string {
  if (lang === "ar") {
    return "معلش مش فاهم قصدك بالظبط. جرب تقولي اسم المتجر، المنتج، أو رقم الغرفة (مثلاً: 351).";
  }
  return "I'm not sure what you mean. Try mentioning a store name, product, or room number like 351.";
}
