export type Transfer = {
  from_user_id: string;
  to_user_id: string;
  amount: number;
};

/**
 * Computes the minimum set of transfers to settle all debts.
 * Uses a greedy algorithm: repeatedly match the largest creditor
 * with the largest debtor until everyone is settled.
 *
 * @param players - Array of { user_id, profit } where profit can be negative (debt)
 * @returns Array of transfers { from_user_id, to_user_id, amount }
 */
export function computeTransfers(
  players: { user_id: string; profit: number }[]
): Transfer[] {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Work on mutable copies, filter out anyone who is exactly even
  const balances = players
    .map((p) => ({ user_id: p.user_id, balance: round2(p.profit) }))
    .filter((p) => Math.abs(p.balance) >= 0.01);

  const transfers: Transfer[] = [];

  while (true) {
    // Sort creditors (positive) descending, debtors (negative) ascending
    const creditors = balances
      .filter((p) => p.balance > 0.005)
      .sort((a, b) => b.balance - a.balance);
    const debtors = balances
      .filter((p) => p.balance < -0.005)
      .sort((a, b) => a.balance - b.balance);

    if (creditors.length === 0 || debtors.length === 0) break;

    const creditor = creditors[0];
    const debtor = debtors[0];

    const amount = round2(Math.min(creditor.balance, -debtor.balance));
    if (amount < 0.01) break;

    transfers.push({
      from_user_id: debtor.user_id,
      to_user_id: creditor.user_id,
      amount,
    });

    // Update balances in place
    const ci = balances.findIndex((p) => p.user_id === creditor.user_id);
    const di = balances.findIndex((p) => p.user_id === debtor.user_id);
    balances[ci].balance = round2(balances[ci].balance - amount);
    balances[di].balance = round2(balances[di].balance + amount);
  }

  return transfers;
}
