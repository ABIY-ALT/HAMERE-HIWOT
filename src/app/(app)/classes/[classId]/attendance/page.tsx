
import AttendanceClientPage from './client-page';
import type { Student } from '@/types';
import { studentsData } from '@/lib/mock-data';

const classDetailsData: Record<string, { name: string; students: Student[] }> = {
  'qedamay': {
    name: 'qedamay',
    students: studentsData.filter(s => s.grade === 'qedamay'),
  },
  'kalay': {
    name: "kalay",
    students: studentsData.filter(s => s.grade === 'kalay'),
  },
   'salsay': { 
    name: 'salsay', 
    students: studentsData.filter(s => s.grade === 'salsay'),
   },
   'rabay': { 
    name: "rabay", 
    students: studentsData.filter(s => s.grade === 'rabay'),
   },
};

export default function AttendancePage({ params }: { params: { classId: string } }) {
  const classId = params.classId as keyof typeof classDetailsData;
  const classDetails = classDetailsData[classId] || { name: 'Unknown Class', students: [] };
  
  return <AttendanceClientPage classId={classId} classDetails={classDetails} />;
}
