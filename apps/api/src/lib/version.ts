import semver from 'semver';

export {
  valid as semverValid,
  validRange as semverValidRange,
  gt as semverGt,
  satisfies as semverSatisfies,
  major as semverMajor,
  prerelease as semverPrerelease,
} from 'semver';

/** SDK major version this host supports. Bump when @vencore/plugin-runtime breaks compat. */
export const SUPPORTED_SDK_MAJOR = 0;

/** Valid semver with no prerelease component. */
export function isStableSemver(v: string): boolean {
  return semver.valid(v) !== null && semver.prerelease(v) === null;
}

export function compareSemver(a: string, b: string): number {
  return semver.compare(a, b);
}

/** Highest stable semver among arbitrary registry tags, or null. */
export function pickLatest(tags: string[]): string | null {
  const stable = tags.filter(isStableSemver);
  if (stable.length === 0) return null;
  return stable.sort(compareSemver).at(-1) ?? null;
}
