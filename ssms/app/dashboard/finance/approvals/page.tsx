import { redirect } from 'next/navigation';

// Approvals are handled on the Payment Requests page ("Awaiting approval" tab).
export default function FinanceApprovalsRedirect() {
  redirect('/dashboard/finance/requests');
}
