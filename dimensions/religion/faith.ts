// Shared by build.ts and web.ts (pure code, no Node APIs).

const SYNONYMS: Record<string, string> = { islam: 'muslim', islamic: 'muslim', catholic: 'roman catholic' };
const norm = (s: string) => SYNONYMS[s.trim().toLowerCase()] ?? s.trim().toLowerCase();

/**
 * Whether the register's "religious ethos" says something the "religious character" does not.
 * It repeats the character for almost every faith school ("Roman Catholic" and "Roman Catholic",
 * "Muslim" and "Islam"), so it is only worth showing when the character is missing ("None"
 * schools that call themselves Christian) or differs ("Church of England" with "Christian").
 */
export function ethosAddsToCharacter(ethos: string | null, character: string | null): boolean {
  if (!ethos) return false;
  if (!character) return true;
  const c = norm(character);
  return norm(ethos) !== c && !c.split('/').map(norm).includes(norm(ethos));
}

/** "Inter- / non- denominational" is the register's way of saying no particular faith. */
export function isNonDenominational(ethos: string): boolean {
  return /non-?\s*denominational/i.test(ethos);
}

/** A faith school: the register gives a religious character, or an ethos that names a faith. */
export function isFaithSchool(character: string | null, ethos: string | null): boolean {
  return character !== null || (ethos !== null && !isNonDenominational(ethos));
}

/**
 * The diocese for display. The register tags dioceses that have both a Catholic and an Anglican
 * school body with "(rc)" or "(ce)"; the religious character already says which, so drop the tag.
 */
export function dioceseLabel(diocese: string): string {
  return diocese.replace(/\s*\((rc|ce)\)$/i, '');
}
