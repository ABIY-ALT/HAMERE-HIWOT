
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
import { ArrowLeft, Calendar as CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { addStudent } from '@/lib/mock-data';
import type { Student } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { formatToEthiopianDate } from '@/lib/date-utils';
import * as React from 'react';

const educationLevels = ["Below 10th", "10th Grade Complete", "12th Grade Complete", "Diploma", "First Degree", "Masters Degree", "PhD", "Other"] as const;

const registrationFormSchema = z.object({
  // Personal Info
  memberName: z.string().min(1),
  fatherName: z.string().min(1),
  grandfatherName: z.string().min(1),
  gender: z.enum(['male', 'female']),
  dateOfBirth: z.date(),
  placeOfBirth: z.string().min(1),
  bloodType: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  
  // Professional Info
  fieldOfProfession: z.string().optional(),
  educationLevel: z.enum(educationLevels).optional(),
  
  // Contact Info (keeping some from old form)
  phone: z.string().regex(/^\+2519\d{8}$/, { message: 'Phone must start with +2519 and be 12 digits.' }),
  address: z.string().optional(),
});

type RegistrationFormValues = z.infer<typeof registrationFormSchema>;


export default function RegisterMemberPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    mode: 'onChange',
  });


  const onSubmit = (data: RegistrationFormValues) => {
    const newId = Date.now();
    const newStudent: Student = {
        id: newId,
        studentId: `H${String(newId).slice(-4)}`,
        name: `${data.memberName} ${data.fatherName} ${data.grandfatherName}`,
        age: new Date().getFullYear() - data.dateOfBirth.getFullYear(), 
        grade: 'Not Assigned', // Grade is not in the new form
        status: 'Active',
        parentPhone: data.phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth.toISOString(),
        registrationDate: new Date().toISOString(),
        placeOfBirth: data.placeOfBirth,
        address: data.address,
        guardianName: data.fatherName, // Assuming father is guardian for now
    };
    
    addStudent(newStudent);
    
    toast({
      title: t('studentRegistered'),
      description: t('studentRegisteredSuccessMessage'),
    });
    router.push('/members');
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('registerStudent')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mb-4">
          <Button variant="outline" asChild>
            <Link href="/members">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Members
            </Link>
          </Button>
        </div>
        <Card className="max-w-4xl mx-auto w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>{t('churchMembership')}</CardTitle>
                <CardDescription>
                  {t('fillRegistrationForm')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                 <Tabs defaultValue="personal" className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="personal">{t('personalInformation')}</TabsTrigger>
                        <TabsTrigger value="professional">{t('professionalInformation')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="personal" className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <FormField control={form.control} name="memberName" render={({ field }) => (
                              <FormItem><FormLabel>{t('memberName')}</FormLabel><FormControl><Input placeholder={t('memberName')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="fatherName" render={({ field }) => (
                              <FormItem><FormLabel>{t('fatherName')}</FormLabel><FormControl><Input placeholder={t('fatherName')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="grandfatherName" render={({ field }) => (
                              <FormItem><FormLabel>{t('grandfatherName')}</FormLabel><FormControl><Input placeholder={t('grandfatherName')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="gender" render={({ field }) => (
                              <FormItem><FormLabel>{t('gender')}</FormLabel><Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder={t('selectGender')} /></SelectTrigger></FormControl><SelectContent><SelectItem value="male">{t('male')}</SelectItem><SelectItem value="female">{t('female')}</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                                <FormItem className="flex flex-col"><FormLabel>{t('dateOfBirth')}</FormLabel><Popover><PopoverTrigger asChild><FormControl><Button variant={'outline'} className={cn('w-full pl-3 text-left font-normal',!field.value && 'text-muted-foreground' )}>{field.value ? (formatToEthiopianDate(field.value, language)) : (<span>{t('pickADate')}</span>)}<CalendarIcon className="ml-auto h-4 w-4 opacity-50" /></Button></FormControl></PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="placeOfBirth" render={({ field }) => (
                              <FormItem><FormLabel>{t('placeOfBirth')}</FormLabel><FormControl><Input placeholder={t('placeOfBirth')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="bloodType" render={({ field }) => (
                              <FormItem><FormLabel>{t('bloodType')}</FormLabel><Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder={t('selectBloodType')} /></SelectTrigger></FormControl><SelectContent><SelectItem value="A+">A+</SelectItem><SelectItem value="A-">A-</SelectItem><SelectItem value="B+">B+</SelectItem><SelectItem value="B-">B-</SelectItem><SelectItem value="AB+">AB+</SelectItem><SelectItem value="AB-">AB-</SelectItem><SelectItem value="O+">O+</SelectItem><SelectItem value="O-">O-</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="maritalStatus" render={({ field }) => (
                              <FormItem><FormLabel>{t('maritalStatus')}</FormLabel><Select onValueChange={field.onChange}><FormControl><SelectTrigger><SelectValue placeholder={t('selectMaritalStatus')} /></SelectTrigger></FormControl><SelectContent><SelectItem value="single">{t('single')}</SelectItem><SelectItem value="married">{t('married')}</SelectItem><SelectItem value="divorced">{t('divorced')}</SelectItem><SelectItem value="widowed">{t('widowed')}</SelectItem></SelectContent></Select><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="phone" render={({ field }) => (
                                <FormItem><FormLabel>{t('phoneNumber')}</FormLabel><FormControl><Input placeholder="+2519..." type="tel" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="address" render={({ field }) => (
                                <FormItem className="md:col-span-2"><FormLabel>{t('address')}</FormLabel><FormControl><Input placeholder={t('address')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                    </TabsContent>
                    <TabsContent value="professional" className="pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <FormField control={form.control} name="fieldOfProfession" render={({ field }) => (
                              <FormItem><FormLabel>{t('fieldOfProfession')}</FormLabel><FormControl><Input placeholder={t('fieldOfProfession')} {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                             <FormField control={form.control} name="educationLevel" render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('educationLevel')}</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder={t('educationLevel')} />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {educationLevels.map((level) => (
                                            <SelectItem key={level} value={level}>
                                                {t(level.toLowerCase().replace(/\s|\+/g, '') as any)}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )} />
                        </div>
                    </TabsContent>
                 </Tabs>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="ml-auto">Register Member</Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    </div>
  );
}
