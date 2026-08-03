// Browser-safe subset of @vencore/config.
//
// The package barrel (./index) re-exports readConfig, which imports `fs`. Any
// client component that pulls the barrel drags `fs` into the browser bundle and
// the build fails with "Module not found: Can't resolve 'fs'". Client code that
// only needs theming should import from '@vencore/config/theme' instead.
export { generateTheme } from './palette';
export { PRESETS, getPreset, type Preset } from './presets';
export { appearanceSchema, type Appearance } from './config-schema';
