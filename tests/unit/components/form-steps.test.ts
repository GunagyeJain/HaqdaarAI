import { describe, expect, it } from 'vitest';
import { clampStep, FORM_STEPS, TOTAL_STEPS } from '@/components/form-steps';
import { PROFILE_FIELDS } from '@/domain/rules/types';

/**
 * The steps are a presentation grouping over the profile, so the property that
 * must never drift is coverage.
 *
 * A field that exists in the profile but appears on no step is a field the
 * citizen can never answer, and it would fail silently: the matcher would keep
 * asking about it through the next-question engine while the form offered no
 * way to give it. That is the failure this file exists to make impossible.
 */
describe('FORM_STEPS', () => {
  it('covers every profile field exactly once', () => {
    const onSteps = FORM_STEPS.flatMap((step) => [...step.fields]);

    expect([...onSteps].sort()).toEqual([...PROFILE_FIELDS].sort());
  });

  it('is five steps', () => {
    expect(FORM_STEPS).toHaveLength(5);
  });

  it('opens with the questions that are easiest to answer', () => {
    expect(FORM_STEPS[0]!.fields).toContain('age');
  });

  it('leaves the sensitive questions until last', () => {
    /**
     * Caste and disability come last deliberately. A citizen should reach the
     * end of an answerable form before being asked anything uncomfortable, and
     * should be free to stop at any point -- the same reasoning as ASK_ORDER in
     * the next-question engine.
     */
    const last = FORM_STEPS[FORM_STEPS.length - 1]!;

    expect(last.fields).toContain('category');
    expect(last.fields).toContain('isDisabled');
    expect(last.fields).toContain('disabilityPercentage');
  });

  it('never puts a disability percentage on an earlier step than the question it depends on', () => {
    const stepOf = (field: string) =>
      FORM_STEPS.findIndex((step) => step.fields.includes(field as never));

    expect(stepOf('disabilityPercentage')).toBeGreaterThanOrEqual(stepOf('isDisabled'));
  });

  it('gives every step a distinct id, since the copy is keyed on it', () => {
    const ids = FORM_STEPS.map((step) => step.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * The step lives in the URL so the phone's back button moves between steps
 * rather than leaving the site. That means anyone can type anything into it.
 */
describe('clampStep', () => {
  it('defaults to the first step when nothing is given', () => {
    expect(clampStep(null)).toBe(1);
  });

  it('keeps a step that exists', () => {
    expect(clampStep('3')).toBe(3);
  });

  it('clamps rather than throwing on a step past the end', () => {
    expect(clampStep('99')).toBe(TOTAL_STEPS);
  });

  it('clamps a zero or negative step to the first', () => {
    expect(clampStep('0')).toBe(1);
    expect(clampStep('-4')).toBe(1);
  });

  it('falls back to the first step on nonsense', () => {
    expect(clampStep('banana')).toBe(1);
    expect(clampStep('')).toBe(1);
  });
});
