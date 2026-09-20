export const SCHOOLS = [
  'PHINMA University of Pangasinan',
  'University of Luzon',
  'Lyceum Northwestern University',
  'Universidad de Dagupan',
  'Systems Technology Institute College',
] as const;

export type School = typeof SCHOOLS[number];
