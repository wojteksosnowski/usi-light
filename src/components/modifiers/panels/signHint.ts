/** Zwraca [tekst, kolor] podpowiedzi zależnej od znaku wartości — współdzielone przez panele pól modyfikatorów. */
export function signHint(
  value: number,
  negative: [string, string],
  positive: [string, string]
): { text: string; color: string } {
  const [text, color] = value < 0 ? negative : positive;
  return { text, color };
}
