'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile, ProfileField } from '@/domain/rules/types';
import { speechLocales, type Locale } from '@/i18n/routing';
import { useProfile } from '@/lib/profile-state';
import { ProfileFieldControl } from './fields';

/**
 * The voice console — strictly additive (invariant 2).
 *
 * Everything here can fail and the app remains fully usable, because the typed
 * form below is the product. Failure states say so explicitly rather than
 * presenting a dead end.
 *
 * Fallback ladder, each rung tested in the degradation spec:
 *   server STT (Sarvam)  ->  browser SpeechRecognition  ->  typed form
 */

type Phase = 'idle' | 'recording' | 'processing' | 'review' | 'unavailable';

interface Capabilities {
  serverStt: boolean;
  serverTts: boolean;
  extraction: boolean;
}

/** Minimal shape of the browser's non-standard SpeechRecognition. */
interface BrowserRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): BrowserRecognition | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => BrowserRecognition)
    | undefined;
  return Ctor ? new Ctor() : null;
}

export function VoiceConsole() {
  const t = useTranslations('voice');
  const locale = useLocale() as Locale;
  const { setField } = useProfile();

  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [suggested, setSuggested] = useState<Profile>({});
  const [droppedCount, setDroppedCount] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<BrowserRecognition | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/voice')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: Capabilities | null) => {
        if (cancelled) return;
        setCapabilities(data);
        // Extraction is the one rung with no browser substitute: without it a
        // transcript cannot become fields at all.
        if (!data?.extraction) setPhase('unavailable');
      })
      .catch(() => {
        if (!cancelled) setPhase('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendTranscript = useCallback(
    async (body: BodyInit, contentType: string | null) => {
      setPhase('processing');
      try {
        const response = await fetch(`/api/voice?locale=${locale}`, {
          method: 'POST',
          headers: contentType ? { 'content-type': contentType } : undefined,
          body,
        });

        const data = (await response.json()) as {
          transcript?: string;
          suggested?: Profile;
          dropped?: string[];
          error?: string;
        };

        if (!response.ok) {
          setMessage(t('unavailable'));
          setPhase('idle');
          return;
        }

        setTranscript(data.transcript ?? '');
        setSuggested(data.suggested ?? {});
        setDroppedCount(data.dropped?.length ?? 0);

        // INVARIANT 3: nothing is applied here. The citizen confirms first.
        setPhase(Object.keys(data.suggested ?? {}).length > 0 ? 'review' : 'idle');
        if (Object.keys(data.suggested ?? {}).length === 0) setMessage(t('nothingFound'));
      } catch {
        setMessage(t('unavailable'));
        setPhase('idle');
      }
    },
    [locale, t],
  );

  const startBrowserRecognition = useCallback(() => {
    const recognition = getRecognition();
    if (!recognition) {
      setMessage(t('notSupported'));
      setPhase('unavailable');
      return false;
    }

    recognition.lang = speechLocales[locale];
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? '';
      if (said) {
        void sendTranscript(JSON.stringify({ transcript: said }), 'application/json');
      } else {
        setPhase('idle');
      }
    };
    recognition.onerror = () => {
      setMessage(t('permissionDenied'));
      setPhase('idle');
    };
    recognition.onend = () => {
      setPhase((current) => (current === 'recording' ? 'idle' : current));
    };

    recognitionRef.current = recognition;
    recognition.start();
    setPhase('recording');
    return true;
  }, [locale, sendTranscript, t]);

  const start = useCallback(async () => {
    setMessage(null);

    // No server STT: let the browser transcribe instead of failing.
    if (!capabilities?.serverStt) {
      startBrowserRecognition();
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      startBrowserRecognition();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size > 0) void sendTranscript(blob, recorder.mimeType);
        else setPhase('idle');
      };

      recorder.start();
      recorderRef.current = recorder;
      setPhase('recording');
    } catch {
      setMessage(t('permissionDenied'));
      setPhase('idle');
    }
  }, [capabilities, sendTranscript, startBrowserRecognition, t]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const confirm = useCallback(() => {
    for (const [key, value] of Object.entries(suggested)) {
      if (value !== undefined) setField(key as ProfileField, value as never);
    }
    setPhase('idle');
    setSuggested({});
    setTranscript('');
  }, [suggested, setField]);

  const discard = useCallback(() => {
    setPhase('idle');
    setSuggested({});
    setTranscript('');
    setDroppedCount(0);
  }, []);

  if (phase === 'unavailable') {
    return (
      <section
        data-testid="voice-unavailable"
        className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-sm"
      >
        <p className="font-medium">{t('unavailable')}</p>
        {/* Never a dead end: say plainly that nothing is lost. */}
        <p className="mt-1 text-[var(--color-ink-muted)]">{t('unavailableHint')}</p>
      </section>
    );
  }

  return (
    <section
      data-testid="voice-console"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4"
    >
      <h2 className="text-lg font-semibold tracking-tight">{t('heading')}</h2>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t('intro')}</p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {phase === 'recording' ? (
          <button
            type="button"
            onClick={stop}
            className="min-h-12 rounded-xl bg-[var(--color-fail)] px-5 text-base font-semibold text-[var(--color-fail-on)]"
          >
            {t('stop')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void start()}
            disabled={phase === 'processing'}
            className="min-h-12 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-[var(--color-brand-on)] disabled:opacity-60"
          >
            {t('start')}
          </button>
        )}

        <span aria-live="polite" className="text-sm text-[var(--color-ink-muted)]">
          {phase === 'recording' && t('listening')}
          {phase === 'processing' && t('processing')}
        </span>
      </div>

      {message && (
        <p role="status" className="mt-3 text-sm text-[var(--color-ink-muted)]">
          {message}
        </p>
      )}

      {phase === 'review' && (
        <SuggestionReview
          transcript={transcript}
          suggested={suggested}
          droppedCount={droppedCount}
          onChange={setSuggested}
          onConfirm={confirm}
          onDiscard={discard}
        />
      )}
    </section>
  );
}

/**
 * THE CONFIRMATION GATE (invariant 3).
 *
 * Extracted values are suggestions, rendered into the same controls the typed
 * form uses, and nothing reaches the profile — let alone the matcher — until
 * the citizen presses confirm. This is what makes a mis-transcription always
 * recoverable, which is the whole argument for being multimodal rather than
 * voice-only.
 */
function SuggestionReview({
  transcript,
  suggested,
  droppedCount,
  onChange,
  onConfirm,
  onDiscard,
}: {
  transcript: string;
  suggested: Profile;
  droppedCount: number;
  onChange: (profile: Profile) => void;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const t = useTranslations('voice');
  const fields = Object.keys(suggested) as ProfileField[];

  return (
    <div
      data-testid="suggestion-review"
      className="mt-4 rounded-xl border border-[var(--color-brand)]/30 bg-[color-mix(in_oklch,var(--color-brand)_6%,transparent)] p-4"
    >
      {transcript && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          <span className="font-medium">{t('heardYou')}: </span>
          <q>{transcript}</q>
        </p>
      )}

      <h3 className="mt-3 text-sm font-semibold">{t('reviewHeading')}</h3>
      <p className="mt-1 text-sm text-[var(--color-ink-muted)]">{t('reviewIntro')}</p>

      {droppedCount > 0 && (
        // Saying what was discarded is part of being auditable: the citizen can
        // add it by hand if we were wrong to drop it.
        <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
          {t('dropped', { count: droppedCount })}
        </p>
      )}

      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {fields.map((field) => (
          <ProfileFieldControl
            key={field}
            field={field}
            value={suggested[field]}
            onChange={(value) => {
              const next = { ...suggested };
              if (value === undefined) delete next[field];
              else Reflect.set(next, field, value);
              onChange(next);
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-12 rounded-xl bg-[var(--color-brand)] px-5 text-base font-semibold text-[var(--color-brand-on)]"
        >
          {t('confirm')}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="min-h-12 rounded-xl border border-[var(--color-border)] px-4 text-base"
        >
          {t('discard')}
        </button>
      </div>
    </div>
  );
}
