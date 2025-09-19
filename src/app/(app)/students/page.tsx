
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/hooks/use-translation';
import type { Student } from '@/types';
import {
  PlusCircle,
  ArrowRightLeft,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import React, { useState, useMemo, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { TranslationKey } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { studentsData, deleteStudent as deleteStudentFromDb, classesData } from '@/lib/mock-data';

export default function StudentsPage() {
  const { t } = useTranslation();
  const [allStudents, setAllStudents] = useState<Student[]>(studentsData);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [targetClass, setTargetClass] = useState('');
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredStudents = useMemo(() => {
    return allStudents.filter((student) => {
      const lowercasedQuery = searchQuery.toLowerCase();
      const matchesSearch =
        lowercasedQuery === '' ||
        student.name.toLowerCase().includes(lowercasedQuery) ||
        student.studentId.toLowerCase().includes(lowercasedQuery);
      const matchesGrade = gradeFilter === 'all' || student.grade === gradeFilter;
      return matchesSearch && matchesGrade;
    });
  }, [searchQuery, gradeFilter, allStudents]);

  const handleAction = (action: 'view' | 'edit', studentId: number) => {
    if (action === 'edit') {
        router.push(`/students/${studentId}/edit`);
    } else {
        router.push(`/students/${studentId}`);
    }
  };

  const openDeleteDialog = (student: Student) => {
    setStudentToDelete(student);
  };

  const confirmDelete = () => {
    if (studentToDelete) {
      deleteStudentFromDb(studentToDelete.id);
      // Refresh the local state to update the UI
      setAllStudents([...studentsData]);
      setStudentToDelete(null);
      toast({
        title: "Student Deleted",
        description: `${studentToDelete.name} has been removed.`,
      });
    }
  };

  const handleSelectStudent = (studentId: number, isSelected: boolean) => {
    if (isSelected) {
      setSelectedStudents((prev) => [...prev, studentId]);
    } else {
      setSelectedStudents((prev) => prev.filter((id) => id !== studentId));
    }
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedStudents(filteredStudents.map((s) => s.id));
    } else {
      setSelectedStudents([]);
    }
  };

  const handleConfirmTransfer = () => {
    if (!targetClass) return;
    
    setAllStudents(prevStudents => 
      prevStudents.map(student => 
        selectedStudents.includes(student.id)
          ? { ...student, grade: targetClass }
          : student
      )
    );
    
    // In a real app, you would also post this change to your backend.
    
    setIsTransferDialogOpen(false);
    setSelectedStudents([]);
    setTargetClass('');
    // Optionally, show a success toast.
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<any>(worksheet);
        
        const newStudents: Student[] = json.map((row, index) => {
          const newId = Date.now() + index;
          return {
            id: newId,
            studentId: row.studentId || `H${String(newId).slice(-3)}`,
            name: row.name,
            age: parseInt(row.age, 10),
            grade: row.grade,
            status: 'Active',
            parentPhone: row.parentPhone?.toString(),
            gender: row.gender,
            dateOfBirth: row.dateOfBirth,
            placeOfBirth: row.placeOfBirth,
            address: row.address,
            guardianName: row.guardianName,
            guardianRelationship: row.guardianRelationship,
            registrationDate: new Date().toISOString().split('T')[0],
          };
        }).filter(student => student.name && student.age && student.grade); // Basic validation

        setAllStudents(prev => [...prev, ...newStudents]);
        
        toast({
          title: "Import Successful",
          description: `${newStudents.length} students were successfully imported.`,
        });

      } catch (error) {
        console.error("Error parsing Excel file:", error);
        toast({
          title: "Import Failed",
          description: "There was an error processing your file. Please check the file format and try again.",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = ''; // Reset file input
  };

  const isAllSelected = selectedStudents.length > 0 && selectedStudents.length === filteredStudents.length;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('studentManagement')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('allStudents')}</CardTitle>
                <CardDescription>
                  {t('viewAndManageStudents')}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder={t('searchStudentsPlaceholder')}
                    className="pl-8 sm:w-[200px] md:w-[300px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                 <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder={t('grade')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all')} {t('classes')}</SelectItem>
                    {classesData.map(cls => (
                      <SelectItem key={cls.id} value={cls.id}>{t(cls.name)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedStudents.length > 0 && (
                  <Button size="sm" onClick={() => setIsTransferDialogOpen(true)}>
                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                    {t('transferNStudents', { count: selectedStudents.length })}
                  </Button>
                )}
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileImport}
                  accept=".xlsx, .xls"
                />
                <Button size="sm" variant="outline" onClick={handleImportClick}>
                  <Upload className="mr-2 h-4 w-4" />
                  {t('import')}
                </Button>
                <Button size="sm" asChild>
                  <Link href="/students/register">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('registerStudent')}
                  </Link>
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]">
                    <Checkbox 
                      checked={isAllSelected}
                      onCheckedChange={(checked) => handleSelectAll(Boolean(checked))}
                    />
                  </TableHead>
                  <TableHead>{t('studentId')}</TableHead>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('grade')}</TableHead>
                  <TableHead>{t('guardianPhone1')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow key={student.id} data-state={selectedStudents.includes(student.id) ? 'selected' : ''}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedStudents.includes(student.id)}
                        onCheckedChange={(checked) => handleSelectStudent(student.id, Boolean(checked))}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {student.studentId}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage
                            src={student.photoUrl || `https://picsum.photos/seed/${student.id}/40`}
                          />
                          <AvatarFallback>
                            {student.name.charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{student.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{t(student.grade as TranslationKey)}</Badge>
                    </TableCell>
                    <TableCell>{student.parentPhone}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleAction('view', student.id)}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            {t('view')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleAction('edit', student.id)}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {t('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => openDeleteDialog(student)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={!!studentToDelete} onOpenChange={() => setStudentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteStudentWarning')} {studentToDelete?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setStudentToDelete(null)}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('transferStudents')}</DialogTitle>
            <DialogDescription>
              {t('transferStudentsDescription', { count: selectedStudents.length })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="target-class">{t('toClass')}</Label>
            <Select onValueChange={setTargetClass}>
              <SelectTrigger id="target-class">
                <SelectValue placeholder={t('selectGrade')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="qedamay">{t('qedamay')}</SelectItem>
                <SelectItem value="kalay">{t('kalay')}</SelectItem>
                <SelectItem value="salsay">{t('salsay')}</SelectItem>
                <SelectItem value="rabay">{t('rabay')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTransferDialogOpen(false)}>{t('cancel')}</Button>
            <Button onClick={handleConfirmTransfer}>{t('confirmTransfer')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
