/** Seed data for the simulated systems. All names and numbers are fictitious. */

export interface LegacyTransaction {
  id: string;
  /** yyyyMMdd, as the legacy system stores it */
  date: string;
  amount: number;
  indicator: 'CR' | 'DR';
  narration: string;
  balanceAfter: number;
}

export interface LegacyAccount {
  number: string;
  name: string;
  available: number;
  ledger: number;
  currency: 'INR';
  status: 'A' | 'F';
  transactions: LegacyTransaction[];
}

export const CORE_BANKING_NS = 'http://legacybank.example.com/corebanking';

export const ACCOUNTS: Record<string, LegacyAccount> = {
  ACC101: {
    number: 'ACC101',
    name: 'Aarav Sharma',
    available: 50000,
    ledger: 50000,
    currency: 'INR',
    status: 'A',
    transactions: [
      { id: 'TXN90001', date: '20261118', amount: 2500, indicator: 'DR', narration: 'UPI/Coffee Day', balanceAfter: 50000 },
      { id: 'TXN89977', date: '20261115', amount: 45000, indicator: 'CR', narration: 'Salary November', balanceAfter: 52500 },
      { id: 'TXN89940', date: '20261112', amount: 1200, indicator: 'DR', narration: 'Electricity bill', balanceAfter: 7500 },
      { id: 'TXN89902', date: '20261108', amount: 3300, indicator: 'DR', narration: 'Groceries', balanceAfter: 8700 },
      { id: 'TXN89850', date: '20261103', amount: 12000, indicator: 'DR', narration: 'Rent October', balanceAfter: 12000 },
      { id: 'TXN89701', date: '20261028', amount: 24000, indicator: 'CR', narration: 'Freelance payment', balanceAfter: 24000 },
    ],
  },
  ACC102: {
    number: 'ACC102',
    name: 'Diya Patel',
    available: 125000.5,
    ledger: 127500.5,
    currency: 'INR',
    status: 'A',
    transactions: [{ id: 'TXN90010', date: '20261119', amount: 2500, indicator: 'CR', narration: 'Transfer from ACC101', balanceAfter: 125000.5 }],
  },
  ACC103: {
    number: 'ACC103',
    name: 'Kabir Singh',
    available: 820.75,
    ledger: 820.75,
    currency: 'INR',
    status: 'A',
    transactions: [],
  },
  ACC104: {
    number: 'ACC104',
    name: 'Meera Iyer',
    available: 9100,
    ledger: 9100,
    currency: 'INR',
    status: 'F',
    transactions: [],
  },
};

export interface CreditProfile {
  customerId: string;
  score: number;
  band: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  factors: string[];
}

export const CUSTOMERS: Record<string, CreditProfile> = {
  CUST1001: { customerId: 'CUST1001', score: 742, band: 'GOOD', factors: ['On-time repayments for 36 months', 'Credit utilisation 28%'] },
  CUST1002: { customerId: 'CUST1002', score: 598, band: 'FAIR', factors: ['Two late payments in 12 months', 'Short credit history'] },
  CUST1003: { customerId: 'CUST1003', score: 811, band: 'EXCELLENT', factors: ['No missed payments', 'Low utilisation 9%'] },
};
