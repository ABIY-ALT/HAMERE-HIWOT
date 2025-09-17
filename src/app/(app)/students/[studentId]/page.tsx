
import StudentDetailsClientPage from './client-page';
import { studentsData } from '@/lib/mock-data';

export default function StudentDetailsPage({ params }: { params: { studentId: string } }) {
  const studentId = parseInt(params.studentId, 10);
  const student = studentsData.find(s => s.id === studentId);
  return <StudentDetailsClientPage student={student} />;
}
