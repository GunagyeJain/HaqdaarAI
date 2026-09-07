'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { MatchResult } from '@/domain/matching/types';
import type { NextQuestion } from '@/domain/questions/select';
import type { Profile, ProfileField } from '@/domain/rules/types';

/**
 * The single shared profile state.
 *
 * Phase 4's voice console writes into this same object, so neither input path
 * is a second system (proposal §5.2). Voice will populate these fields as
 * *suggestions* that the citizen confirms in the same inputs the typed form
 * uses — invariant 3.
 *
 * INVARIANT 5: this lives in React state only. Nothing is written to
 * localStorage, a cookie, or a server. Closing the tab forgets everything, and
 * that is the intended behaviour for caste, income and disability data.
 */

interface ProfileState {
  profile: Profile;
  setField: <K extends ProfileField>(field: K, value: Profile[K]) => void;
  clearField: (field: ProfileField) => void;
  reset: () => void;

  result: MatchResult | null;
  nextQuestion: NextQuestion | null;
  isMatching: boolean;
  error: string | null;
  /** Field the next-question card is inviting the citizen to answer. */
  highlightedField: ProfileField | null;
  setHighlightedField: (field: ProfileField | null) => void;

  runMatch: () => Promise<void>;
  answeredCount: number;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: string;
}) {
  const [profile, setProfile] = useState<Profile>({});
  const [result, setResult] = useState<MatchResult | null>(null);
  const [nextQuestion, setNextQuestion] = useState<NextQuestion | null>(null);
  const [isMatching, setIsMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedField, setHighlightedField] = useState<ProfileField | null>(null);

  const setField = useCallback<ProfileState['setField']>((field, value) => {
    setProfile((current) => ({ ...current, [field]: value }));
  }, []);

  const clearField = useCallback((field: ProfileField) => {
    setProfile((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setProfile({});
    setResult(null);
    setNextQuestion(null);
    setError(null);
    setHighlightedField(null);
  }, []);

  const runMatch = useCallback(async () => {
    setIsMatching(true);
    setError(null);

    try {
      const response = await fetch('/api/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile, locale }),
      });

      if (!response.ok) {
        throw new Error(`match request failed (${response.status})`);
      }

      const data = (await response.json()) as {
        result: MatchResult;
        nextQuestion: NextQuestion | null;
      };

      setResult(data.result);
      setNextQuestion(data.nextQuestion);
      setHighlightedField(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'match failed');
    } finally {
      setIsMatching(false);
    }
  }, [profile, locale]);

  const answeredCount = useMemo(
    () => Object.values(profile).filter((value) => value !== undefined).length,
    [profile],
  );

  const value = useMemo<ProfileState>(
    () => ({
      profile,
      setField,
      clearField,
      reset,
      result,
      nextQuestion,
      isMatching,
      error,
      highlightedField,
      setHighlightedField,
      runMatch,
      answeredCount,
    }),
    [
      profile,
      setField,
      clearField,
      reset,
      result,
      nextQuestion,
      isMatching,
      error,
      highlightedField,
      runMatch,
      answeredCount,
    ],
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used inside a ProfileProvider');
  }
  return context;
}
