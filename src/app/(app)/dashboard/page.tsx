
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
import {
  BookCopy,
  Users,
  Percent,
  UserCheck as UserCheckIcon,
  Info,
  UserPlus,
} from 'lucide-react';
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import type { TranslationKey } from '@/lib/i18n';
import React from 'react';
import { studentsData } from '@/lib/mock-data';
import { useAuth } from '@/contexts/auth-context';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Link from 'next/link';

const totalMembers = studentsData.length;
const activeMembers = studentsData.filter(s => s.status === 'Active').length;
const transferredMembers = totalMembers - activeMembers;


const summaryCards = [
  {
    titleKey: 'totalMembers',
    value: totalMembers.toString(),
    icon: Users,
    href: '/members',
  },
  {
    titleKey: 'activeMembers',
    value: activeMembers.toString(),
    icon: UserCheckIcon,
    href: '/members',
  },
  {
    titleKey: 'totalClasses',
    value: '4',
    icon: BookCopy,
    href: '/classes',
  },
  {
    titleKey: 'attendanceRate',
    value: '92%',
    icon: Percent,
    href: '/classes',
  },
] as const;

const staticChartData: { level: TranslationKey; students: number }[] = [
    { level: 'qedamay', students: studentsData.filter(s => s.grade === 'qedamay').length },
    { level: 'kalay', students: studentsData.filter(s => s.grade === 'kalay').length },
    { level: 'salsay', students: studentsData.filter(s => s.grade === 'salsay').length },
    { level: 'rabay', students: studentsData.filter(s => s.grade === 'rabay').length },
];


export default function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const studentDistData = React.useMemo(() => {
    return staticChartData.map(item => ({
        ...item,
        level: t(item.level),
    }));
  }, [t]);

  const studentDistConfig = {
      students: {
        label: t('students'),
        color: 'hsl(var(--chart-2))',
      },
  } satisfies ChartConfig;

  const memberStatusData = React.useMemo(() => [
      { status: t('active'), count: activeMembers, fill: 'var(--color-active)' },
      { status: t('transferred'), count: transferredMembers, fill: 'var(--color-transferred)' },
  ], [t, activeMembers, transferredMembers]);

  const memberStatusConfig = {
      count: {
        label: t('members'),
      },
      active: {
        label: t('active'),
        color: 'hsl(var(--chart-2))',
      },
      transferred: {
        label: t('transferred'),
        color: 'hsl(var(--chart-5))',
      },
  } satisfies ChartConfig;


  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('dashboard')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {t('welcomeMessage', { name: user?.name || 'User' })}
            </CardTitle>
          </CardHeader>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 md:gap-8 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <Link href={card.href} key={card.titleKey}>
              <Card className="hover:bg-accent transition-colors">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {t(card.titleKey)}
                  </CardTitle>
                  <card.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:gap-8">
           <Card>
            <CardHeader>
              <CardTitle>{t('studentDistributionByClass')}</CardTitle>
              <CardDescription>{t('studentDistributionByClassDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
                <ChartContainer config={studentDistConfig} className="min-h-[200px] w-full">
                    <BarChart accessibilityLayer data={studentDistData}>
                        <XAxis
                        dataKey="level"
                        tickLine={false}
                        tickMargin={10}
                        axisLine={false}
                        />
                        <YAxis />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="students" fill="var(--color-students)" radius={4} />
                    </BarChart>
                </ChartContainer>
            </CardContent>
          </Card>
           <Card>
            <CardHeader>
                <div className="flex items-center gap-2">
                    <CardTitle>{t('memberStatusOverview')}</CardTitle>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>{t('memberStatusTooltip')}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
              <CardDescription>{t('memberStatusOverviewDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={memberStatusConfig} className="mx-auto aspect-square max-h-[250px]">
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel />}
                  />
                  <Pie
                    data={memberStatusData}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={60}
                  />
                </PieChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
