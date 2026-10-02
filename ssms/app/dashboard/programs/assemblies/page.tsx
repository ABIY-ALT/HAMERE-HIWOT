'use client';

import { ProgramsPage } from '@/components/programs/ProgramsPage';
import { ASSEMBLY_TYPES } from '@/lib/programs/types';

export default function AssembliesPage() {
  return (
    <ProgramsPage
      types={ASSEMBLY_TYPES}
      defaultType="ASSEMBLY"
      title={['Assemblies & Conferences', 'ስብሰባዎችና ጉባኤዎች']}
      subtitle={['General assemblies, meetings and spiritual conferences', 'ጠቅላላ ጉባኤዎች፣ ስብሰባዎችና መንፈሳዊ ጉባኤዎች']}
    />
  );
}
