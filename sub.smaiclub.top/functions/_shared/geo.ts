const REGION_NAMES: Record<string, string> = {
  HK: 'Hongkong',
  MO: 'Macau',
  ME: 'Montenegro',
  AT: 'Austria',
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
  SE: 'Sweden',
  ZA: 'SouthAfrica',
  RU: 'Russia',
};

export function labelRegion(codeOrName: string | null | undefined): string {
  const value = (codeOrName ?? '').trim();
  if (!value) return 'Global';
  const upper = value.toUpperCase();
  return REGION_NAMES[upper] ?? value.replace(/[^A-Za-z0-9\u4e00-\u9fa5-]+/g, '') ?? 'Global';
}

export function extractRegionFromName(name: string): string {
  const hashRegion = name.match(/(?:^|#|[^A-Za-z0-9])([A-Z]{2})(?:[^A-Za-z0-9]|$)/i)?.[1];
  if (hashRegion) {
    const upper = hashRegion.toUpperCase();
    if (REGION_NAMES[upper]) return labelRegion(upper);
    return 'Global';
  }
  if (/hong\s*kong|香港/i.test(name)) return 'Hongkong';
  if (/macao|macau|澳门|澳門/i.test(name)) return 'Macau';
  if (/japan|tokyo|日本/i.test(name)) return 'Japan';
  if (/korea|seoul|韩国|韓國|首尔|首爾/i.test(name)) return 'Korea';
  if (/singapore|新加坡/i.test(name)) return 'Singapore';
  if (/taiwan|台湾|台灣/i.test(name)) return 'Taiwan';
  if (/malaysia|kuala\s*lumpur|马来|馬來/i.test(name)) return 'Malaysia';
  if (/thailand|bangkok|泰国|泰國/i.test(name)) return 'Thailand';
  if (/vietnam|viet\s*nam|越南/i.test(name)) return 'Vietnam';
  if (/philippines|manila|菲律宾|菲律賓/i.test(name)) return 'Philippines';
  if (/indonesia|jakarta|印尼|印度尼西亚|印度尼西亞/i.test(name)) return 'Indonesia';
  if (/\bindia\b|mumbai|delhi|印度/i.test(name)) return 'India';
  if (/united\s*states|america|\busa?\b|美国|美國/i.test(name)) return 'UnitedStates';
  if (/canada|toronto|加拿大/i.test(name)) return 'Canada';
  if (/united\s*kingdom|great\s*britain|\buk\b|london|英国|英國/i.test(name)) return 'UnitedKingdom';
  if (/germany|frankfurt|德国|德國/i.test(name)) return 'Germany';
  if (/france|paris|法国|法國/i.test(name)) return 'France';
  if (/netherlands|amsterdam|荷兰|荷蘭/i.test(name)) return 'Netherlands';
  if (/australia|sydney|澳大利亚|澳大利亞/i.test(name)) return 'Australia';
  return 'Global';
}
