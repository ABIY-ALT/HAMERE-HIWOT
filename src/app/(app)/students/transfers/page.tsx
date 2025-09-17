'use client';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/hooks/use-translation';
import type { StudentTransfer } from '@/types';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { TranslationKey } from '@/lib/i18n';
import { formatToEthiopianDate } from '@/lib/date-utils';

const transfersData: StudentTransfer[] = [
    { id: 1, studentName: 'Haile Gebrselassie', fromClass: 'kalay', toClass: 'salsay', date: '2023-09-01' },
    { id: 2, studentName: 'Derartu Tulu', fromClass: 'qedamay', toClass: 'kalay', date: '2023-09-01' },
    { id: 3, studentName: 'Fatuma Roba', fromClass: 'Beginners', toClass: 'qedamay', date: '2023-08-25' },
];

export default function StudentTransfersPage() {
  const { t, language } = useTranslation();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('studentTransfers')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="mb-4">
             <Button variant="outline" asChild>
                <Link href="/students">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('backToStudents')}
                </Link>
            </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('studentTransfers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('studentName')}</TableHead>
                  <TableHead>{t('fromClass')}</TableHead>
                  <TableHead>{t('toClass')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfersData.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell className="font-medium">{transfer.studentName}</TableCell>
                    <TableCell>{t(transfer.fromClass as TranslationKey)}</TableCell>
                    <TableCell>{t(transfer.toClass as TranslationKey)}</TableCell>
                    <TableCell>{formatToEthiopianDate(transfer.date, language)}</TableCell>
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
