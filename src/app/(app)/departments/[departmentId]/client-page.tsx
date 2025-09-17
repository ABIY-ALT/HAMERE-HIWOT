'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, FileText, Send, Paperclip, Download, X } from 'lucide-react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import React,
{ useState, useEffect } from 'react';
import { allReports, departmentDetails, addReport, departmentsData } from '@/lib/mock-data';
import type { DepartmentReport } from '@/types';
import type { TranslationKey } from '@/lib/i18n';
import { formatToEthiopianDate } from '@/lib/date-utils';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { MultiSelect } from '@/components/ui/multi-select';
import { Badge } from '@/components/ui/badge';

export default function DepartmentDetailsClientPage({ departmentId }: { departmentId: string }) {
  const { t, language } = useTranslation();
  const details = departmentDetails[departmentId];
  
  const [newReport, setNewReport] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [recipientDepartmentIds, setRecipientDepartmentIds] = useState<string[]>([]);
  const [reports, setReports] = useState<DepartmentReport[]>([]);
  const [reportSubmitted, setReportSubmitted] = useState(false); // State to trigger re-memoization
  const { toast } = useToast();

  const departmentOptions = departmentsData
    .filter(dept => dept.id !== departmentId && dept.id !== 'secretariat')
    .map(dept => ({ value: dept.id, label: t(dept.name as TranslationKey) }));

  useEffect(() => {
    if (departmentId === 'secretariat') {
      setReports([...allReports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } else {
      const filteredReports = allReports.filter(r => 
        r.departmentId === departmentId || 
        r.recipientDepartmentIds?.includes(departmentId)
      ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setReports(filteredReports);
    }
  }, [departmentId, reportSubmitted]);


  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachment(e.target.files[0]);
    }
  };

  const handleSubmitReport = () => {
    if (!details || (newReport.trim() === '' && !attachment)) return;

    const newReportData: DepartmentReport = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      submittedBy: 'Current User', // Placeholder
      content: newReport,
      departmentId: departmentId,
      departmentName: details.name,
      attachmentName: attachment?.name,
      attachmentUrl: attachment ? 'mock-url' : undefined,
      recipientDepartmentIds: recipientDepartmentIds,
    };

    addReport(newReportData);

    setReportSubmitted(prev => !prev); // Trigger re-calculation of reports

    setNewReport('');
    setAttachment(null);
    setRecipientDepartmentIds([]);
    toast({
        title: "Report Submitted",
        description: "Your report has been successfully submitted.",
    });
  };

  if (!details) {
    return (
      <div className="flex min-h-screen w-full flex-col">
        <Header title="Department Not Found" />
        <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
          <div className="flex justify-between items-center">
            <Button variant="outline" asChild>
              <Link href="/departments">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t('backToDepartments')}
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="pt-6">
              <p>The department you are looking for does not exist.</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const isSecretariat = departmentId === 'secretariat';

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t(details.name)} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href="/departments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('backToDepartments')}
            </Link>
          </Button>
        </div>
        
        <div className={`grid gap-8 ${isSecretariat ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            {!isSecretariat && (
              <Card>
                  <CardHeader>
                      <CardTitle>{t('submitReport')}</CardTitle>
                      <CardDescription>{t('submitActivityReportDescription')}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <Textarea 
                        placeholder={t('typeYourReportPlaceholder')}
                        className="min-h-[150px]"
                        value={newReport}
                        onChange={(e) => setNewReport(e.target.value)}
                      />
                       <div>
                            <label className="text-sm font-medium">{t('sendTo')}</label>
                            <MultiSelect
                                options={departmentOptions}
                                selected={recipientDepartmentIds}
                                onChange={setRecipientDepartmentIds}
                                placeholder={t('selectDepartments')}
                                className="mt-1"
                            />
                            <p className="text-xs text-muted-foreground mt-1">{t('secretariatReceivesCopy')}</p>
                        </div>
                      <div>
                        {attachment ? (
                          <div className="flex items-center justify-between p-2 border rounded-md">
                            <div className="flex items-center gap-2">
                              <Paperclip className="h-4 w-4" />
                              <span className="text-sm text-muted-foreground">{attachment.name}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setAttachment(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <label className="flex w-full items-center justify-center p-4 border-2 border-dashed rounded-md cursor-pointer hover:bg-muted/50">
                            <div className="text-center">
                                <Paperclip className="mx-auto h-6 w-6 text-muted-foreground mb-1"/>
                                <span className="text-sm font-medium text-muted-foreground">{t('attachAFile')}</span>
                            </div>
                            <Input type="file" className="hidden" onChange={handleFileChange} />
                         </label>
                        )}
                      </div>
                  </CardContent>
                  <CardFooter>
                      <Button className="ml-auto" onClick={handleSubmitReport}>
                          <Send className="mr-2 h-4 w-4" />
                          {t('submitReport')}
                      </Button>
                  </CardFooter>
              </Card>
            )}

            <Card className={isSecretariat ? 'col-span-1' : ''}>
                <CardHeader>
                    <CardTitle>{isSecretariat ? t('allDepartmentReports') : t('submittedReports')}</CardTitle>
                    <CardDescription>{t('viewSubmittedReportsDescription')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {reports.length > 0 ? (
                        reports.map((report, index) => (
                            <div key={report.id}>
                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <div>
                                          <p className="font-semibold">{report.submittedBy} ({t(report.departmentName)})</p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{formatToEthiopianDate(report.date, language)}</p>
                                    </div>
                                    {report.content && <p className="text-sm text-foreground/90 mb-2">{report.content}</p>}
                                    {report.attachmentName && (
                                      <Button variant="outline" size="sm" className="mt-2">
                                        <Download className="mr-2 h-4 w-4" />
                                        {report.attachmentName}
                                      </Button>
                                    )}
                                    {isSecretariat && report.recipientDepartmentIds && report.recipientDepartmentIds.length > 0 && (
                                        <div className="mt-2">
                                            <span className="text-xs font-semibold">{t('recipients')}: </span>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {report.recipientDepartmentIds.map(id => (
                                                    <Badge key={id} variant="secondary">{t(departmentDetails[id]?.name)}</Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}
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
