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
import { ChevronRight, Users, BookOpen, Music, Paintbrush, Briefcase, FileSignature, LandPlot, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import React from 'react';
import type { TranslationKey } from '@/lib/i18n';

const departmentsData = [
    { id: 'children', name: 'childrensSection', icon: Users },
    { id: 'choir', name: 'choirSection', icon: Music },
    { id: 'education', name: 'educationSection', icon: BookOpen },
    { id: 'general-services', name: 'generalServicesSection', icon: Briefcase },
    { id: 'property', name: 'propertyManagementSection', icon: LandPlot },
    { id: 'art', name: 'artSection', icon: Paintbrush },
    { id: 'secretariat', name: 'secretariat', icon: FileSignature },
    { id: 'communication', name: 'communicationSection', icon: MessageSquare },
];

export default function DepartmentsPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('departments')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('departments')}</CardTitle>
            <CardDescription>{t('selectDepartment')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {departmentsData.map((dept) => (
              <Link href={`/departments/${dept.id}`} key={dept.id}>
                <Card className="hover:bg-accent hover:text-accent-foreground transition-colors group">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div className="flex items-center gap-4">
                      <dept.icon className="h-6 w-6 text-muted-foreground group-hover:text-accent-foreground" />
                      <div>
                        <CardTitle className="font-headline">{t(dept.name as TranslationKey)}</CardTitle>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-accent-foreground" />
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
