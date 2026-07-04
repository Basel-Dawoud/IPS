import { Intent } from "./chat.types";

export const NAV_KEYWORDS = [
  "go to", "take me to", "navigate to", "guide me to", "directions to", "path to",
  "how to reach", "send me to", "show me the way to", "walk me to", "move to",
  "i want to go", "want to go", "need to go", "get me to", "let's go", "lets go",
  "from", "من", "اذهب", "اخذني", "دلني", "طريق", "وديني", "عايز اروح", "عاوز اروح",
  "هيا بنا", "مشي", "روح", "إلى", "الي", "لـ", "لغرفة", "عايز انزل", "هنروح",
];

export const PRODUCT_KEYWORDS = [
  "buy", "looking for", "where can i find", "i want", "searching", "do you have",
  "need", "want to purchase", "shopping", "get me", "find",
  "اشتري", "ابحث", "اين اجد", "عايز", "عاوز", "فين", "عندكم", "محتاج",
  "جيب", "هاشتري", "عايز انزل اشتري", "دور على", "لو سمحت",
];

export const AGREE_PHRASES = [
  "take me there", "guide me there", "go there", "navigate me there",
  "lets go", "let's go", "yes take me", "yes navigate", "please do", "do it",
  "navigate", "mashi", "tamam",
  "اخذني هناك", "اذهب هناك", "هيا بنا", "تمام", "ماشي", "فضل",
  "يلا بينا", "وديني", "روح بيا", "هنروح", "كمل", "يسطا",
];

export const AGREE_WORDS = ["ok", "okay", "yes", "sure", "go", "نعم", "اوكي"];

export const INFO_KEYWORDS = [
  "what is", "tell me about", "info about", "describe", "where is", "about",
  "information", "ما هو", "اخبرني", "معلومات", "وصف", "اين", "عن", "مكان",
  "ايه", "ايه هو", "فين مكان", "عايز اعرف", "اقولي",
];

export const GREETINGS_EN = ["hi", "hello", "hey", "good morning", "good evening", "how are you"];
export const GREETINGS_AR = ["مرحبا", "السلام عليكم", "هاي", "أهلا", "اهلا", "صباح الخير", "مساء الخير", "هلا"];

export const REJECT_KEYWORDS = ["no", "لا", "لأ", "مش دلوقتي", "not now"];

export const THANKS_KEYWORDS = ["thanks", "thank you", "شكرا", "شكرًا", "مرسي", "تسلم", "جزاك الله خيرا"];

export const RECOMMEND_KEYWORDS = [
  "recommend", "suggest", "what should i visit", "where to go", "where should i go",
  "anything nice", "what is good here", "show me popular",
  "ارشدني", "اقتراح", "رشحلي", "أرشحلي", "أماكن حلوة", "اروح فين", "أروح فين",
  "ايه احسن مكان", "مقترحات"
];

export function detectLanguage(text: string): "en" | "ar" {
  if (!text) return "en";
  // Arabic Unicode block regex
  const arabicRegex = /[\u0600-\u06FF]/;
  return arabicRegex.test(text) ? "ar" : "en";
}

export function detectIntent(text: string): Intent {
  const low = (text || "").toLowerCase().trim();

  // 1. Rejection
  if (REJECT_KEYWORDS.some((w) => low.includes(w))) {
    return "reject";
  }

  // 2. Agreement
  const words = low.split(/\s+/);
  if (
    AGREE_PHRASES.some((phrase) => low.includes(phrase)) ||
    AGREE_WORDS.some((word) => words.includes(word))
  ) {
    return "agree";
  }

  // 3. Navigation
  if (NAV_KEYWORDS.some((w) => low.includes(w))) {
    return "navigate";
  }

  // 4. Recommendation
  if (RECOMMEND_KEYWORDS.some((w) => low.includes(w))) {
    return "recommend";
  }

  // 5. Product Info
  if (PRODUCT_KEYWORDS.some((w) => low.includes(w))) {
    return "product";
  }

  // 6. General Info Request
  if (INFO_KEYWORDS.some((w) => low.includes(w))) {
    return "info";
  }

  // 7. Greetings
  if (
    GREETINGS_EN.some((w) => low.includes(w)) ||
    GREETINGS_AR.some((w) => low.includes(w))
  ) {
    return "greet";
  }

  // 8. Thanks
  if (THANKS_KEYWORDS.some((w) => low.includes(w))) {
    return "thanks";
  }

  return "unknown";
}
