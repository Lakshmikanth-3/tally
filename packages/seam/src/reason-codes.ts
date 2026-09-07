// Human-readable strings live ONLY here, never inline in components or
// contracts — one source of truth, referenced by enum value everywhere else.
export const UNDERWRITING_REASON_TEXT: Record<number, string> = {
  0: 'Approved',
  1: 'Trailing revenue below the minimum threshold',
  2: 'Not enough transaction history to price confidently',
  3: 'Revenue volatility exceeds the policy ceiling',
  4: 'Issuer has an open default on another bond',
};
