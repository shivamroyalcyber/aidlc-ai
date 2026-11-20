import accountBalance from './account-balance.json';
import creditScore from './credit-score.json';
import fundTransfer from './fund-transfer.json';
import transactionHistory from './transaction-history.json';

/** Every integration document bundled with the gateway (ADR-002). Validated by the registry at load. */
export const INTEGRATION_DOCUMENTS: unknown[] = [accountBalance, transactionHistory, fundTransfer, creditScore];
