const REGION_NAMES: Record<string, string> = {
  HK: 'Hongkong',
  MO: 'Macau',
  TW: 'Taiwan',
  JP: 'Japan',
  KR: 'Korea',
  SG: 'Singapore',
  MY: 'Malaysia',
  TH: 'Thailand',
  VN: 'Vietnam',
  PH: 'Philippines',
  ID: 'Indonesia',
  IN: 'India',
  US: 'UnitedStates',
  CA: 'Canada',
  GB: 'UnitedKingdom',
  DE: 'Germany',
  FR: 'France',
  NL: 'Netherlands',
  AU: 'Australia',
};

export function labelRegion(codeOrName: string | null | undefined): string {
  const value = (codeOrName ?? '').trim();
  if (!value) return 'Global';
  const upper = value.toUpperCase();
  return REGION_NAMES[upper] ?? value.replace(/[^A-Za-z0-9\u4e00-\u9fa5]+/g, '') ?? 'Global';
}

export function extractRegionFromName(name: string): string {
  const hashRegion = name.match(/#?\s*([A-Z]{2})(?:\b|$)/i)?.[1];
  if (hashRegion) return labelRegion(hashRegion);
  if (/hong\s*kong|香港/i.test(name)) return 'Hongkong';
  if (/japan|tokyo|日本/i.test(name)) return 'Japan';
  if (/singapore|新加坡/i.test(name)) return 'Singapore';
  if (/taiwan|台湾|台灣/i.test(name)) return 'Taiwan';
  if (/united\s*states|america|美国|美國/i.test(name)) return 'UnitedStates';
  return 'Global';
}
