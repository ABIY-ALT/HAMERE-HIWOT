'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { FileText, UserCheck, ArrowLeft, History, Download } from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Student } from '@/types';
import type { TranslationKey } from '@/lib/i18n';
import * as XLSX from 'xlsx';

type ClassDetails = {
    name: TranslationKey;
    teacher: string;
    students: Student[];
};

export default function ClassDetailsClientPage({ classId, details }: { classId: string, details: ClassDetails }) {
  const { t } = useTranslation();
  
  const handleExport = () => {
    const dataToExport = details.students.map(student => ({
      [t('studentId')]: student.studentId,
      [t('studentName')]: student.name,
      [t('age')]: student.age,
      [t('status')]: t(student.status.toLowerCase() as 'active' | 'transferred'),
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    const className = t(details.name);
    XLSX.utils.book_append_sheet(wb, ws, className);
    XLSX.writeFile(wb, `${className}-students.xlsx`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t(details.name)} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
             <Button variant="outline" asChild>
                <Link href="/classes">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('backToClasses')}
                </Link>
            </Button>
            <div className="flex gap-2">
                <Button asChild>
                    <Link href={`/classes/${classId}/attendance`}>
                        <UserCheck className="mr-2 h-4 w-4" />
                        {t('takeAttendance')}
                    </Link>
                </Button>
                 <Button variant="outline" asChild>
                    <Link href={`/classes/${classId}/attendance/history`}>
                        <History className="mr-2 h-4 w-4" />
                        {t('attendanceHistory')}
                    </Link>
                </Button>
                <Button variant="outline" asChild>
                    <Link href={`/classes/${classId}/reports`}>
                        <FileText className="mr-2 h-4 w-4" />
                        {t('classReports')}
                    </Link>
                </Button>
                <Button variant="outline" onClick={handleExport}>
                    <Download className="mr-2 h-4 w-4" />
                    {t('export')}
                </Button>
            </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('students')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('studentId')}</TableHead>
                  <TableHead>{t('studentName')}</TableHead>
                  <TableHead>{t('age')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.students.length > 0 ? details.students.map((student: Student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.studentId}</TableCell>
                    <TableCell>{student.name}</TableCell>
                    <TableCell>{student.age}</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          student.status === 'Active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                         {t(student.status.toLowerCase() as 'active' | 'transferred')}
                      </span>
                    </TableCell>
                  </TableRow>
                )) : (
                    <TableRow>
                        <TableCell colSpan={4} className="text-center">{t('noStudentsInClass')}</TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
