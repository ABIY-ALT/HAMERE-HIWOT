
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, FileText, Send } from 'lucide-react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import React, { useState, useMemo } from 'react';
import { allReports, departmentDetails, addReport, departmentsData } from '@/lib/mock-data';
import type { DepartmentReport } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { MultiSelect } from '@/components/ui/multi-select';
import { Label } from '@/components/ui/label';

export default function DepartmentDetailsPage({ params }: { params: { departmentId: string } }) {
  const { t } = useTranslation();
  const departmentId = params.departmentId;
  const details = departmentDetails[departmentId];
  const { toast } = useToast();

  const [newReport, setNewReport] = useState('');
  const [recipientDepartmentIds, setRecipientDepartmentIds] = useState<string[]>([]);
  // This state is just to trigger re-renders when reports are added.
  const [reportCount, setReportCount] = useState(allReports.length);

  const reports = useMemo(() => {
    // Depend on reportCount to re-evaluate when a report is added.
    const reportsSource = [...allReports];
    
    const sortedReports = reportsSource.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (departmentId === 'secretariat') {
      return sortedReports;
    }
    // A department can see reports they submitted, and reports sent to them.
    return sortedReports.filter(r => r.departmentId === departmentId || (r.recipientDepartmentIds && r.recipientDepartmentIds.includes(departmentId)));
  }, [departmentId, reportCount]);


  const handleSubmitReport = () => {
    if (newReport.trim() === '' || !details) return;
    
    // Secretariat is always included as a recipient if not the sender
    const finalRecipients = [...recipientDepartmentIds];
    if (departmentId !== 'secretariat' && !finalRecipients.includes('secretariat')) {
        finalRecipients.push('secretariat');
    }

    const newReportData: DepartmentReport = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      submittedBy: 'Current User', // Placeholder
      content: newReport,
      departmentId: departmentId,
      departmentName: details.name,
      recipientDepartmentIds: finalRecipients,
    };

    addReport(newReportData);
    setReportCount(allReports.length); // Trigger a re-render
    setNewReport('');
    setRecipientDepartmentIds([]);
    toast({
        title: "Report Submitted",
        description: "Your report has been successfully submitted."
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
  const departmentOptions = departmentsData
    .filter(d => d.id !== departmentId && d.id !== 'secretariat')
    .map(d => ({ value: d.id, label: t(d.name) }));

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t(details.name)} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href="/departments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Departments
            </Link>
          </Button>
        </div>
        
        <div className={`grid gap-8 ${isSecretariat ? 'grid-cols-1' : 'md:grid-cols-2'}`}>
            {!isSecretariat && (
              <Card>
                  <CardHeader>
                      <CardTitle>{t('submitReport')}</CardTitle>
                      <CardDescription>Submit a new activity report for this department.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor='report-content'>{t('reportContent')}</Label>
                        <Textarea 
                          id="report-content"
                          placeholder="Type your report here..." 
                          className="min-h-[200px]"
                          value={newReport}
                          onChange={(e) => setNewReport(e.target.value)}
                        />
                      </div>
                       <div className="space-y-2">
                          <Label>{t('sendTo')}</Label>
                          <MultiSelect
                            options={departmentOptions}
                            selected={recipientDepartmentIds}
                            onChange={setRecipientDepartmentIds}
                            placeholder={t('selectDepartments')}
                          />
                          <p className="text-xs text-muted-foreground">{t('secretariatReceivesCopy')}</p>
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

            <Card className={isSecretariat ? 'col-span-1' : 'md:col-span-1'}>
                <CardHeader>
                    <CardTitle>{isSecretariat ? "All Department Reports" : "Submitted & Received Reports"}</CardTitle>
                    <CardDescription>View previously submitted reports and reports sent to you.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {reports.length > 0 ? (
                        reports.map((report, index) => (
                            <div key={report.id}>
                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <div>
                                          <p className="font-semibold">{report.submittedBy} <span className="text-muted-foreground font-normal">({t(report.departmentName)})</span></p>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{report.date}</p>
                                    </div>
                                    <p className="text-sm text-foreground/90">{report.content}</p>
                                     {report.recipientDepartmentIds && report.recipientDepartmentIds.length > 0 && (
                                        <div className="text-xs text-muted-foreground mt-2">
                                            <strong>{t('recipients')}:</strong> {report.recipientDepartmentIds.map(id => t(departmentDetails[id]?.name)).join(', ')}
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
