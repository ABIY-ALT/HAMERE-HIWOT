
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { FileText, UserCheck, ArrowLeft, History, Download, ArrowRightLeft } from 'lucide-react';
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
import React, { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { classesData, updateStudent as updateStudentInDb, addStudentTransfer, studentsData } from '@/lib/mock-data';

type ClassDetails = {
    name: TranslationKey;
    teacher: string;
    students: Student[];
};

export default function ClassDetailsClientPage({ classId, details: initialDetails }: { classId: string, details: ClassDetails }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [details, setDetails] = useState(initialDetails);
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferToClass, setTransferToClass] = useState('');

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

  const handleSelectStudent = (studentId: number, checked: boolean) => {
    setSelectedStudents(prev => 
      checked ? [...prev, studentId] : prev.filter(id => id !== studentId)
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedStudents(checked ? details.students.map(s => s.id) : []);
  };

  const handleConfirmTransfer = () => {
    if (!transferToClass || selectedStudents.length === 0) return;

    selectedStudents.forEach(studentId => {
        const student = studentsData.find(s => s.id === studentId);
        if (student) {
            updateStudentInDb(studentId, { grade: transferToClass });
            addStudentTransfer({
                id: Date.now() + studentId,
                studentName: student.name,
                fromClass: student.grade,
                toClass: transferToClass,
                date: new Date().toISOString().split('T')[0],
            });
        }
    });
    
    // Visually remove students from current class view
    const updatedStudents = details.students.filter(s => !selectedStudents.includes(s.id));
    setDetails({ ...details, students: updatedStudents });

    toast({
      title: t('transferStudents'),
      description: t('transferNStudents', { count: selectedStudents.length })
    });

    setSelectedStudents([]);
    setIsTransferDialogOpen(false);
    setTransferToClass('');
  };
  
  const isAllSelected = selectedStudents.length > 0 && selectedStudents.length === details.students.length;

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
            <div className="flex items-center gap-2">
                {selectedStudents.length > 0 && (
                   <Button size="sm" onClick={() => setIsTransferDialogOpen(true)}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t('transferNStudents', { count: selectedStudents.length })}
                  </Button>
                )}
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
                  <TableHead className="w-[50px]">
                      <Checkbox 
                          onCheckedChange={handleSelectAll}
                          checked={isAllSelected}
                          aria-label="Select all"
                      />
                  </TableHead>
                  <TableHead>{t('studentId')}</TableHead>
                  <TableHead>{t('studentName')}</TableHead>
                  <TableHead>{t('age')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {details.students.length > 0 ? details.students.map((student: Student) => (
                  <TableRow key={student.id} data-state={selectedStudents.includes(student.id) && "selected"}>
                    <TableCell>
                        <Checkbox 
                            onCheckedChange={(checked) => handleSelectStudent(student.id, !!checked)}
                            checked={selectedStudents.includes(student.id)}
                            aria-label={`Select ${student.name}`}
                        />
                    </TableCell>
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
                        <TableCell colSpan={5} className="text-center">{t('noStudentsInClass')}</TableCell>
                    </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

       <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{t('transferStudents')}</DialogTitle>
                <DialogDescription>
                    {t('transferStudentsDescription', { count: selectedStudents.length })}
                </DialogDescription>
            </DialogHeader>
            <div className="py-4">
                 <Select value={transferToClass} onValueChange={setTransferToClass}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('toClass')} />
                    </SelectTrigger>
                    <SelectContent>
                        {classesData.filter(c => c.id !== classId).map(c => (
                            <SelectItem key={c.id} value={c.id}>{t(c.name)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>{t('cancel')}</Button>
                <Button onClick={handleConfirmTransfer} disabled={!transferToClass}>{t('confirmTransfer')}</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
