'use client';

import { ProgramsPage } from '@/components/programs/ProgramsPage';

export default function ProgramsHubPage() {
  return (
    <ProgramsPage
      defaultType="ASSEMBLY"
      title={['Programs Calendar', 'የፕሮግራሞች መርሐ ግብር']}
      subtitle={['Assemblies, conferences, holy days and events — planned, held and reported', 'ስብሰባዎች፣ ጉባኤዎች፣ በዓላትና ዝግጅቶች — የታቀዱ፣ የተካሄዱና ሪፖርት የተደረጉ']}
    />
  );
}
