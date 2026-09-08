/**
 * Drawn scenes, not photographs and not decoration.
 *
 * The interface asks people for their caste, income and disability status. An
 * interface that looks like a government portal invites the feeling that you
 * need to already know the rules to use it, which is the precise barrier this
 * project exists to remove. A few warm drawings do more against that than any
 * amount of copy.
 *
 * FOUR CONSTRAINTS, all load-bearing:
 *
 *   - NO FACES. There is no decision to get wrong about whose face represents
 *     someone who needs a welfare scheme.
 *   - NO TEXT and no script, so one drawing serves all five locales.
 *   - Colour comes from the palette tokens, so both themes work without a
 *     second copy of anything.
 *   - Inline and tiny. The assumed device is a mid-range Android on a slow
 *     connection; a decorative image is not worth a request.
 *
 * Every one is aria-hidden. Nothing here carries meaning that is not also in
 * text.
 */

type Props = { className?: string };

const shared = {
  fill: 'none' as const,
  'aria-hidden': true as const,
  focusable: 'false' as const,
};

/**
 * An open door with light behind it, echoing the mark.
 *
 * Haqdaar means "one who is rightfully entitled", and what is being offered is
 * a way in -- so a doorway standing open, rather than a crest or a seal. Seals
 * say "this is official", and the barrier here is that people already assume it
 * is official and assume it is not for them.
 */
export function OpenDoor({ className }: Props) {
  return (
    <svg viewBox="0 0 140 110" className={className} {...shared}>
      {/* Light falling out through the opening. */}
      <path d="M70 96 L130 96 L98 30 L70 30 Z" fill="var(--color-brand)" opacity="0.14" />
      {/* An arch, because a rectangle is a form and an arch is an entrance. */}
      <path
        d="M20 96 V50 a25 25 0 0 1 50 0 V96"
        stroke="var(--color-brand-text)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      {/* The door itself, standing open. */}
      <path
        d="M70 96 V26 L98 17 V88 Z"
        stroke="var(--color-brand-text)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="77" cy="58" r="2.8" fill="var(--color-brand-text)" />
      <path d="M8 96 H134" stroke="var(--color-border-strong)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A form on a table, with a hand resting on it. Beginning, not submitting. */
export function HandWithForm({ className }: Props) {
  return (
    <svg viewBox="0 0 140 110" className={className} {...shared}>
      <rect
        x="34"
        y="12"
        width="72"
        height="66"
        rx="7"
        fill="var(--color-brand)"
        opacity="0.1"
      />
      <rect
        x="34"
        y="12"
        width="72"
        height="66"
        rx="7"
        stroke="var(--color-brand-text)"
        strokeWidth="3"
      />
      <g stroke="var(--color-brand-text)" strokeWidth="3" strokeLinecap="round" opacity="0.75">
        <path d="M48 32 H80" />
        <path d="M48 45 H92" />
        <path d="M48 58 H72" />
      </g>
      {/* A hand, drawn as three fingers over the edge. No face, no figure. */}
      <path
        d="M52 92 q8 -12 20 -12 h22 q10 0 10 9 t-10 9 H60 q-8 0 -8 -6 Z"
        stroke="var(--color-ink-muted)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A lamp: a few good questions shed more light than a long list. */
export function Lamp({ className }: Props) {
  return (
    <svg viewBox="0 0 140 110" className={className} {...shared}>
      <path d="M46 52 L94 52 L112 96 L28 96 Z" fill="var(--color-unknown)" opacity="0.16" />
      <path
        d="M56 20 h28 l12 26 H44 Z"
        stroke="var(--color-brand-text)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M70 46 V70" stroke="var(--color-brand-text)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="70" cy="76" r="6" stroke="var(--color-brand-text)" strokeWidth="3" />
      <path d="M8 96 H134" stroke="var(--color-border-strong)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A signpost: the results point somewhere, they are not a verdict. */
export function Signpost({ className }: Props) {
  return (
    <svg viewBox="0 0 140 110" className={className} {...shared}>
      <path d="M66 96 V22" stroke="var(--color-ink-muted)" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M66 30 h44 l10 11 -10 11 H66 Z"
        fill="var(--color-pass)"
        opacity="0.18"
        stroke="var(--color-brand-text)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M66 62 H30 l-10 11 10 11 h36 Z"
        stroke="var(--color-border-strong)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M8 96 H134" stroke="var(--color-border-strong)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
