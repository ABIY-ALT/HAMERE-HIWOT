'use client';

import { ProgramsPage } from '@/components/programs/ProgramsPage';
import { EVENT_TYPES } from '@/lib/programs/types';

export default function EventsPage() {
  return (
    <ProgramsPage
      types={EVENT_TYPES}
      defaultType="HOLIDAY"
      title={['Holy Days & Events', 'በዓላትና ዝግጅቶች']}
      subtitle={['Holy day celebrations, services, trainings, outreach and academic events', 'የበዓል አከባበሮች፣ አገልግሎቶች፣ ሥልጠናዎች፣ ስብከተ ወንጌልና የትምህርት ዝግጅቶች']}
    />
  );
}
