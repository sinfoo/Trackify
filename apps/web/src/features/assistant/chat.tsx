"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Loader2, Mic, MicOff, RotateCcw, SendHorizontal, ShieldAlert, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar, Money } from "@/components/ui-kit";
import { ApiError } from "@/lib/api";
import type { OfferCard, PublicMessage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BrowserSpeechAdapter, type ListenState } from "@/features/voice/adapter";
import { clearSession, loadSession, publicApi, saveSession, type StoredSession } from "@/features/public/api";

export const DEFAULT_CHIPS = [
  "Which course fits a career switch?",
  "How much is Generative AI?",
  "Is it too hard for a beginner?",
  "I want to enroll",
];

const VOICE_OUT_KEY = "assistant.voiceOut";

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
  className?: string;
}

type Phase = { kind: "loading" } | { kind: "start" } | { kind: "chat"; session: StoredSession };

export function AssistantChat({ extraChips, onSession, onReply, onCheckout, initialQuestion, className }: AssistantChatProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const onSessionRef = useRef(onSession);
  useEffect(() => {
    onSessionRef.current = onSession;
  });

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
    setMessages([]);
    setPhase({ kind: "start" });
    onSession?.(null);
  };

  return (
    <section aria-label="Sales assistant" className={cn("flex min-h-0 flex-col rounded-xl border bg-card", className)}>
      {phase.kind === "loading" && (
        <div className="flex flex-1 items-center justify-center gap-2 p-10 text-muted-foreground" role="status">
          <Loader2 aria-hidden className="size-4 animate-spin" /> Restoring your conversation
        </div>
      )}
      {phase.kind === "start" && <StartForm onStarted={started} />}
      {phase.kind === "chat" && (
        <ChatPane
          key={phase.session.conversation_id}
          session={phase.session}
          messages={messages}
          setMessages={setMessages}
          extraChips={extraChips}
          onReset={reset}
          onReply={onReply}
          onCheckout={onCheckout}
          initialQuestion={initialQuestion}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------- start form

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
    <form onSubmit={submit} className="mx-auto flex w-full max-w-md flex-col gap-5 overflow-y-auto p-6 md:p-8" noValidate>
      <div>
        <h2 className="text-xl font-semibold">Talk to the sales assistant</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask about programs, prices and fit. Name and email are optional; they help the team follow up.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="chat-name">Name (optional)</Label>
          <Input id="chat-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="chat-email">Email (optional)</Label>
          <Input
            id="chat-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={200}
          />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">How do you want to talk?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["text", "voice"] as const).map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                channel === c ? "border-primary bg-primary/10" : "hover:bg-muted",
              )}
            >
              <input
                type="radio"
                name="channel"
                value={c}
                checked={channel === c}
                onChange={() => setChannel(c)}
                className="sr-only"
              />
              {c === "text" ? <SendHorizontal aria-hidden className="size-4" /> : <Mic aria-hidden className="size-4" />}
              {c === "text" ? "Text" : "Voice and text"}
            </label>
          ))}
        </div>
      </fieldset>
      {voice && (
        <label className="flex items-start gap-3 rounded-lg border bg-muted/50 p-3 text-sm">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
            required
          />
          <span>
            I agree to voice mode. Speech is turned into text by my browser; no audio is sent to the academy. The
            resulting transcript is stored with this conversation like any typed message.
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger-text">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={pending || (voice && !consent)}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
        Start conversation
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- chat pane

function ChatPane({
  session,
  messages,
  setMessages,
  extraChips,
  onReset,
  onReply,
  onCheckout,
  initialQuestion,
}: {
  session: StoredSession;
  messages: PublicMessage[];
  setMessages: (fn: (m: PublicMessage[]) => PublicMessage[]) => void;
  extraChips?: AssistantChatProps["extraChips"];
  onReset: () => void;
  onReply?: () => void;
  onCheckout?: (id: string) => void;
  initialQuestion?: string;
}) {
  const router = useRouter();
  const speech = useMemo(() => new BrowserSpeechAdapter(), []);
  const [draft, setDraft] = useState(initialQuestion ?? "");
  const [sending, setSending] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [listen, setListen] = useState<ListenState>("idle");
  const [voiceOut, setVoiceOut] = useState(false);
  const [canListen, setCanListen] = useState(true);
  const [canSpeak, setCanSpeak] = useState(false);
  const stopRef = useRef<() => void>(() => {});
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const voiceOutRef = useRef(false);

  // Browser capability + saved preference are client-only; read once after mount.
  useEffect(() => {
    queueMicrotask(() => {
      setCanListen(speech.canListen);
      setCanSpeak(speech.canSpeak);
      const v = speech.canSpeak && localStorage.getItem(VOICE_OUT_KEY) === "1";
      voiceOutRef.current = v;
      setVoiceOut(v);
    });
    return () => {
      stopRef.current();
      speech.cancelSpeech();
    };
  }, [speech]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, sending]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || sending) return;
      setSending(true);
      setDraft("");
      try {
        const r = await publicApi.send(session, content);
        setMessages((m) => [...m, ...r.messages.filter((x) => !m.some((y) => y.id === x.id))]);
        const reply = [...r.messages].reverse().find((m) => m.role === "agent");
        if (reply && voiceOutRef.current) speech.speak(reply.content);
        onReply?.();
      } catch (e) {
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
    [sending, session, setMessages, speech, onReply, onReset],
  );

  const enroll = async (productId: string) => {
    setEnrolling(productId);
    try {
      const { checkout_session_id } = await publicApi.enroll(session, productId);
      if (onCheckout) onCheckout(checkout_session_id);
      else router.push(`/checkout/${checkout_session_id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not start enrollment. Try again.");
    } finally {
      setEnrolling(null);
    }
  };

  const toggleMic = () => {
    if (listen === "listening") {
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

  const toggleVoiceOut = (on: boolean) => {
    voiceOutRef.current = on;
    setVoiceOut(on);
    localStorage.setItem(VOICE_OUT_KEY, on ? "1" : "0");
    if (!on) speech.cancelSpeech();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(draft);
    }
  };

  const chips = [...DEFAULT_CHIPS.map((c) => ({ label: c, text: c, tone: undefined })), ...(extraChips ?? [])];
  const voiceAllowed = !!session.consent_voice;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <AgentAvatar agentId="sales" size="sm" />
        <div className="mr-auto min-w-0 leading-tight">
          <p className="text-sm font-semibold">Sales assistant</p>
          <p className="text-xs text-muted-foreground">Screened by the security agent before every reply</p>
        </div>
        {canSpeak && (
          <div className="flex items-center gap-2">
            <Switch id="voice-out" checked={voiceOut} onCheckedChange={toggleVoiceOut} />
            <Label htmlFor="voice-out" className="flex items-center gap-1 text-sm">
              <Volume2 aria-hidden className="size-4" /> Read replies aloud
            </Label>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onReset}>
          <RotateCcw aria-hidden /> New conversation
        </Button>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversation"
        className="flex min-h-64 flex-1 flex-col gap-4 overflow-y-auto px-4 py-5"
      >
        {messages.map((m) => (
          <MessageRow key={m.id} m={m} onEnroll={enroll} enrolling={enrolling} />
        ))}
        {sending && (
          <div className="flex items-end gap-2" role="status" aria-label="The assistant is typing">
            <AgentAvatar agentId="sales" size="sm" />
            <span className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm bg-muted px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className="size-1.5 animate-pulse rounded-full bg-muted-foreground"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t px-4 pt-3 pb-4">
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label="Suggested questions">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              disabled={sending}
              onClick={() => void send(c.text)}
              className={cn(
                "h-8 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors duration-150 hover:bg-muted disabled:opacity-50",
                c.tone === "danger" && "border-danger/40 text-danger-text hover:bg-danger/10",
              )}
            >
              {c.tone === "danger" && <ShieldAlert aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />}
              {c.label}
            </button>
          ))}
        </div>
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
          <Textarea
            id="chat-input"
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={2000}
            placeholder={listen === "listening" ? "Listening" : "Ask about a program, price or schedule"}
            className="max-h-40 min-h-11 resize-none"
          />
          {voiceAllowed && canListen && (
            <Button
              type="button"
              size="icon-lg"
              variant={listen === "listening" ? "destructive" : "outline"}
              onClick={toggleMic}
              aria-pressed={listen === "listening"}
              aria-label={listen === "listening" ? "Stop recording" : "Speak your message"}
              disabled={sending}
            >
              {listen === "listening" ? <MicOff aria-hidden /> : <Mic aria-hidden />}
            </Button>
          )}
          <Button type="submit" size="icon-lg" aria-label="Send message" disabled={sending || !draft.trim()}>
            {sending ? <Loader2 aria-hidden className="animate-spin" /> : <SendHorizontal aria-hidden />}
          </Button>
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
    <p role="status" className={cn("mt-2 flex items-center gap-1.5 text-sm", state === "listening" ? "text-danger-text" : "text-muted-foreground")}>
      {state === "listening" ? (
        <span aria-hidden className="size-2 animate-pulse rounded-full bg-danger" />
      ) : (
        <Info aria-hidden className="size-4" />
      )}
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------- messages

function MessageRow({
  m,
  onEnroll,
  enrolling,
}: {
  m: PublicMessage;
  onEnroll: (productId: string) => void;
  enrolling: string | null;
}) {
  if (m.role === "system") {
    return (
      <div className="mx-auto flex max-w-md items-start gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>{m.content}</p>
      </div>
    );
  }
  const mine = m.role === "customer";
  const { products, cta, notice } = m.meta ?? {};
  return (
    <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
      {!mine && <AgentAvatar agentId="sales" size="sm" />}
      <div className={cn("flex max-w-[85%] min-w-0 flex-col gap-2 sm:max-w-[75%]", mine && "items-end")}>
        <p className="sr-only">{mine ? "You said:" : "Assistant said:"}</p>
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]",
            mine ? "rounded-br-sm bg-navy text-sidebar-foreground dark:bg-info/30 dark:text-foreground" : "rounded-bl-sm bg-muted",
          )}
        >
          {m.content}
        </div>
        {notice && (
          <div role="note" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/12 px-3 py-2 text-sm text-warning-text">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              <span className="font-semibold">Security notice. </span>
              {notice}
            </span>
          </div>
        )}
        {products && products.length > 0 && (
          <ul className="grid w-full gap-2" aria-label="Suggested programs">
            {products.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </ul>
        )}
        {cta?.type === "enroll" && (
          <Button onClick={() => onEnroll(cta.product_id)} disabled={enrolling !== null} className="self-start">
            {enrolling === cta.product_id ? <Loader2 aria-hidden className="animate-spin" /> : <ArrowRight aria-hidden />}
            {cta.label}
          </Button>
        )}
      </div>
    </div>
  );
}

function ProductCard({ p }: { p: OfferCard }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2.5">
      <div className="mr-auto min-w-0">
        <p className="font-medium">{p.name}</p>
        <p className="text-sm text-muted-foreground">
          <span className="num">{p.duration_weeks}</span> weeks · {p.level}
        </p>
      </div>
      <Money value={p.price} currency={p.currency} className="font-semibold" />
      <Link href={`/offers/${p.slug}`} className="text-sm font-medium text-info-text underline-offset-4 hover:underline">
        Details<span className="sr-only"> about {p.name}</span>
      </Link>
    </li>
  );
}
