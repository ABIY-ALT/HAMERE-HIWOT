'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, FileText, Send } from 'lucide-react';
import Link from 'next/link';
import { Separator } from '@/components/ui/separator';
import React, { useState, useEffect } from 'react';
import { allReports, departmentDetails, addReport } from '@/lib/mock-data';
import type { DepartmentReport } from '@/types';

export default function DepartmentDetailsPage({ params }: { params: { departmentId: string } }) {
  const { t } = useTranslation();
  const resolvedParams = React.use(params);
  const departmentId = resolvedParams.departmentId;
  const details = departmentDetails[departmentId] || { name: 'Unknown Department' };
  
  const [newReport, setNewReport] = useState('');
  const [reports, setReports] = useState<DepartmentReport[]>([]);

  useEffect(() => {
    if (departmentId === 'secretariat') {
      // Secretariat sees all reports
      setReports(allReports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } else {
      // Other departments see only their own reports
      setReports(allReports.filter(r => r.departmentId === departmentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }
  }, [departmentId]);


  const handleSubmitReport = () => {
    if (newReport.trim() === '') return;
    
    const newReportData: DepartmentReport = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      submittedBy: 'Current User', // Placeholder
      content: newReport,
      departmentId: departmentId,
      departmentName: details.name,
    };

    addReport(newReportData);

    // Refresh the reports list
    if (departmentId === 'secretariat') {
      setReports([...allReports].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    } else {
      setReports(allReports.filter(r => r.departmentId === departmentId).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    }

    setNewReport('');
  };

  const isSecretariat = departmentId === 'secretariat';

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={details.name} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
          <Button variant="outline" asChild>
            <Link href="/departments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Departments
            </Link>
          </Button>
        </div>
        
        <div className={`grid gap-8 ${isSecretariat ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
            {!isSecretariat && (
              <Card>
                  <CardHeader>
                      <CardTitle>{t('submitReport')}</CardTitle>
                      <CardDescription>Submit a new activity report for this department.</CardDescription>
                  </CardHeader>
                  <CardContent>
                      <Textarea 
                        placeholder="Type your report here..." 
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
            )}

            <Card>
                <CardHeader>
                    <CardTitle>{isSecretariat ? "All Department Reports" : "Submitted Reports"}</CardTitle>
                    <CardDescription>View previously submitted reports.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {reports.length > 0 ? (
                        reports.map((report, index) => (
                            <div key={report.id}>
                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <div>
                                          <p className="font-semibold">{report.submittedBy}</p>
                                          {isSecretariat && <p className="text-xs text-muted-foreground">{report.departmentName}</p>}
                                        </div>
                                        <p className="text-sm text-muted-foreground">{report.date}</p>
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
