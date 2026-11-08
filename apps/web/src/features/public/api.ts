// Public (no-login) endpoints + the customer's conversation session kept in localStorage.
import { api } from "@/lib/api";
import type {
  BuyerAccount,
  CheckoutSession,
  ConversationMessagesResponse,
  Offer,
  PayResponse,
  StartConversationRequest,
  StartConversationResponse,
} from "@/lib/types";

export const SESSION_KEY = "assistant.session";
/** Fired on `window` when this tab saves or clears the session (the `storage` event only fires in other tabs). */
export const SESSION_EVENT = "assistant.session";

export interface StoredSession {
  conversation_id: string;
  access_token: string;
  consent_voice?: boolean;
  channel?: "text" | "voice";
}

export function loadSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as StoredSession | null;
    return s?.conversation_id && s.access_token ? s : null;
  } catch {
    return null;
  }
}
export function saveSession(s: StoredSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  window.dispatchEvent(new Event(SESSION_EVENT));
}
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EVENT));
}
/** `useSyncExternalStore` pair: does this browser hold a conversation session? */
export function subscribeSession(cb: () => void) {
  window.addEventListener(SESSION_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SESSION_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
export const hasSession = () => loadSession() !== null;

const opts = { noAuthRedirect: true } as const;
const tok = (s: StoredSession) => ({ ...opts, headers: { "X-Conversation-Token": s.access_token } });

export const publicApi = {
  offers: () => api.get<Offer[]>("/public/offers", opts),
  offer: (slug: string) => api.get<Offer>(`/public/offers/${encodeURIComponent(slug)}`, opts),
  start: (body: StartConversationRequest) => api.post<StartConversationResponse>("/public/conversations", body, opts),
  conversation: (s: StoredSession) => api.get<ConversationMessagesResponse>(`/public/conversations/${s.conversation_id}`, tok(s)),
  account: (s: StoredSession) => api.get<BuyerAccount>(`/public/conversations/${s.conversation_id}/account`, tok(s)),
  send: (s: StoredSession, content: string) =>
    api.post<ConversationMessagesResponse>(`/public/conversations/${s.conversation_id}/messages`, { content }, tok(s)),
  enroll: (s: StoredSession, product_id: string) =>
    api.post<{ checkout_session_id: string }>(`/public/conversations/${s.conversation_id}/enroll`, { product_id }, tok(s)),
  checkout: (id: string) => api.get<CheckoutSession>(`/public/checkout/${encodeURIComponent(id)}`, opts),
  pay: (id: string, payment_method: string, idempotencyKey: string) =>
    api.post<PayResponse>(`/public/checkout/${encodeURIComponent(id)}/pay`, { payment_method }, {
      ...opts,
      headers: { "Idempotency-Key": idempotencyKey },
    }),
  feedback: (s: StoredSession, rating: number, comment: string) =>
    api.post<{ ok: boolean }>("/public/feedback", { conversation_id: s.conversation_id, rating, comment }, tok(s)),
};

/** Reuse the stored conversation, or open a quiet text one, then enroll. Returns the checkout session id. */
export async function enrollInProduct(productId: string, retried = false): Promise<string> {
  let s = retried ? null : loadSession();
  if (!s) {
    const r = await publicApi.start({ consent_voice: false, channel: "text" });
    s = { conversation_id: r.conversation_id, access_token: r.access_token, consent_voice: false, channel: "text" };
    saveSession(s);
  }
  try {
    return (await publicApi.enroll(s, productId)).checkout_session_id;
  } catch (e) {
    // Stale session (e.g. after a demo reset): start fresh once.
    if (retried || (e as { status?: number }).status !== 404) throw e;
    clearSession();
    return enrollInProduct(productId, true);
  }
}
