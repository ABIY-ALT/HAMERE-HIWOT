'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, Download, UserCheck, UserX } from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import * as XLSX from 'xlsx';
import { formatToEthiopianDate } from '@/lib/date-utils';
import type { AttendanceLog } from '@/types';
import { attendanceHistory } from '@/lib/mock-data';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { TranslationKey } from '@/lib/i18n';
import React from 'react';

export default function AttendanceHistoryClientPage({ classId, className }: { classId: string, className: TranslationKey }) {
  const { t, language } = useTranslation();
  
  const sortedHistory = React.useMemo(() => 
    [...attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [attendanceHistory]
  );

  const getSummary = (log: AttendanceLog) => {
    const present = log.records.filter(r => r.status === 'present').length;
    const absent = log.records.length - present;
    return { present, absent };
  }

  const handleExport = (log: AttendanceLog) => {
    const dataToExport = log.records.map(record => ({
      studentId: record.studentId,
      studentName: record.studentName,
      status: record.status,
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance ${log.date}`);
    XLSX.writeFile(wb, `attendance-${classId}-${log.date}.xlsx`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={`${t('attendanceHistory')} - ${t(className)}`} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href={`/classes/${classId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToClass')}
            </Link>
          </Button>
        </div>

        <Card>
            <CardHeader>
              <CardTitle>{t('attendanceHistory')}</CardTitle>
              <CardDescription>Review and export past attendance records for this class.</CardDescription>
            </CardHeader>
            <CardContent>
                <Accordion type="single" collapsible className="w-full">
                    {sortedHistory.map((log) => {
                        const summary = getSummary(log);
                        return (
                             <AccordionItem value={log.date} key={log.date}>
                                <AccordionTrigger>
                                    <div className="flex justify-between items-center w-full pr-4">
                                        <p className="font-semibold text-lg">{formatToEthiopianDate(log.date, language)}</p>
                                        <div className="flex items-center gap-6 text-sm">
                                            <div className="flex items-center gap-2 text-green-600">
                                                <UserCheck className="h-4 w-4" />
                                                <span>{t('present')}: {summary.present}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-red-600">
                                                <UserX className="h-4 w-4" />
                                                <span>{t('absent')}: {summary.absent}</span>
                                            </div>
                                        </div>
                                    </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                    <div className="px-4 pb-4">
                                        <div className="flex justify-end mb-4">
                                            <Button variant="outline" size="sm" onClick={() => handleExport(log)}>
                                                <Download className="mr-2 h-4 w-4" />
                                                {t('export')}
                                            </Button>
                                        </div>
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>{t('studentName')}</TableHead>
                                                    <TableHead>{t('status')}</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {log.records.map(record => (
                                                    <TableRow key={record.studentId}>
                                                        <TableCell>{record.studentName}</TableCell>
                                                        <TableCell>
                                                             <span className={`font-semibold ${record.status === 'present' ? 'text-green-600' : 'text-red-600'}`}>
                                                                {t(record.status)}
                                                            </span>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </AccordionContent>
                            </AccordionItem>
                        )
                    })}
                </Accordion>
            </CardContent>
          </Card>
        
      </main>
    </div>
  );
}
