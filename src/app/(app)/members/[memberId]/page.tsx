
import MemberDetailsClientPage from './client-page';
import { studentsData } from '@/lib/mock-data';

export default function MemberDetailsPage({ params }: { params: { memberId: string } }) {
  const memberId = parseInt(params.memberId, 10);
  const member = studentsData.find(s => s.id === memberId);
  return <MemberDetailsClientPage member={member} />;
}
