
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
import type { Student as Member } from '@/types';
import {
  PlusCircle,
  Search,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { TranslationKey } from '@/lib/i18n';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { studentsData, deleteStudent as deleteStudentFromDb } from '@/lib/mock-data';
import { classesData } from '@/lib/mock-data';

export default function MembersPage() {
  const { t } = useTranslation();
  const [allMembers, setAllMembers] = useState<Member[]>(studentsData);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [gradeFilter, setGradeFilter] = useState('all');

  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const filteredMembers = useMemo(() => {
    return allMembers.filter((member) => {
      const lowercasedQuery = searchQuery.toLowerCase();
      const matchesSearch =
        lowercasedQuery === '' ||
        member.name.toLowerCase().includes(lowercasedQuery) ||
        (member.studentId && member.studentId.toLowerCase().includes(lowercasedQuery));
      const matchesStatus = statusFilter === 'all' || member.status.toLowerCase() === statusFilter;
      const matchesGrade = gradeFilter === 'all' || member.grade === gradeFilter;
      return matchesSearch && matchesStatus && matchesGrade;
    });
  }, [searchQuery, statusFilter, gradeFilter, allMembers]);

  const handleAction = (action: 'view' | 'edit', memberId: number) => {
    router.push(`/members/${memberId}${action === 'edit' ? '/edit' : ''}`);
  };

  const openDeleteDialog = (member: Member) => {
    setMemberToDelete(member);
  };

  const confirmDelete = () => {
    if (memberToDelete) {
      deleteStudentFromDb(memberToDelete.id);
      setAllMembers([...studentsData]);
      setMemberToDelete(null);
      toast({
        title: "Member Deleted",
        description: `${memberToDelete.name} has been removed.`,
      });
    }
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
        
        const newMembers: Member[] = json.map((row, index) => {
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
        }).filter(member => member.name && member.age && member.grade);

        setAllMembers(prev => [...prev, ...newMembers]);
        
        toast({
          title: "Import Successful",
          description: `${newMembers.length} members were successfully imported.`,
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
    event.target.value = '';
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('members')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>All Members</CardTitle>
                <CardDescription>
                  View and manage all registered members of the Sabbath school.
                </CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Search members..."
                    className="pl-8 w-full"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button size="sm" asChild className="w-full sm:w-auto">
                  <Link href="/members/register">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Register Member
                  </Link>
                </Button>
              </div>
            </div>
             <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-4">
                 <Select value={gradeFilter} onValueChange={setGradeFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Grade" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Grades</SelectItem>
                    {classesData.map(c => <SelectItem key={c.id} value={c.id}>{t(c.name)}</SelectItem>)}
                  </SelectContent>
                </Select>
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex-grow" />
                 <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileImport}
                  accept=".xlsx, .xls"
                />
                <Button size="sm" variant="outline" onClick={handleImportClick} className="w-full sm:w-auto">
                  <Upload className="mr-2 h-4 w-4" />
                  {t('import')}
                </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.studentId}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage
                              src={member.photoUrl || `https://picsum.photos/seed/${member.id}/40`}
                            />
                            <AvatarFallback>
                              {member.name.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{member.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{member.age}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{t(member.grade as TranslationKey)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === 'Active' ? 'default' : 'outline'}>
                          {t(member.status.toLowerCase() as 'active' | 'transferred')}
                        </Badge>
                      </TableCell>
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
                              onClick={() => handleAction('view', member.id)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              {t('view')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleAction('edit', member.id)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              {t('edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => openDeleteDialog(member)}
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
            </div>
          </CardContent>
        </Card>
      </main>

      <AlertDialog open={!!memberToDelete} onOpenChange={() => setMemberToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the member record for {memberToDelete?.name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToDelete(null)}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
