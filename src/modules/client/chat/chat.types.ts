export interface ChatReply {
  reply: string;
  lang: "en" | "ar";
  action?: {
    type: "navigate" | "suggest";
    poiId: string;
    floorLevel: number;
  };
  /** True when a pending suggest-offer was declined/consumed — the app should
   *  clear its stored lastSuggestedPoiId. */
  clearPending?: boolean;
}

export type Intent =
  | "navigate"
  | "product"
  | "info"
  | "agree"
  | "greet"
  | "reject"
  | "thanks"
  | "recommend"
  | "unknown";
