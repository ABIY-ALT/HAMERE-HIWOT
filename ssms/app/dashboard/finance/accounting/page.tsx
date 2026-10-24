import { redirect } from 'next/navigation';

// Accounting opens on the financial statements
export default function AccountingPage() {
  redirect('/dashboard/finance/accounting/statements');
}
