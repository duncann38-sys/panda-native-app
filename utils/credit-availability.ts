/** Derived per render from the current verified account; never cached across accounts. */
export function creditCardholderName(name?: string | null): string {
  const normalized = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  return normalized ? normalized.toLocaleUpperCase('en-GB') : 'PANDA MEMBER';
}
