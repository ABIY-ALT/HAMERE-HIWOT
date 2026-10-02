import { redirect } from 'next/navigation';

// Servants are kept in one register: HR → Servants & Personnel.
export default function ServantsRedirect() {
  redirect('/dashboard/hr/personnel');
}
