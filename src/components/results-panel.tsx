'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { partition } from '@/domain/matching/shortlist';
import type { MatchResultItem } from '@/domain/matching/types';
import { useProfile } from '@/lib/profile-state';
import { Signpost } from './illustrations';
import { Narrowing } from './narrowing';
import { SchemeCard } from './scheme-card';

/**
 * The result list, in the order a citizen can act on.
 *
 * It used to lead with "N you qualify for", and that number is almost always
 * zero: around 60% of corpus clauses are WILDCARD, a wildcard is UNKNOWN
 * forever, and so most schemes structurally cannot reach PASS however much
 * anyone answers. Opening on a zero is accurate and useless, and reads as a
 * rejection of the person rather than a limit of the tool.
 *
 * So it leads with the shortlist -- everything we could check has passed, only
 * human verification left -- and the long tail is collapsed behind counts that
 * are still stated in full. Nothing is hidden; the order just stops burying the
 * part worth reading.
 */

/**
 * How many ineligible schemes to render at once.
 *
 * Rendering all of them was measurably slow even on a desktop; on the
 * mid-range Android this is built for it would be far worse, and this is the
 * least actionable content on the page. The count is always stated in full --
 * the cap is a rendering limit, not a hidden result.
 */
const MAX_FAILED_RENDERED = 25;

export function ResultsPanel() {
  const t = useTranslations('results');
  const { result } = useProfile();

  const [narrowing, setNarrowing] = useState(true);
  const [showNeedsAnswers, setShowNeedsAnswers] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);

  if (!result) return null;

  // The list stays hidden while the narrowing is on screen: showing one that is
  // about to change would be showing an answer we are mid-way through
  // correcting.
  if (narrowing) return <Narrowing onDone={() => setNarrowing(false)} />;

  const { shortlist, needsAnswers, ineligible } = partition(result);
  const { counts } = result;

  return (
    <section aria-live="polite" className="flex flex-col gap-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold tracking-tight">{t('heading')}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {t('summary', { pass: counts.pass, unknown: counts.unknown, total: counts.total })}
          </p>
        </div>
        <Signpost className="hidden w-24 shrink-0 sm:block" />
      </div>

      {shortlist.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h3 className="text-lg font-bold tracking-tight">
            {t('shortlistHeading', { count: shortlist.length })}
          </h3>
          <p className="text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {t('shortlistIntro')}
          </p>
          {shortlist.map((item) => (
            <SchemeCard key={item.schemeId} item={item} />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-[var(--color-border-strong)] p-5 text-sm leading-relaxed text-[var(--color-ink-muted)]">
          {t('shortlistEmpty')}
        </p>
      )}

      <Disclosure
        label={t('needsAnswers', { count: needsAnswers.length })}
        open={showNeedsAnswers}
        onToggle={() => setShowNeedsAnswers((shown) => !shown)}
        items={needsAnswers}
      />

      <Disclosure
        label={t('ruledOut', { count: ineligible.length })}
        open={showIneligible}
        onToggle={() => setShowIneligible((shown) => !shown)}
        items={ineligible}
        cap={MAX_FAILED_RENDERED}
        capNote={(shown, total) => t('showingSome', { shown, total })}
      />
    </section>
  );
}

function Disclosure({
  label,
  open,
  onToggle,
  items,
  cap,
  capNote,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: MatchResultItem[];
  cap?: number;
  capNote?: (shown: number, total: number) => string;
}) {
  if (items.length === 0) return null;

  const rendered = cap ? items.slice(0, cap) : items;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="min-h-12 self-start text-left text-base font-medium text-[var(--color-brand-text)] underline underline-offset-2"
      >
        {label}
      </button>

      {open && (
        <>
          {cap && capNote && items.length > cap && (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {capNote(cap, items.length)}
            </p>
          )}
          {rendered.map((item) => (
            <SchemeCard key={item.schemeId} item={item} />
          ))}
        </>
      )}
    </div>
  );
}
