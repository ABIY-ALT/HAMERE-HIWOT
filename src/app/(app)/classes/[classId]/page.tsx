
import type { Student } from '@/types';
import ClassDetailsClientPage from './client-page';
import { studentsData } from '@/lib/mock-data';
import type { TranslationKey } from '@/lib/i18n';

const classDetails: Record<string, { name: TranslationKey; teacher: string; students: Student[] }> = {
  'qedamay': {
    name: 'qedamay',
    teacher: 'Ato Solomon',
    students: studentsData.filter(s => s.grade === 'qedamay'),
  },
  'kalay': {
    name: "kalay",
    teacher: 'W/ro Aster',
    students: studentsData.filter(s => s.grade === 'kalay'),
  },
   'salsay': { 
    name: 'salsay', 
    teacher: 'Ato Tesfaye', 
    students: studentsData.filter(s => s.grade === 'salsay'),
   },
   'rabay': { 
    name: "rabay", 
    teacher: 'W/ro Abeba', 
    students: studentsData.filter(s => s.grade === 'rabay'),
   },
};

type ClassId = keyof typeof classDetails;

export default function ClassDetailsPage({
  params,
}: {
  params: { classId: string };
}) {
  const classId = params.classId as ClassId;
  const details = classDetails[classId] || { name: 'qedamay' as TranslationKey, teacher: 'N/A', students: [] };

  return <ClassDetailsClientPage classId={classId} details={details} />;
}
