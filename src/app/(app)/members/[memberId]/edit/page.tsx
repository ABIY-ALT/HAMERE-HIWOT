
'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { getStudentById, updateStudent } from '@/lib/mock-data';
import type { Student as Member } from '@/types';
import * as React from 'react';

const editMemberFormSchema = z.object({
  name: z.string().min(1, { message: 'Full name is required' }),
  age: z.coerce.number().min(1, { message: 'Age is required'}),
  gender: z.enum(['Male', 'Female'], { required_error: 'Please select a gender' }),
  grade: z.enum(['qedamay', 'kalay', 'salsay', 'rabay'], { required_error: 'Please select a grade' }),
  status: z.enum(['Active', 'Transferred'], { required_error: 'Please select a status' }),
  address: z.string().optional(),
  guardianName: z.string().min(1, { message: "Guardian's name is required" }),
  guardianRelationship: z.string().min(1, { message: 'Relationship is required' }),
  parentPhone: z.string().regex(/^\+2519\d{8}$/, { message: 'Phone must start with +2519 and be 12 digits.' }),
  guardianPhone2: z.string().regex(/^\+2519\d{8}$/, { message: 'Phone must start with +2519 and be 12 digits.' }).optional().or(z.literal('')),
});

type EditMemberFormValues = z.infer<typeof editMemberFormSchema>;

export default function EditMemberPage({ params }: { params: { memberId: string } }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const [member, setMember] = useState<Member | undefined>(undefined);
  const resolvedParams = React.use(params);

  const form = useForm<EditMemberFormValues>({
    resolver: zodResolver(editMemberFormSchema),
    mode: 'onChange',
    defaultValues: {
      name: '',
      age: 0,
      gender: undefined,
      grade: undefined,
      status: undefined,
      address: '',
      guardianName: '',
      guardianRelationship: '',
      parentPhone: '',
      guardianPhone2: '',
    },
  });

  useEffect(() => {
    const memberId = parseInt(resolvedParams.memberId, 10);
    const fetchedMember = getStudentById(memberId);
    if (fetchedMember) {
      setMember(fetchedMember);
      form.reset({
        name: fetchedMember.name,
        age: fetchedMember.age,
        gender: fetchedMember.gender as 'Male' | 'Female',
        grade: fetchedMember.grade,
        status: fetchedMember.status,
        address: fetchedMember.address,
        guardianName: fetchedMember.guardianName,
        guardianRelationship: fetchedMember.guardianRelationship,
        parentPhone: fetchedMember.parentPhone,
        guardianPhone2: fetchedMember.guardianPhone2,
      });
    } else {
        toast({ title: "Member not found", variant: "destructive" });
        router.push('/members');
    }
  }, [resolvedParams.memberId, form, router, toast]);

  const onSubmit = (data: EditMemberFormValues) => {
    if (!member) return;

    const updatedMemberData: Member = {
        ...member,
        ...data,
    };
    
    updateStudent(member.id, updatedMemberData);
    
    toast({
      title: "Member Updated",
      description: "The member's information has been successfully updated.",
    });
    router.push(`/members/${member.id}`);
  };

  if (!member) {
      return (
          <div className="flex min-h-screen w-full flex-col items-center justify-center">
              <p>Loading...</p>
          </div>
      )
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={`${t('edit')} ${member.name}`} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mb-4">
          <Button variant="outline" asChild>
            <Link href={`/members/${member.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Member Details
            </Link>
          </Button>
        </div>
        <Card className="max-w-4xl mx-auto w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>Member Information</CardTitle>
                <CardDescription>
                  Update the member's registration details.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fullName')}</FormLabel>
                        <FormControl><Input placeholder={t('fullName')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                     <FormField control={form.control} name="age" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('age')}</FormLabel>
                        <FormControl><Input type="number" placeholder={t('age')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('gender')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t('selectGender')} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Male">{t('male')}</SelectItem>
                            <SelectItem value="Female">{t('female')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="grade" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('currentGrade')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl><SelectTrigger><SelectValue placeholder={t('selectGrade')} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="qedamay">{t('qedamay')}</SelectItem>
                            <SelectItem value="kalay">{t('kalay')}</SelectItem>
                            <SelectItem value="salsay">{t('salsay')}</SelectItem>
                            <SelectItem value="rabay">{t('rabay')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('status')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl><SelectTrigger><SelectValue placeholder={t('status')} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="Active">{t('active')}</SelectItem>
                            <SelectItem value="Transferred">{t('transferred')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  
                  <Separator />
                  <FormField control={form.control} name="address" render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('address')}</FormLabel>
                      <FormControl><Textarea placeholder={t('address')} {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <Separator />

                  <div>
                    <h3 className="text-lg font-medium">{t('emergencyContact')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      <FormField control={form.control} name="guardianName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('guardianFullName')}</FormLabel>
                          <FormControl><Input placeholder={t('guardianFullName')} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="guardianRelationship" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('guardianRelationship')}</FormLabel>
                           <FormControl><Input placeholder={t('guardianRelationship')} {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="parentPhone" render={({ field }) => (
                        <FormItem>
                           <FormLabel>{t('guardianPhone1')}</FormLabel>
                           <FormControl><Input placeholder="+2519..." type="tel" {...field} /></FormControl>
                           <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="guardianPhone2" render={({ field }) => (
                        <FormItem>
                           <FormLabel>{t('guardianPhone2')}</FormLabel>
                           <FormControl><Input placeholder="+2519..." type="tel" {...field} /></FormControl>
                           <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="ml-auto">Save Changes</Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    </div>
  );
}
