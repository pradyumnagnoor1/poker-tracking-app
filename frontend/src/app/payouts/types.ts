export type Payment = {
  id: string;
  session_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: "pending" | "claimed" | "confirmed";
  created_at: string;
  session: { id: string; title: string } | null;
};

export type PersonGroup = {
  counterpartyId: string;
  name: string;
  netToMe: number; // positive = they owe me, negative = I owe them
  payments: Payment[];
  iOweTotal: number;
  theyOweTotal: number;
};
