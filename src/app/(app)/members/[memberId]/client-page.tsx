
'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from '@/hooks/use-translation';
import { ArrowLeft, Edit } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { Student as Member } from '@/types';
import { Badge } from '@/components/ui/badge';
import type { TranslationKey } from '@/lib/i18n';
import { formatToEthiopianDate } from '@/lib/date-utils';

export default function MemberDetailsClientPage({ member }: { member?: Member }) {
  const { t, language } = useTranslation();

  if (!member) {
    return (
        <div className="flex min-h-screen w-full flex-col">
         <Header title={t('studentNotFound')} />
         <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
            <div className="mb-4">
              <Button variant="outline" asChild>
                <Link href="/members">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Members
                </Link>
              </Button>
            </div>
            <Card>
                <CardContent className="pt-6">
                    <p>Member not found.</p>
                </CardContent>
            </Card>
         </main>
        </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={member.name} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center mb-4">
          <Button variant="outline" asChild>
            <Link href="/members">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Members
            </Link>
          </Button>
           <Button asChild>
              <Link href={`/members/${member.id}/edit`}>
                <Edit className="mr-2 h-4 w-4" />
                {t('edit')}
              </Link>
            </Button>
        </div>
        <Card className="max-w-4xl mx-auto w-full">
          <CardHeader>
            <CardTitle>Member Information</CardTitle>
            <CardDescription>
              Viewing details for {member.name}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
               <div className="flex flex-col items-center gap-4">
                  <div className="w-48 h-48 rounded-md border-2 border-dashed border-muted-foreground/50 flex items-center justify-center bg-muted/20 overflow-hidden">
                    <Image 
                      src={member.photoUrl || `https://picsum.photos/seed/${member.id}a/192`} 
                      alt="Member photo" 
                      width={192} 
                      height={192} 
                      className="object-cover w-full h-full" 
                      data-ai-hint="student portrait" 
                    />
                  </div>
                </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div className="space-y-2">
                    <Label>{t('fullName')}</Label>
                    <Input readOnly value={member.name || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('age')}</Label>
                    <Input readOnly value={member.age || ''} />
                  </div>
                   <div className="space-y-2">
                    <Label>{t('gender')}</Label>
                    <Input readOnly value={member.gender || ''} />
                  </div>
                   <div className="space-y-2">
                    <Label>{t('dateOfBirth')}</Label>
                    <Input readOnly value={member.dateOfBirth ? formatToEthiopianDate(member.dateOfBirth, language) : ''} />
                  </div>
                   <div className="space-y-2">
                    <Label>{t('placeOfBirth')}</Label>
                    <Input readOnly value={member.placeOfBirth || ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('currentGrade')}</Label>
                    <Input readOnly value={t(member.grade as TranslationKey) || ''} />
                  </div>
                   <div className="space-y-2">
                    <Label>Member ID</Label>
                    <Input readOnly value={member.studentId || ''} />
                  </div>
                   <div className="space-y-2">
                    <Label>{t('registrationDate')}</Label>
                    <Input readOnly value={member.registrationDate ? formatToEthiopianDate(member.registrationDate, language) : ''} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('status')}</Label>
                    <div>
                        <Badge variant={member.status === 'Active' ? 'default' : 'secondary'}>{member.status}</Badge>
                    </div>
                  </div>
              </div>

              <Separator />

               <div className="space-y-2">
                <Label>{t('address')}</Label>
                <Textarea readOnly value={member.address || ''} />
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-medium">{t('emergencyContact')}</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                     <div className="space-y-2">
                      <Label>{t('guardianName')}</Label>
                      <Input readOnly value={member.guardianName || ''} />
                    </div>
                     <div className="space-y-2">
                      <Label>{t('guardianRelationship')}</Label>
                      <Input readOnly value={member.guardianRelationship || ''} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('guardianPhone1')}</Label>
                      <Input readOnly value={member.parentPhone || ''} type="tel" />
                    </div>
                     <div className="space-y-2">
                      <Label>{t('guardianPhone2')}</Label>
                      <Input readOnly value={member.guardianPhone2 || ''} type="tel" />
                    </div>
                 </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
