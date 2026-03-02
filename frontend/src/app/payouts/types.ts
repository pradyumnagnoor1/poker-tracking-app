export type Payment = {
  id: string;
  session_id: string;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  status: "pending" | "claimed" | "confirmed";
  session: { id: string; title: string } | null;
};

export type PersonGroup = {
  counterpartyId: string;
  name: string;
  netToMe: number;
  payments: Payment[];
  iOweTotal: number;
  theyOweTotal: number;
};
