'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, FileText, Send } from 'lucide-react';
import Link from 'next/link';
import type { ClassReport } from '@/types';
import { Separator } from '@/components/ui/separator';
import React, { useState } from 'react';
import { formatToEthiopianDate } from '@/lib/date-utils';
import { useToast } from '@/hooks/use-toast';
import type { TranslationKey } from '@/lib/i18n';
import { addClassReport, classReportsData } from '@/lib/mock-data';

export default function ClassReportsClientPage({ classId, className }: { classId: string, className: TranslationKey }) {
  const { t, language } = useTranslation();
  const [reports, setReports] = useState<ClassReport[]>([...classReportsData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  const [newReport, setNewReport] = useState('');
  const { toast } = useToast();

  const handleSubmitReport = () => {
    if (newReport.trim() === '') return;
    
    const reportToAdd: ClassReport = {
      id: Date.now(),
      date: new Date().toISOString(),
      submittedBy: 'Current User', // Placeholder for logged-in user
      content: newReport,
    };
    
    addClassReport(reportToAdd);
    setReports(prevReports => [reportToAdd, ...prevReports]);
    
    setNewReport('');
    toast({
      title: "Report Submitted",
      description: "Your weekly report has been successfully submitted.",
    });
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={`${t('classReports')} - ${t(className)}`} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href={`/classes/${classId}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToClass')}
            </Link>
          </Button>
        </div>
        
        <div className="grid gap-8 md:grid-cols-2">
            <Card>
                <CardHeader>
                    <CardTitle>{t('submitReport')}</CardTitle>
                    <CardDescription>{t('submitWeeklyReportDescription')}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Textarea 
                      placeholder={t('typeYourReportPlaceholder')}
                      className="min-h-[200px]" 
                      value={newReport}
                      onChange={(e) => setNewReport(e.target.value)}
                    />
                </CardContent>
                <CardFooter>
                    <Button className="ml-auto" onClick={handleSubmitReport}>
                        <Send className="mr-2 h-4 w-4" />
                        {t('submitReport')}
                    </Button>
                </CardFooter>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>{t('submittedReports')}</CardTitle>
                    <CardDescription>{t('viewSubmittedReportsDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {reports.length > 0 ? (
                        reports.map((report, index) => (
                            <div key={report.id}>
                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <p className="font-semibold">{report.submittedBy}</p>
                                        <p className="text-sm text-muted-foreground">{formatToEthiopianDate(report.date, language)}</p>
                                    </div>
                                    <p className="text-sm text-foreground/90">{report.content}</p>
                                </div>
                                {index < reports.length - 1 && <Separator />}
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-muted-foreground py-8">
                            <FileText className="mx-auto h-12 w-12 mb-2" />
                            <p>{t('noReports')}</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
      </main>
    </div>
  );
}
