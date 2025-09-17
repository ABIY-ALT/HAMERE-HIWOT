
import ClassReportsClientPage from './client-page';
import type { TranslationKey } from '@/lib/i18n';

const classDetailsData: Record<string, { name: TranslationKey }> = {
  'qedamay': { name: 'qedamay' },
  'kalay': { name: 'kalay' },
  'salsay': { name: 'salsay' },
  'rabay': { name: 'rabay' },
};

export default function ClassReportsPage({ params }: { params: { classId: string } }) {
  const classId = params.classId as keyof typeof classDetailsData;
  const className = classDetailsData[classId]?.name || 'Unknown Class';

  return <ClassReportsClientPage classId={classId} className={className} />;
}
