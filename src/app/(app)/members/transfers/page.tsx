
'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/hooks/use-translation';
import { studentTransfers } from '@/lib/mock-data';
import { formatToEthiopianDate } from '@/lib/date-utils';
import type { TranslationKey } from '@/lib/i18n';

export default function StudentTransfersPage() {
  const { t, language } = useTranslation();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('studentTransfers')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>{t('studentTransfers')}</CardTitle>
            <CardDescription>{t('viewTransfers')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('studentName')}</TableHead>
                  <TableHead>{t('fromClass')}</TableHead>
                  <TableHead>{t('toClass')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {studentTransfers.map((transfer) => (
                  <TableRow key={transfer.id}>
                    <TableCell>{formatToEthiopianDate(transfer.date, language)}</TableCell>
                    <TableCell className="font-medium">{transfer.studentName}</TableCell>
                    <TableCell>{t(transfer.fromClass as TranslationKey)}</TableCell>
                    <TableCell>{t(transfer.toClass as TranslationKey)}</TableCell>
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
