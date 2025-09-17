
'use client';

import { Header } from '@/components/layout/header';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import type { Class } from '@/types';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import type { TranslationKey } from '@/lib/i18n';
import { getCurrentUser } from '@/lib/mock-data';
import React, { useState, useEffect } from 'react';

const allclassesData: Class[] = [
  { id: 'qedamay', name: 'qedamay', teacher: 'Ato Solomon', studentCount: 15 },
  { id: 'kalay', name: "kalay", teacher: 'W/ro Aster', studentCount: 18 },
  { id: 'salsay', name: 'salsay', teacher: 'Ato Tesfaye', studentCount: 12 },
  { id: 'rabay', name: "rabay", teacher: 'W/ro Abeba', studentCount: 20 },
];

export default function ClassesPage() {
  const { t } = useTranslation();
  const [visibleClasses, setVisibleClasses] = useState<Class[] | null>(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    
    if (currentUser?.role === 'Admin') {
      setVisibleClasses(allclassesData);
    } else if (currentUser?.assignedClasses && currentUser.assignedClasses.length > 0) {
      setVisibleClasses(allclassesData.filter(cls => currentUser.assignedClasses?.includes(cls.id)));
    } else {
      setVisibleClasses([]); 
    }
  }, []);

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('classManagement')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('classes')}</CardTitle>
            <CardDescription>{t('selectClass')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleClasses === null ? (
              // Show a loading state or nothing during initial render to prevent mismatch
              <p className="text-muted-foreground col-span-full">Loading classes...</p>
            ) : visibleClasses.length > 0 ? (
              visibleClasses.map((cls) => (
                <Link href={`/classes/${cls.id}`} key={cls.id}>
                  <Card className="hover:bg-accent hover:text-accent-foreground transition-colors group">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="font-headline">{t(cls.name as TranslationKey)}</CardTitle>
                        <CardDescription className="group-hover:text-accent-foreground/80">
                          {t('teacherLabel')}: {cls.teacher}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                          <span className="font-bold text-lg">{cls.studentCount}</span>
                          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
                      </div>
                    </CardHeader>
                  </Card>
                </Link>
              ))
            ) : (
              <p className="text-muted-foreground col-span-full">{t('noClassesAssigned')}</p>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
