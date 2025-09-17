
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
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, Calendar as CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { addTransaction } from '@/lib/mock-data';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import type { Transaction } from '@/types';
import { formatToEthiopianDate } from '@/lib/date-utils';

const transactionFormSchema = z.object({
  date: z.date({ required_error: 'A date is required.' }),
  receiptNumber: z.string().min(1, 'Receipt number is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().positive('Amount must be a positive number'),
  type: z.enum(['Income', 'Expense'], { required_error: 'Please select a transaction type' }),
});

type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export default function AddTransactionPage() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
  });

  const onSubmit = (data: TransactionFormValues) => {
    const newTransaction: Transaction = {
      id: Date.now(),
      date: data.date.toISOString().split('T')[0],
      ...data,
    };
    addTransaction(newTransaction);
    toast({
      title: "Transaction Added",
      description: "The new transaction has been successfully recorded.",
    });
    router.push('/finance');
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('addNewTransaction')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mb-4">
          <Button variant="outline" asChild>
            <Link href="/finance">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToFinance')}
            </Link>
          </Button>
        </div>
        <Card className="max-w-2xl mx-auto w-full">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <CardHeader>
                <CardTitle>{t('transactionDetails')}</CardTitle>
                <CardDescription>
                  {t('addNewTransactionDescription')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                     <FormField
                        control={form.control}
                        name="date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>{t('date')}</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant={'outline'}
                                    className={cn(
                                      'w-full pl-3 text-left font-normal',
                                      !field.value && 'text-muted-foreground'
                                    )}
                                  >
                                    {field.value ? (
                                      formatToEthiopianDate(field.value, language)
                                    ) : (
                                      <span>{t('pickADate')}</span>
                                    )}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    <FormField control={form.control} name="receiptNumber" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('receiptNumber')}</FormLabel>
                        <FormControl><Input placeholder="e.g., 12345" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                   <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('description')}</FormLabel>
                        <FormControl><Textarea placeholder={t('transactionDescriptionPlaceholder')} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="amount" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('amountInETB')}</FormLabel>
                        <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="type" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('type')}</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                           <FormControl>
                            <SelectTrigger>
                                <SelectValue placeholder={t('selectType')} />
                            </SelectTrigger>
                           </FormControl>
                          <SelectContent>
                            <SelectItem value="Income">{t('income')}</SelectItem>
                            <SelectItem value="Expense">{t('expense')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                </div>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="ml-auto">{t('addTransaction')}</Button>
              </CardFooter>
            </form>
          </Form>
        </Card>
      </main>
    </div>
  );
}
