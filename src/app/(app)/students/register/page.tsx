
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, UploadCloud } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { addStudent } from '@/lib/mock-data';
import type { Student } from '@/types';

const ethiopianMonths = [
  "meskerem", "tikimt", "hidar", "tahisas", "tir", "yekatit",
  "megabit", "miyazya", "ginbot", "sene", "hamle", "nehase", "pagume"
] as const;

const registrationFormSchema = z.object({
  firstName: z.string().min(1, { message: 'First name is required' }),
  middleName: z.string().min(1, { message: 'Middle name is required' }),
  lastName: z.string().min(1, { message: 'Last name is required' }),
  gender: z.enum(['male', 'female'], { required_error: 'Please select a gender' }),
  placeOfBirth: z.string().optional(),
  currentGrade: z.enum(['qedamay', 'kalay', 'salsay', 'rabay'], { required_error: 'Please select a grade' }),
  dobDay: z.coerce.number().min(1).max(30),
  dobMonth: z.enum(ethiopianMonths),
  dobYear: z.coerce.number().min(1900).max(new Date().getFullYear()),
  regDay: z.coerce.number().min(1).max(30),
  regMonth: z.enum(ethiopianMonths),
  regYear: z.coerce.number().min(1900).max(new Date().getFullYear()),
  address: z.string().optional(),
  guardianName: z.string().min(1, { message: "Guardian's name is required" }),
  guardianRelationship: z.enum(['spouse', 'father', 'mother', 'sister', 'brother'], { required_error: 'Please select a relationship' }),
  guardianPhone1: z.string().regex(/^\+2519\d{8}$/, { message: 'Phone must start with +2519 and be 12 digits.' }),
  guardianPhone2: z.string().regex(/^\+2519\d{8}$/, { message: 'Phone must start with +2519 and be 12 digits.' }).optional().or(z.literal('')),
  photoUrl: z.string().optional(),
});

type RegistrationFormValues = z.infer<typeof registrationFormSchema>;


export default function RegisterStudentPage() {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      gender: undefined,
      placeOfBirth: '',
      currentGrade: undefined,
      dobDay: undefined,
      dobMonth: undefined,
      dobYear: undefined,
      regDay: undefined,
      regMonth: undefined,
      regYear: undefined,
      address: '',
      guardianName: '',
      guardianRelationship: undefined,
      guardianPhone1: '',
      guardianPhone2: '',
      photoUrl: '',
    }
  });


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        setPreview(result);
        form.setValue('photoUrl', result);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = (data: RegistrationFormValues) => {
    const newId = Date.now();
    const newStudent: Student = {
        id: newId,
        studentId: `H${String(newId).slice(-4)}`,
        name: `${data.firstName} ${data.middleName} ${data.lastName}`,
        age: 0, // Age calculation would be complex with Ethiopian calendar, setting to 0
        grade: data.currentGrade,
        status: 'Active',
        parentPhone: data.guardianPhone1,
        gender: data.gender,
        // In a real app, you would convert the Ethiopian date parts to a standard format
        dateOfBirth: `${data.dobYear}-${data.dobMonth}-${data.dobDay}`,
        registrationDate: `${data.regYear}-${data.regMonth}-${data.regDay}`,
        placeOfBirth: data.placeOfBirth,
        address: data.address,
        guardianName: data.guardianName,
        guardianRelationship: data.guardianRelationship,
        guardianPhone2: data.guardianPhone2,
        photoUrl: data.photoUrl,
    };
    
    addStudent(newStudent);
    
    toast({
      title: t('studentRegistered'),
      description: t('studentRegisteredSuccessMessage'),
    });
    router.push('/students');
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('registerStudent')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mb-4">
          <Button variant="outline" asChild>
            <Link href="/students">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToStudents')}
            </Link>
          </Button>
        </div>
        <Card className="max-w-4xl mx-auto w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>{t('studentInfo')}</CardTitle>
                <CardDescription>
                  {t('fillRegistrationForm')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField control={form.control} name="firstName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('firstName')}</FormLabel>
                        <FormControl><Input placeholder={t('firstName')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="middleName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('middleName')}</FormLabel>
                        <FormControl><Input placeholder={t('middleName')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="lastName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('lastName')}</FormLabel>
                        <FormControl><Input placeholder={t('lastName')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="gender" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('gender')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder={t('selectGender')} /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="male">{t('male')}</SelectItem>
                            <SelectItem value="female">{t('female')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="placeOfBirth" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('placeOfBirth')}</FormLabel>
                        <FormControl><Input placeholder={t('placeOfBirth')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="currentGrade" render={({ field }) => (
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
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormItem>
                      <FormLabel>{t('dateOfBirth')}</FormLabel>
                      <div className="flex gap-2">
                         <FormField control={form.control} name="dobDay" render={({ field }) => (
                          <FormItem className="flex-1"><FormControl><Input type="number" placeholder={t('day')} {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="dobMonth" render={({ field }) => (
                          <FormItem className="flex-1">
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder={t('month')} /></SelectTrigger></FormControl>
                              <SelectContent>{ethiopianMonths.map(m => <SelectItem key={m} value={m}>{t(m)}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="dobYear" render={({ field }) => (
                          <FormItem className="flex-1"><FormControl><Input type="number" placeholder={t('year')} {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </FormItem>
                     <FormItem>
                      <FormLabel>{t('registrationDate')}</FormLabel>
                      <div className="flex gap-2">
                        <FormField control={form.control} name="regDay" render={({ field }) => (
                           <FormItem className="flex-1"><FormControl><Input type="number" placeholder={t('day')} {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                         <FormField control={form.control} name="regMonth" render={({ field }) => (
                          <FormItem className="flex-1">
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl><SelectTrigger><SelectValue placeholder={t('month')} /></SelectTrigger></FormControl>
                              <SelectContent>{ethiopianMonths.map(m => <SelectItem key={m} value={m}>{t(m)}</SelectItem>)}</SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )} />
                        <FormField control={form.control} name="regYear" render={({ field }) => (
                          <FormItem className="flex-1"><FormControl><Input type="number" placeholder={t('year')} {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                      </div>
                    </FormItem>
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
                           <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl><SelectTrigger id="guardianRelationship"><SelectValue placeholder={t('selectRelationship')} /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="spouse">{t('spouse')}</SelectItem>
                                <SelectItem value="father">{t('father')}</SelectItem>
                                <SelectItem value="mother">{t('mother')}</SelectItem>
                                <SelectItem value="sister">{t('sister')}</SelectItem>
                                <SelectItem value="brother">{t('brother')}</SelectItem>
                            </SelectContent>
                           </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="guardianPhone1" render={({ field }) => (
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

                  <Separator />

                  <div className="space-y-2">
                    <Label htmlFor="photo">{t('photo')}</Label>
                    <div className="flex flex-col items-center gap-4">
                      <div className="w-48 h-48 rounded-md border-2 border-dashed border-muted-foreground/50 flex items-center justify-center bg-muted/20">
                        {preview ? (
                          <Image src={preview} alt="Student photo preview" width={192} height={192} className="object-cover rounded-md" />
                        ) : (
                          <div className="text-center text-muted-foreground">
                            <UploadCloud className="mx-auto h-12 w-12" />
                            <p>{t('uploadAPhoto')}</p>
                          </div>
                        )}
                      </div>
                      <Button asChild variant="outline">
                        <label htmlFor="photo-upload">
                          <UploadCloud className="mr-2 h-4 w-4" />
                          {t('uploadImage')}
                          <input id="photo-upload" type="file" className="sr-only" accept="image/*" onChange={handleFileChange} />
                        </label>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="ml-auto">{t('registerStudent')}</Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    </div>
  );
}
