import { describe, it, expect } from 'vitest';
import { getStepList, getStepStatus, INITIAL_STATE, wizardReducer } from '../types';
import type { SetupState } from '../types';

const dockerState: SetupState = { ...INITIAL_STATE, infra: { ...INITIAL_STATE.infra, mode: 'docker-deploy' } };
const ownCredsState: SetupState = { ...INITIAL_STATE, infra: { ...INITIAL_STATE.infra, mode: 'own-creds' } };

describe('getStepList', () => {
  it('docker-deploy: does not include db or redis', () => {
    const list = getStepList(dockerState);
    expect(list).not.toContain('db');
    expect(list).not.toContain('redis');
  });

  it('own-creds: includes db and redis after infra', () => {
    const list = getStepList(ownCredsState);
    const infraIdx = list.indexOf('infra');
    expect(list[infraIdx + 1]).toBe('db');
    expect(list[infraIdx + 2]).toBe('redis');
  });

  it('always ends with review then complete', () => {
    const list = getStepList(dockerState);
    expect(list.at(-1)).toBe('complete');
    expect(list.at(-2)).toBe('review');
  });
});

describe('getStepStatus', () => {
  it('returns current for active step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('branding', 'branding', [], list)).toBe('current');
  });

  it('returns done for past step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('branding', 'infra', [], list)).toBe('done');
  });

  it('returns locked for future step', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('domain', 'branding', [], list)).toBe('locked');
  });

  it('returns skipped when step in skipped array', () => {
    const list = getStepList(dockerState);
    expect(getStepStatus('smtp', 'features', ['smtp'], list)).toBe('skipped');
  });
});

describe('wizardReducer', () => {
  it('NEXT advances to next step', () => {
    const state = { ...INITIAL_STATE, currentStep: 'branding' as const };
    const list = getStepList(state);
    const next = wizardReducer(state, { type: 'NEXT' });
    expect(next.currentStep).toBe(list[list.indexOf('branding') + 1]);
  });

  it('BACK does nothing at first step', () => {
    const state = { ...INITIAL_STATE, currentStep: 'branding' as const };
    const next = wizardReducer(state, { type: 'BACK' });
    expect(next.currentStep).toBe('branding');
  });

  it('SKIP adds step to skipped and advances', () => {
    const state = { ...INITIAL_STATE, currentStep: 'domain' as const };
    const next = wizardReducer(state, { type: 'SKIP', step: 'domain' });
    expect(next.skipped).toContain('domain');
    expect(next.currentStep).toBe('smtp');
  });

  it('SET_INFRA clears db and redis from skipped', () => {
    const state = { ...INITIAL_STATE, skipped: ['db', 'redis'] as ('db' | 'redis')[] };
    const next = wizardReducer(state, { type: 'SET_INFRA', value: state.infra });
    expect(next.skipped).not.toContain('db');
    expect(next.skipped).not.toContain('redis');
  });
});
