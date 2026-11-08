"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Clock, Info, Loader2, Mic, MicOff, RotateCcw, SendHorizontal, ShieldAlert, ShieldCheck, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/format";
import type { Journey, OfferCard, PublicMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrowserSpeechAdapter, type ListenState } from "@/features/voice/adapter";
import { clearSession, loadSession, publicApi, saveSession, type StoredSession } from "@/features/public/api";
import "@/features/public/public.css";

/** Follow-up suggestions that fit the conversation so far; never repeats what the customer already asked. */
function suggestions(messages: PublicMessage[]): string[] {
  const asked = new Set(messages.filter((m) => m.role === "customer").map((m) => m.content.trim().toLowerCase()));
  const lastAgent = [...messages].reverse().find((m) => m.role === "agent");
  const focus = lastAgent?.meta?.cta ? lastAgent.meta.products?.[0] ?? null : lastAgent?.meta?.products?.length === 1 ? lastAgent.meta.products[0] : null;
  const pending = messages.some((m) => m.id.startsWith("pending-"));
  const base = !asked.size
    ? DEFAULT_CHIPS
    : focus
      ? [`What will I learn in ${focus.name}?`, "Can I pay in instalments?", "What is the weekly schedule?", "I want to enroll"]
      : ["Which course fits a career switch?", "Show me all programs", "Is it too hard for a beginner?"];
  return pending ? [] : base.filter((c) => !asked.has(c.toLowerCase()));
}

export const DEFAULT_CHIPS = [
  "Which course fits a career switch?",
  "How much is Generative AI?",
  "Is it too hard for a beginner?",
  "I want to enroll",
];

const VOICE_OUT_KEY = "assistant.voiceOut";

/** What the page-level aside ("Behind this reply", "Your journey") needs to know. */
export interface AssistantActivity {
  busy: boolean;
  asked: boolean;
  recommended: boolean;
  journey: Journey | null;
}

export interface AssistantChatProps {
  /** Extra quick chips appended after the defaults (e.g. the studio's attack demo). */
  extraChips?: { label: string; text: string; tone?: "danger" }[];
  /** Called whenever the active session changes (null = none). */
  onSession?: (s: StoredSession | null) => void;
  /** Called after an agent reply arrives. */
  onReply?: () => void;
  /** Where checkout goes. Default: same-tab navigation. */
  onCheckout?: (checkoutSessionId: string) => void;
  /** Prefill the composer once a session exists (e.g. ?q= from an offer page). */
  initialQuestion?: string;
  /** Reply in flight / journey progress, for a side panel. */
  onActivity?: (a: AssistantActivity) => void;
  className?: string;
}

type Phase = { kind: "loading" } | { kind: "start" } | { kind: "chat"; session: StoredSession };

const SALES_TILE = "grid shrink-0 place-items-center rounded-xl bg-c-sales-bg text-c-sales";

export function AssistantChat({ extraChips, onSession, onReply, onCheckout, initialQuestion, onActivity, className }: AssistantChatProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [journey, setJourney] = useState<Journey | null>(null);
  const speech = useMemo(() => new BrowserSpeechAdapter(), []);
  const [voiceOut, setVoiceOut] = useState(false);
  const [canSpeak, setCanSpeak] = useState(false);
  const voiceOutRef = useRef(false);
  const onSessionRef = useRef(onSession);
  useEffect(() => {
    onSessionRef.current = onSession;
  });

  // Browser capability + saved preference are client-only; read once after mount.
  useEffect(() => {
    queueMicrotask(() => {
      setCanSpeak(speech.canSpeak);
      const v = speech.canSpeak && localStorage.getItem(VOICE_OUT_KEY) === "1";
      voiceOutRef.current = v;
      setVoiceOut(v);
    });
    return () => speech.cancelSpeech();
  }, [speech]);

  // Resume a stored session; a 404 means the token is stale (demo reset), so start over.
  useEffect(() => {
    let alive = true;
    const s = loadSession();
    (async () => {
      if (!s) {
        if (alive) setPhase({ kind: "start" });
        return;
      }
      try {
        const r = await publicApi.conversation(s);
        if (!alive) return;
        setMessages(r.messages);
        setJourney(r.journey ?? null);
        setPhase({ kind: "chat", session: s });
        onSessionRef.current?.(s);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && (e.status === 404 || e.status === 401 || e.status === 403)) clearSession();
        else toast.error("Could not restore your conversation. Starting a new one.");
        setPhase({ kind: "start" });
        onSessionRef.current?.(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const started = (s: StoredSession, first: PublicMessage[]) => {
    saveSession(s);
    setMessages(first);
    setPhase({ kind: "chat", session: s });
    onSession?.(s);
  };

  const reset = () => {
    clearSession();
    speech.cancelSpeech();
    setMessages([]);
    setJourney(null);
    setPhase({ kind: "start" });
    onSession?.(null);
  };

  const toggleVoiceOut = (on: boolean) => {
    voiceOutRef.current = on;
    setVoiceOut(on);
    localStorage.setItem(VOICE_OUT_KEY, on ? "1" : "0");
    if (!on) speech.cancelSpeech();
  };

  return (
    <section
      aria-label="Sales assistant"
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-hair bg-panel shadow-card", className)}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-hair px-5 py-4">
        <span className={cn(SALES_TILE, "size-[38px]")} aria-hidden>
          <Mic className="size-[17px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1 basis-40 leading-[1.2]">
          <p className="text-[15px] font-extrabold">Sales assistant</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-t3">
            <ShieldCheck aria-hidden className="size-3 shrink-0 text-success" strokeWidth={2.4} />
            Screened by the security agent before every reply
          </p>
        </div>
        {canSpeak && phase.kind === "chat" && (
          <Label htmlFor="voice-out" className="flex h-[34px] items-center gap-2 rounded-[10px] border border-hair bg-panel2 px-3 text-[12.5px] font-bold text-t2">
            <Volume2 aria-hidden className="size-3.5" />
            <span>Read aloud</span>
            <Switch id="voice-out" size="sm" checked={voiceOut} onCheckedChange={toggleVoiceOut} />
          </Label>
        )}
        {phase.kind === "chat" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[10px] border border-hair bg-panel2 px-3 text-[12.5px] font-bold text-t2 hover:bg-panel3"
          >
            <RotateCcw aria-hidden className="size-[13px]" /> New conversation
          </button>
        )}
      </div>
      {phase.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center gap-2 p-10 text-t3" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Restoring your conversation
        </div>
      )}
      {phase.kind === "start" && <StartForm onStarted={started} />}
      {phase.kind === "chat" && (
        <ChatPane
          key={phase.session.conversation_id}
          session={phase.session}
          speech={speech}
          voiceOutRef={voiceOutRef}
          messages={messages}
          setMessages={setMessages}
          journey={journey}
          setJourney={setJourney}
          extraChips={extraChips}
          onReset={reset}
          onReply={onReply}
          onCheckout={onCheckout}
          onActivity={onActivity}
          initialQuestion={initialQuestion}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- voice orb

/** 132px amber orb (prototype). `listening` shows the two rings + 7 bars; otherwise the mic. */
function Orb({
  listening,
  onClick,
  label,
  size = 132,
  disabled,
}: {
  listening: boolean;
  onClick?: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  const bars = [14, 22, 30, 38, 30, 22, 14];
  const cls = cn(
    "relative grid place-items-center rounded-full border-0 transition-transform duration-[400ms] [transition-timing-function:cubic-bezier(.34,1.45,.64,1)]",
    !listening && "orb-idle",
    onClick && "focus-visible:outline-2 focus-visible:outline-offset-4",
  );
  const style = {
    width: size,
    height: size,
    background: "radial-gradient(circle at 35% 30%,#FFD98A,#F5A623 45%,#C9700A 100%)",
    boxShadow: `0 ${size / 6.6}px ${size / 2.2}px rgba(245,166,35,.35), inset 0 -10px 30px rgba(0,0,0,.2)`,
  };
  const inner = listening ? (
    <>
      <span aria-hidden className="orb-ring absolute -inset-3.5 rounded-full border-2 border-[rgba(245,166,35,.6)]" />
      <span aria-hidden className="orb-ring absolute -inset-3.5 rounded-full border-2 border-[rgba(245,166,35,.4)] [animation-delay:.5s]" />
      <span className="flex h-10 items-center gap-1">
        {bars.map((h, i) => (
          <span key={i} aria-hidden className="orb-bar w-[5px] rounded-[3px] bg-[#0B1730]" style={{ height: h, animationDelay: `${i * 0.12}s` }} />
        ))}
      </span>
    </>
  ) : (
    <Mic aria-hidden className="text-[#0B1730]" style={{ width: size * 0.3, height: size * 0.3 }} strokeWidth={2} />
  );
  if (!onClick)
    return (
      <span aria-hidden className={cls} style={style}>
        {inner}
      </span>
    );
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={listening} className={cls} style={style}>
      {inner}
    </button>
  );
}

// ---------------------------------------------------------------- start form

const FIELD = "h-12 rounded-[14px]";

function StartForm({ onStarted }: { onStarted: (s: StoredSession, first: PublicMessage[]) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"text" | "voice">("text");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = channel === "voice";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (voice && !consent) {
      setError("Tick the consent box to use voice, or switch to text.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await publicApi.start({
        full_name: name.trim() || undefined,
        email: email.trim() || undefined,
        channel,
        consent_voice: voice && consent,
      });
      onStarted(
        { conversation_id: r.conversation_id, access_token: r.access_token, consent_voice: voice && consent, channel },
        r.messages,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the conversation. Try again.");
      setPending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-col items-center px-5 pt-7 pb-2.5">
        <Orb listening={false} onClick={() => setChannel("voice")} label="Talk: start a voice conversation" />
        <p className="mt-4 text-sm font-bold text-t2">{voice ? "Voice and text" : "Tap the orb to talk, or type"}</p>
        <p className="mt-0.5 text-center text-xs text-t4">Speech is transcribed by your browser; no audio leaves your device.</p>
      </div>
      <form onSubmit={submit} className="mx-auto flex w-full max-w-[520px] flex-col gap-3.5 px-5 pt-3 pb-6" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="chat-name" className="text-[13px] font-bold text-t2">
              Name (optional)
            </Label>
            <Input id="chat-name" className={FIELD} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="chat-email" className="text-[13px] font-bold text-t2">
              Email (optional)
            </Label>
            <Input id="chat-email" className={FIELD} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
          </div>
        </div>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1.5 text-[13px] font-bold text-t2">How do you want to talk?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["text", "voice"] as const).map((c) => (
              <label
                key={c}
                className={cn(
                  "flex h-12 cursor-pointer items-center justify-center gap-2 rounded-[14px] border text-sm font-bold transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/35",
                  channel === c ? "border-brand bg-brand-bg text-text" : "border-hair bg-input text-t2 hover:bg-panel2",
                )}
              >
                <input type="radio" name="channel" value={c} checked={channel === c} onChange={() => setChannel(c)} className="sr-only" />
                {c === "text" ? <SendHorizontal aria-hidden className="size-4" /> : <Mic aria-hidden className="size-4" />}
                {c === "text" ? "Text" : "Voice and text"}
              </label>
            ))}
          </div>
        </fieldset>
        {voice && (
          <label className="flex items-start gap-3 rounded-[14px] border border-hair bg-panel2 p-3 text-[13px] leading-[1.45] text-t2">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--brand)]" required />
            <span>
              I agree to voice mode. Speech is turned into text by my browser; no audio is sent to Trackify. The resulting transcript is stored with this
              conversation like any typed message.
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="anim-row-in flex items-center gap-2 rounded-xl border border-danger bg-danger-bg px-3 py-2.5 text-[13px] font-semibold text-danger">
            <Info aria-hidden className="size-4 shrink-0" /> {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending || (voice && !consent)}
          className="inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-brand text-[15px] font-extrabold text-on-brand shadow-[0_10px_28px_rgba(245,166,35,.3)] transition-transform duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
        >
          {pending ? <Loader2 aria-hidden className="size-4 animate-spin" /> : <ArrowRight aria-hidden className="size-4" strokeWidth={2.4} />}
          Start conversation
        </button>
        <p className="text-center text-xs leading-[1.5] text-t4">Name and email are optional. Voice mode asks for consent first and can be switched off at any time.</p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- chat pane

function ChatPane({
  session,
  speech,
  voiceOutRef,
  messages,
  setMessages,
  journey,
  setJourney,
  extraChips,
  onReset,
  onReply,
  onCheckout,
  onActivity,
  initialQuestion,
}: {
  session: StoredSession;
  speech: BrowserSpeechAdapter;
  voiceOutRef: RefObject<boolean>;
  messages: PublicMessage[];
  setMessages: (fn: (m: PublicMessage[]) => PublicMessage[]) => void;
  journey: Journey | null;
  setJourney: (j: Journey | null) => void;
  extraChips?: AssistantChatProps["extraChips"];
  onReset: () => void;
  onReply?: () => void;
  onCheckout?: (id: string) => void;
  onActivity?: AssistantChatProps["onActivity"];
  initialQuestion?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialQuestion ?? "");
  const [sending, setSending] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [listen, setListen] = useState<ListenState>("idle");
  const [canListen, setCanListen] = useState(true);
  const stopRef = useRef<() => void>(() => {});
  const endRef = useRef<HTMLLIElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activityRef = useRef(onActivity);
  useEffect(() => {
    activityRef.current = onActivity;
  });

  useEffect(() => {
    queueMicrotask(() => setCanListen(speech.canListen));
    return () => stopRef.current();
  }, [speech]);

  const asked = messages.some((m) => m.role === "customer");
  const recommended = messages.some((m) => m.role === "agent" && (m.meta?.products?.length || m.meta?.cta));
  useEffect(() => {
    activityRef.current?.({ busy: sending, asked, recommended, journey });
  }, [sending, asked, recommended, journey]);

  useEffect(() => {
    if (asked) endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, sending, asked]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setSending(true);
      setDraft("");
      // Show the customer's message immediately; swap it for the server copy when the reply lands.
      const tempId = `pending-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: tempId, role: "customer", content, created_at: new Date().toISOString(), meta: {} } as PublicMessage,
      ]);
      try {
        const r = await publicApi.send(session, content);
        setMessages((m) => [
          ...m.filter((x) => x.id !== tempId),
          ...r.messages.filter((x) => !m.some((y) => y.id === x.id)),
        ]);
        if (r.journey) setJourney(r.journey);
        const reply = [...r.messages].reverse().find((m) => m.role === "agent");
        if (reply && voiceOutRef.current) speech.speak(reply.content);
        onReply?.();
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== tempId));
        setDraft(content); // keep what the user typed
        if (e instanceof ApiError && e.status === 404) {
          toast.error("This conversation expired. Start a new one.");
          onReset();
        } else toast.error(e instanceof ApiError ? e.message : "Message not sent. Try again.");
      } finally {
        setSending(false);
        inputRef.current?.focus();
      }
    },
    [sending, session, setMessages, setJourney, speech, voiceOutRef, onReply, onReset],
  );

  const enroll = async (productId: string) => {
    setEnrolling(productId);
    try {
      const { checkout_session_id } = await publicApi.enroll(session, productId);
      if (onCheckout) onCheckout(checkout_session_id);
      else router.push(`/checkout/${checkout_session_id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "ALREADY_ENROLLED") {
        toast.success(e.message);
        publicApi.conversation(session).then((r) => r.journey && setJourney(r.journey), () => {});
      } else toast.error(e instanceof ApiError ? e.message : "Could not start enrollment. Try again.");
    } finally {
      setEnrolling(null);
    }
  };

  const listening = listen === "listening";
  const toggleMic = () => {
    if (listening) {
      stopRef.current();
      return;
    }
    speech.cancelSpeech();
    stopRef.current = speech.listen({
      onInterim: (t) => setDraft(t),
      onFinal: (t) => void send(t),
      onState: (s) => setListen(s),
    });
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const chips = [...suggestions(messages).map((c) => ({ label: c, text: c, tone: undefined })), ...(extraChips ?? [])];
  const voiceAllowed = !!session.consent_voice;
  const micOn = voiceAllowed && canListen;
  const resume = (id: string) => (onCheckout ? onCheckout(id) : router.push(`/checkout/${id}`));

  return (
    <>
      {!asked && (
        <div className="flex flex-col items-center px-5 pt-7 pb-2.5">
          {micOn ? (
            <>
              <Orb listening={listening} onClick={toggleMic} label={listening ? "Stop listening" : "Talk"} disabled={sending} />
              <p className="mt-4 text-sm font-bold text-t2" role="status">
                {listening ? "Listening, speak now" : listen === "denied" ? "Microphone blocked in your browser" : "Tap to talk, or type below"}
              </p>
            </>
          ) : (
            <>
              <Orb listening={false} label="" size={72} />
              <p className="mt-4 text-sm font-bold text-t2">Ask about a program, price or schedule</p>
            </>
          )}
          <p className="mt-0.5 text-center text-xs text-t4">
            {micOn ? "Speech is transcribed by your browser; no audio leaves your device." : "Voice is available when you start a new conversation with voice."}
          </p>
        </div>
      )}

      <ol
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 pt-3 pb-[18px]"
      >
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} onEnroll={enroll} enrolling={enrolling} journey={journey} />
        ))}
        {sending && (
          <li className="flex items-end gap-2.5" role="status" aria-label="The assistant is typing">
            <span className={cn(SALES_TILE, "size-[30px] rounded-[10px]")} aria-hidden>
              <Mic className="size-3.5" strokeWidth={2.2} />
            </span>
            <span className="inline-flex items-center gap-[5px] rounded-[18px] rounded-bl-[6px] bg-bubble px-4 py-3.5">
              {[0, 1, 2].map((i) => (
                <span key={i} aria-hidden className="typing-dot size-[7px] rounded-full bg-t3" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </span>
          </li>
        )}
        <li aria-hidden ref={endRef} className="h-px" />
      </ol>

      <div className="border-t border-hair px-5 pt-3 pb-[18px]">
        <JourneyBanner journey={journey} onResume={resume} />
        {chips.length > 0 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label="Suggested questions">
            {chips.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={sending}
                onClick={() => void send(c.text)}
                className={cn(
                  "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border bg-panel2 px-[13px] text-[13px] font-semibold whitespace-nowrap transition-transform duration-200 hover:-translate-y-px disabled:opacity-50",
                  c.tone === "danger" ? "border-danger/50 text-danger" : "border-hair text-t2 hover:text-text",
                )}
              >
                {c.tone === "danger" && <ShieldAlert aria-hidden className="size-[13px]" strokeWidth={2.4} />}
                {c.label}
              </button>
            ))}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <Label htmlFor="chat-input" className="sr-only">
            Your message
          </Label>
          <textarea
            id="chat-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            placeholder={listening ? "Listening" : "Ask about a program, price or schedule"}
            className="field-sizing-content max-h-40 min-h-12 flex-1 resize-none rounded-[15px] border border-hair2 bg-input px-4 py-[13px] text-[14.5px] leading-[1.4] text-text outline-none placeholder:text-t4 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/35"
          />
          {micOn && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? "Stop recording" : "Speak your message"}
              disabled={sending}
              className={cn(
                "relative grid size-12 shrink-0 place-items-center rounded-[15px] border transition-colors disabled:opacity-50 [&_svg]:size-[18px]",
                listening ? "border-brand bg-brand text-on-brand" : "border-hair2 bg-input text-t2 hover:bg-panel2",
              )}
            >
              {listening && <span aria-hidden className="orb-ring absolute -inset-1.5 rounded-[19px] border-2 border-brand" />}
              {listening ? <MicOff aria-hidden strokeWidth={2.2} /> : <Mic aria-hidden strokeWidth={2.2} />}
            </button>
          )}
          <button
            type="submit"
            aria-label="Send message"
            disabled={sending || !draft.trim()}
            className="grid size-12 shrink-0 place-items-center rounded-[15px] bg-brand text-on-brand shadow-[0_8px_20px_rgba(245,166,35,.3)] disabled:opacity-50 [&_svg]:size-[18px]"
          >
            {sending ? <Loader2 aria-hidden className="animate-spin" /> : <SendHorizontal aria-hidden strokeWidth={2.2} />}
          </button>
        </form>
        <VoiceStatus allowed={voiceAllowed} supported={canListen} state={listen} />
      </div>
    </>
  );
}

function VoiceStatus({ allowed, supported, state }: { allowed: boolean; supported: boolean; state: ListenState }) {
  if (!allowed) return null;
  const msg = !supported
    ? "Voice input is not supported in this browser. Typing works everywhere."
    : state === "listening"
      ? "Recording. Speak now; your message sends when you pause."
      : state === "denied"
        ? "Microphone access was blocked. Allow it in your browser settings, or keep typing."
        : state === "error"
          ? "Voice input stopped unexpectedly. Try again or type your message."
          : null;
  if (!msg) return null;
  return (
    <p role="status" className={cn("mt-2 flex items-center gap-1.5 text-[12.5px]", state === "listening" ? "text-brand-text" : "text-t3")}>
      {state === "listening" ? <span aria-hidden className="anim-live-pip size-2 rounded-full bg-brand" /> : <Info aria-hidden className="size-3.5" />}
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------- messages

function MessageRow({
  m,
  onEnroll,
  enrolling,
  journey,
}: {
  m: PublicMessage;
  onEnroll: (productId: string) => void;
  enrolling: string | null;
  journey: Journey | null;
}) {
  if (m.role === "system") {
    return (
      <li className="mx-auto flex max-w-md items-start gap-2 rounded-xl border border-hair bg-panel2 px-3 py-2 text-[13px] text-t3">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>{m.content}</p>
      </li>
    );
  }
  const mine = m.role === "customer";
  const { products, cta, notice } = m.meta ?? {};
  const ctaIn = products?.some((p) => p.id === cta?.product_id);
  const enrollBtn = (p: Pick<OfferCard, "id">, label: string, compact: boolean) =>
    journey?.enrolled_product_ids.includes(p.id) ? (
      <span className={cn("inline-flex items-center gap-1.5 rounded-[11px] bg-success-bg px-3 text-[13px] font-extrabold text-success", compact ? "h-9" : "h-10")}>
        <Check aria-hidden className="size-[13px]" strokeWidth={2.6} /> Enrolled
      </span>
    ) : (
      <button
        type="button"
        onClick={() => onEnroll(p.id)}
        disabled={enrolling !== null}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-[11px] bg-brand px-3 text-[13px] font-extrabold text-on-brand shadow-[0_6px_18px_rgba(245,166,35,.3)] disabled:opacity-60",
          compact ? "h-9" : "h-10",
        )}
      >
        {journey?.open_checkouts.some((c) => c.product_id === p.id) ? "Resume checkout" : label}
        {enrolling === p.id ? <Loader2 aria-hidden className="size-[13px] animate-spin" /> : <ArrowRight aria-hidden className="size-[13px]" strokeWidth={2.4} />}
      </button>
    );
  return (
    <li className={cn("anim-rise flex items-end gap-2.5", mine && "flex-row-reverse")}>
      {!mine && (
        <span className={cn(SALES_TILE, "size-[30px] rounded-[10px]")} aria-hidden>
          <Mic className="size-3.5" strokeWidth={2.2} />
        </span>
      )}
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-2 sm:max-w-[78%]", mine && "items-end")}>
        <p className="sr-only">{mine ? "You said:" : "Assistant said:"}</p>
        <div
          className={cn(
            "rounded-[18px] px-[15px] py-[11px] text-[14.5px] leading-[1.5] whitespace-pre-wrap [overflow-wrap:anywhere]",
            mine ? "rounded-br-[6px] bg-bubble-me text-on-bubble-me" : "rounded-bl-[6px] bg-bubble text-text",
          )}
        >
          {m.content}
        </div>
        {notice && (
          <div role="note" className="flex items-start gap-2 rounded-[14px] border border-warning bg-warning-bg px-3 py-[9px] text-[12.5px] leading-[1.45] text-warning">
            <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.4} />
            <span>
              <span className="font-extrabold">Security notice. </span>
              {notice}
            </span>
          </div>
        )}
        {products && products.length > 0 && (
          <ul className="grid w-full gap-2" aria-label="Suggested programs">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl border border-hair bg-panel2 px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <Link href={`/offers/${p.slug}`} className="block text-sm font-extrabold text-text no-underline hover:underline">
                    {p.name}
                  </Link>
                  <span className="block text-[12.5px] text-t3">
                    {p.duration_weeks} weeks · {p.level}
                  </span>
                </span>
                <span className="tabular text-[15px] font-extrabold">{formatMoney(p.price, p.currency, { trim: true })}</span>
                {cta?.product_id === p.id && enrollBtn(p, cta.label, true)}
              </li>
            ))}
          </ul>
        )}
        {cta?.type === "enroll" && !ctaIn && <span className="self-start">{enrollBtn({ id: cta.product_id }, cta.label, false)}</span>}
      </div>
    </li>
  );
}

function JourneyBanner({ journey, onResume }: { journey: Journey | null; onResume: (sessionId: string) => void }) {
  const open = journey?.open_checkouts ?? [];
  if (!open.length) return null;
  return (
    <ul className="mb-3 grid gap-2" aria-label="Your checkouts">
      {open.map((c) => {
        const held = c.status === "REQUIRES_APPROVAL";
        return (
          <li key={c.session_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border border-hair bg-panel2 px-3 py-2 text-[13px]">
            <Clock aria-hidden className="size-3.5 shrink-0 text-t3" />
            <span className="mr-auto min-w-0 text-t2">
              {held ? "Security review in progress for " : c.status === "FAILED" ? "Payment not completed for " : "Checkout open for "}
              <span className="font-bold text-text">{c.product_name}</span>
            </span>
            <button
              type="button"
              onClick={() => onResume(c.session_id)}
              className={cn(
                "inline-flex h-8 items-center rounded-[9px] px-3 text-[12.5px] font-extrabold",
                held ? "border border-hair bg-panel text-text" : "bg-brand text-on-brand",
              )}
            >
              {held ? "View status" : "Resume checkout"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
