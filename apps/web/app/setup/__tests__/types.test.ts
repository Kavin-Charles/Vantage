import { describe, it, expect } from 'vitest';
import { getStepList, getStepStatus, INITIAL_STATE } from '../types';
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
