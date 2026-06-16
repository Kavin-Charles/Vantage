import { describe, it, expect } from 'vitest';
import { getStepList, getStepStatus, INITIAL_STATE, wizardReducer } from '../types';
import type { SetupState } from '../types';

describe('getStepList', () => {
  it('returns the fixed step order', () => {
    const list = getStepList(INITIAL_STATE);
    expect(list).toEqual(['branding', 'smtp', 'features', 'admin', 'review', 'complete']);
  });

  it('always ends with review then complete', () => {
    const list = getStepList(INITIAL_STATE);
    expect(list.at(-1)).toBe('complete');
    expect(list.at(-2)).toBe('review');
  });
});

describe('getStepStatus', () => {
  it('returns current for active step', () => {
    const list = getStepList(INITIAL_STATE);
    expect(getStepStatus('branding', 'branding', [], list)).toBe('current');
  });

  it('returns done for past step', () => {
    const list = getStepList(INITIAL_STATE);
    expect(getStepStatus('branding', 'smtp', [], list)).toBe('done');
  });

  it('returns locked for future step', () => {
    const list = getStepList(INITIAL_STATE);
    expect(getStepStatus('features', 'branding', [], list)).toBe('locked');
  });

  it('returns skipped when step in skipped array', () => {
    const list = getStepList(INITIAL_STATE);
    expect(getStepStatus('smtp', 'features', ['smtp'], list)).toBe('skipped');
  });
});

describe('wizardReducer', () => {
  it('NEXT advances to next step', () => {
    const state: SetupState = { ...INITIAL_STATE, currentStep: 'branding' };
    const list = getStepList(state);
    const next = wizardReducer(state, { type: 'NEXT' });
    expect(next.currentStep).toBe(list[list.indexOf('branding') + 1]);
  });

  it('BACK does nothing at first step', () => {
    const state: SetupState = { ...INITIAL_STATE, currentStep: 'branding' };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.currentStep).toBe('branding');
  });

  it('SKIP adds step to skipped and advances', () => {
    const state: SetupState = { ...INITIAL_STATE, currentStep: 'smtp' };
    const next = wizardReducer(state, { type: 'SKIP', step: 'smtp' });
    expect(next.skipped).toContain('smtp');
    expect(next.currentStep).toBe('features');
  });

  it('SET_BRANDING updates branding', () => {
    const updated = { name: 'Acme', logoUrl: '', faviconUrl: '', primaryColor: '#000', tagline: 'hello' };
    const next = wizardReducer(INITIAL_STATE, { type: 'SET_BRANDING', value: updated });
    expect(next.branding.name).toBe('Acme');
  });

  it('SET_SMTP stores smtp config', () => {
    const smtp = { host: 'smtp.example.com', port: 587, secure: true, user: 'u', password: 'p', from: 'f@example.com' };
    const next = wizardReducer(INITIAL_STATE, { type: 'SET_SMTP', value: smtp });
    expect(next.smtp).toEqual(smtp);
  });
});
