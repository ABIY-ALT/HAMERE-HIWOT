
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, Download } from 'lucide-react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import React, { useState, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { formatToEthiopianDate } from '@/lib/date-utils';
import type { AttendanceStatus, Student, AttendanceLog } from '@/types';
import type { TranslationKey } from '@/lib/i18n';
import { addAttendanceLog, attendanceHistory } from '@/lib/mock-data';

type ClassDetails = {
    name: string;
    students: Student[];
};

export default function AttendanceClientPage({ classId, classDetails }: { classId: string, classDetails: ClassDetails }) {
  const { t, language } = useTranslation();
  const today = new Date();
  const [attendance, setAttendance] = useState<Record<number, AttendanceStatus>>({});
  const { toast } = useToast();
  // Keep track of submission to re-evaluate last submitted record
  const [lastSubmittedDate, setLastSubmittedDate] = useState<string | null>(null);

  const formattedToday = useMemo(() => formatToEthiopianDate(today, language), [today, language]);
  const students = classDetails.students;

  const lastSubmittedRecord = useMemo(() => {
    if (attendanceHistory.length === 0) return null;
    // This is a simple way to trigger re-calculation when data changes.
    // In a real app with a proper state manager, this would be handled more elegantly.
    void lastSubmittedDate; 
    
    return [...attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [lastSubmittedDate]);

  const handleAttendanceChange = (studentId: number, value: AttendanceStatus) => {
    setAttendance((prev) => ({ ...prev, [studentId]: value }));
  };
  
  const handleSubmitAttendance = () => {
    if (Object.keys(attendance).length === 0) {
      toast({
        title: "No Attendance Marked",
        description: "Please mark attendance for at least one student.",
        variant: "destructive",
      });
      return;
    }

    const todayISO = today.toISOString().split('T')[0];
    const newLog: AttendanceLog = {
      date: todayISO,
      records: students
        .map(student => ({
            studentId: student.id,
            studentName: student.name,
            status: attendance[student.id] || 'absent'
        }))
    };
    
    addAttendanceLog(newLog);
    setLastSubmittedDate(todayISO);
    
    toast({
      title: "Attendance Submitted",
      description: "Today's attendance has been successfully recorded.",
    });

    setAttendance({}); // Clear the form
  };

  const handleExport = () => {
    if (!lastSubmittedRecord) {
      toast({
        title: "No Data to Export",
        description: "Please submit attendance at least once before exporting.",
        variant: "destructive",
      });
      return;
    }

    const dataToExport = lastSubmittedRecord.records.map(record => ({
      [t('studentId')]: record.studentId,
      [t('studentName')]: record.studentName,
      [t('status')]: t(record.status as 'present' | 'absent'),
    }));
    
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    const className = t(classDetails.name as TranslationKey);
    const dateStr = lastSubmittedRecord.date;
    XLSX.utils.book_append_sheet(wb, ws, `Attendance ${dateStr}`);
    XLSX.writeFile(wb, `attendance-${classId}-${dateStr}.xlsx`);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={`${t('attendanceFor')} ${t(classDetails.name as TranslationKey)}`} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href={`/classes/${classId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToClass')}
            </Link>
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExport} disabled={!lastSubmittedRecord}>
              <Download className="mr-2 h-4 w-4" />
              {t('export')}
            </Button>
            <Button onClick={handleSubmitAttendance}>
              {t('submitAttendance')}
            </Button>
          </div>
        </div>
        <Card>
            <CardHeader>
              <CardTitle>{t('attendance')}</CardTitle>
              <CardDescription>{t('date')}: {formattedToday}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('studentName')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">{student.name}</TableCell>
                        <TableCell>
                          <RadioGroup
                            onValueChange={(value) => handleAttendanceChange(student.id, value as AttendanceStatus)}
                            className="flex gap-4"
                            value={attendance[student.id]}
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="present" id={`present-${student.id}`} />
                              <Label htmlFor={`present-${student.id}`}>{t('present')}</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="absent" id={`absent-${student.id}`} />
                              <Label htmlFor={`absent-${student.id}`}>{t('absent')}</Label>
                            </div>
                          </RadioGroup>
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
      </main>
    </div>
  );
}
