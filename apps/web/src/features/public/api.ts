// Public (no-login) endpoints + the customer's conversation session kept in localStorage.
import { api, ApiError } from "@/lib/api";
import type {
  BuyerDashboard,
  BuyerFlags,
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
  // Buyer account (cookie auth). 401 is handled by the caller, never by a redirect to the console login.
  flags: () => api.get<BuyerFlags>("/me/flags", opts),
  account: () => api.get<BuyerDashboard>("/me/account", opts),
  linkConversation: (s: StoredSession) =>
    api.post<{ ok: boolean }>("/me/link-conversation", { conversation_id: s.conversation_id, access_token: s.access_token }, opts),
  feedback: (s: StoredSession, rating: number, comment: string) =>
    api.post<{ ok: boolean }>("/public/feedback", { conversation_id: s.conversation_id, rating, comment }, tok(s)),
};

// ---------- buyer account gate ----------

const PENDING_ENROLL = "enroll.pending"; // sessionStorage: {product_id, at} to resume right after sign-in
const PENDING_TTL_MS = 15 * 60_000; // an abandoned gate must not enroll the buyer in something later

export const buyerSignInUrl = (next: string) => `/login?as=buyer&next=${encodeURIComponent(next)}`;

/**
 * Guests cannot enroll (401 BUYER_ACCOUNT_REQUIRED): remember the intent, send them to the buyer sign-in, and come
 * back here. Returns true when it took over (the caller should stop: the page is leaving). Staff-only accounts get a
 * 403 with the same code, which is a plain error for the caller to show.
 */
export function gateToBuyerSignIn(e: unknown, productId?: string): boolean {
  if (!(e instanceof ApiError) || e.code !== "BUYER_ACCOUNT_REQUIRED" || e.status !== 401 || typeof window === "undefined") return false;
  if (productId) sessionStorage.setItem(PENDING_ENROLL, JSON.stringify({ product_id: productId, at: Date.now() }));
  const { pathname, search } = window.location;
  // Outside React (shared helper): a full navigation is fine, the login page is a different layout anyway.
  window.location.assign(buyerSignInUrl(pathname + search));
  return true;
}

/**
 * Right after a buyer signed in or up: attach the guest conversation (if any) to the account, then finish the enroll
 * that was interrupted by the gate. Returns where to go next, or null when there was nothing pending.
 */
export async function resumeBuyerIntent(fromGate: boolean): Promise<string | null> {
  const s = loadSession();
  if (s) await publicApi.linkConversation(s).catch(() => {}); // stale token: nothing to attach
  let pending: { product_id?: string; at?: number } | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_ENROLL) ?? "null");
  } catch {
    pending = null;
  }
  sessionStorage.removeItem(PENDING_ENROLL);
  // Only the sign-in the gate itself opened (?as=buyer) may finish the enroll, and only while the intent is fresh.
  if (!fromGate || !pending?.product_id || !pending.at || Date.now() - pending.at > PENDING_TTL_MS) return null;
  try {
    return `/checkout/${await enrollInProduct(pending.product_id)}`;
  } catch (e) {
    return e instanceof ApiError && e.code === "ALREADY_ENROLLED" ? "/account" : null;
  }
}

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
    if (gateToBuyerSignIn(e, productId)) return new Promise(() => {}); // page is leaving: never resolve
    // Stale session (e.g. after a demo reset): start fresh once.
    if (retried || (e as { status?: number }).status !== 404) throw e;
    clearSession();
    return enrollInProduct(productId, true);
  }
}
