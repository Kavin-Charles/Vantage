import { describe, it, expect } from 'vitest';
import { slugify, physicalTableName } from '../table-client';

describe('slugify', () => {
  it('lowercases and replaces dots and hyphens with underscores', () => {
    expect(slugify('com.example.crm-enricher')).toBe('com_example_crm_enricher');
  });

  it('handles already clean slugs', () => {
    expect(slugify('mycompany_plugin')).toBe('mycompany_plugin');
  });
});

describe('physicalTableName', () => {
  it('prefixes with plugin_ and slugified id', () => {
    expect(physicalTableName('com.example.crm-enricher', 'enrichment_cache'))
      .toBe('plugin_com_example_crm_enricher_enrichment_cache');
  });
});
