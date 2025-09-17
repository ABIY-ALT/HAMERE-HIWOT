
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/use-translation';
import type { Transaction } from '@/types';
import { PlusCircle, ArrowUpCircle, ArrowDownCircle, Download, TrendingUp, TrendingDown, Scale, Calendar as CalendarIcon } from 'lucide-react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { ChartContainer, ChartConfig, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { formatToEthiopianDate } from '@/lib/date-utils';
import React from 'react';
import { transactionsData } from '@/lib/mock-data';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';

const TransactionTable = ({ data, t, language }: { data: Transaction[], t: (key: any) => string, language: 'en' | 'am' }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{t('date')}</TableHead>
        <TableHead>{t('receiptNumber')}</TableHead>
        <TableHead>{t('description')}</TableHead>
        <TableHead className="text-right">{t('amount')}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {data.map((transaction) => (
        <TableRow key={transaction.id}>
          <TableCell>{formatToEthiopianDate(transaction.date, language)}</TableCell>
          <TableCell>{transaction.receiptNumber}</TableCell>
          <TableCell className="font-medium">{transaction.description}</TableCell>
          <TableCell className="text-right font-mono">ETB {transaction.amount.toFixed(2)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export default function FinancePage() {
  const { t, language } = useTranslation();
  const [date, setDate] = React.useState<DateRange | undefined>(undefined);

  const sortedTransactions = React.useMemo(() => 
    [...transactionsData]
      .filter(t => {
        if (!date?.from) return true;
        const transactionDate = new Date(t.date);
        transactionDate.setHours(0, 0, 0, 0); // Normalize time part
        const fromDate = new Date(date.from);
        fromDate.setHours(0, 0, 0, 0);
        const toDate = date.to ? new Date(date.to) : new Date(date.from);
        toDate.setHours(23, 59, 59, 999);
        
        return transactionDate >= fromDate && transactionDate <= toDate;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactionsData, date]
  );

  const chartData = React.useMemo(() => sortedTransactions.reduce((acc, curr) => {
      const date = curr.date;
      let entry = acc.find(item => item.date === date);
      if (!entry) {
          entry = { date, income: 0, expense: 0 };
          acc.push(entry);
      }
      if (curr.type === 'Income') {
          entry.income += curr.amount;
      } else {
          entry.expense += curr.amount;
      }
      return acc;
  }, [] as { date: string; income: number; expense: number }[]).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [sortedTransactions]);


  const chartConfig = {
    income: {
      label: 'Income',
      color: 'hsl(var(--chart-2))',
    },
    expense: {
      label: 'Expense',
      color: 'hsl(var(--chart-5))',
    },
  } satisfies ChartConfig;

  const incomeData = React.useMemo(() => sortedTransactions.filter(t => t.type === 'Income'), [sortedTransactions]);
  const expenseData = React.useMemo(() => sortedTransactions.filter(t => t.type === 'Expense'), [sortedTransactions]);

  const totalIncome = React.useMemo(() => incomeData.reduce((acc, curr) => acc + curr.amount, 0), [incomeData]);
  const totalExpenses = React.useMemo(() => expenseData.reduce((acc, curr) => acc + curr.amount, 0), [expenseData]);
  const netBalance = totalIncome - totalExpenses;


  const handleExport = () => {
    const headers = ['ID', 'Date', 'Description', 'Amount', 'Type', 'ReceiptNumber'];
    const csvRows = [
      headers.join(','),
      ...sortedTransactions.map(row => 
        [
          row.id,
          `"${row.date}"`,
          `"${row.description.replace(/"/g, '""')}"`,
          row.amount,
          row.type,
          `"${row.receiptNumber || ''}"`
        ].join(',')
      )
    ];
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'transactions.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('financeManagement')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('totalIncome')}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">ETB {totalIncome.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('totalExpenses')}</CardTitle>
              <TrendingDown className="h-4 w-4 text-muted-foreground text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">ETB {totalExpenses.toFixed(2)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('netBalance')}</CardTitle>
              <Scale className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">ETB {netBalance.toFixed(2)}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 md:gap-8">
          <Card>
              <CardHeader>
                <CardTitle>Financial Overview</CardTitle>
                <CardDescription>A visual representation of income vs. expenses.</CardDescription>
              </CardHeader>
              <CardContent>
                  <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
                      <BarChart accessibilityLayer data={chartData}>
                          <CartesianGrid vertical={false} />
                          <XAxis
                              dataKey="date"
                              tickLine={false}
                              tickMargin={10}
                              axisLine={false}
                              tickFormatter={(value) => formatToEthiopianDate(value, language).replace(/, \d{4}$/, '')}
                          />
                          <YAxis />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="income" fill="var(--color-income)" radius={4} />
                          <Bar dataKey="expense" fill="var(--color-expense)" radius={4} />
                      </BarChart>
                  </ChartContainer>
              </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('transactions')}</CardTitle>
              <div className="flex items-center gap-2">
                <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        variant={"outline"}
                        size="sm"
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date?.from ? (
                          date.to ? (
                            <>
                              {format(date.from, "LLL dd, y")} -{" "}
                              {format(date.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(date.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Pick a date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        initialFocus
                        mode="range"
                        defaultMonth={date?.from}
                        selected={date}
                        onSelect={setDate}
                        numberOfMonths={2}
                      />
                    </PopoverContent>
                </Popover>
                <Button size="sm" variant="outline" onClick={handleExport}>
                  <Download className="mr-2 h-4 w-4" />
                  {t('export')}
                </Button>
                <Button size="sm" asChild>
                  <Link href="/finance/add">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('addNewTransaction')}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="all">
                <TabsList>
                  <TabsTrigger value="all">{t('all')}</TabsTrigger>
                  <TabsTrigger value="income">
                    <ArrowUpCircle className="mr-2 h-4 w-4 text-green-600" /> {t('income')}
                  </TabsTrigger>
                  <TabsTrigger value="expenses">
                    <ArrowDownCircle className="mr-2 h-4 w-4 text-red-600" /> {t('expense')}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="all" className="mt-4">
                  <TransactionTable data={sortedTransactions} t={t} language={language} />
                </TabsContent>
                <TabsContent value="income" className="mt-4">
                  <TransactionTable data={incomeData} t={t} language={language} />
                </TabsContent>
                <TabsContent value="expenses" className="mt-4">
                  <TransactionTable data={expenseData} t={t} language={language} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
