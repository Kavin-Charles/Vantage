interface UsageCounts {
  contacts: number;
  servers: number;
  dbs: number;
  seats: number;
}

interface BillBreakdown {
  base: number;      // cents
  overage: number;   // cents
  total: number;     // cents
}

export function calculateBill(usage: UsageCounts): BillBreakdown {
  const BASE = 79_00; // $79 in cents
  const contactOverage = Math.max(0, Math.ceil((usage.contacts - 1000) / 500)) * 10_00;
  const serverOverage = Math.max(0, usage.servers - 5) * 8_00;
  const dbOverage = Math.max(0, usage.dbs - 3) * 6_00;
  const seatOverage = Math.max(0, usage.seats - 5) * 12_00;
  const overage = contactOverage + serverOverage + dbOverage + seatOverage;
  return { base: BASE, overage, total: BASE + overage };
}
