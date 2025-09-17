
'use client';

import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const galleryImages = [
  { src: 'https://picsum.photos/seed/church-interior/600/400', altKey: 'churchInterior', hint: 'church interior' },
  { src: 'https://picsum.photos/seed/congregation/600/400', altKey: 'congregationService', hint: 'church congregation' },
  { src: 'https://picsum.photos/seed/students-learning/600/400', altKey: 'sabbathSchoolStudents', hint: 'students classroom' },
  { src: 'https://picsum.photos/seed/church-event/600/400', altKey: 'specialChurchEvent', hint: 'community event' },
  { src: 'https://picsum.photos/seed/volunteer-group/600/400', altKey: 'churchVolunteers', hint: 'volunteer group' },
  { src: 'https://picsum.photos/seed/church-building-day/600/400', altKey: 'churchBuildingExterior', hint: 'church building' },
];

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('aboutUs')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <div className="flex justify-between items-center">
            <Button variant="outline" asChild>
                <Link href="/dashboard">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t('backToDashboard')}
                </Link>
            </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-headline">
              {t('aboutSaloKidusGiyorgis')}
            </CardTitle>
            <CardDescription>{t('andHamereHiwot')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-primary">{t('ourHistory')}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t('historyPlaceholder')}
              </p>
               <p className="text-muted-foreground leading-relaxed">
                {t('historyPlaceholder2')}
              </p>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-primary mb-4">{t('photoGallery')}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {galleryImages.map((image, index) => (
                  <div key={index} className="overflow-hidden rounded-lg shadow-lg hover:shadow-xl transition-shadow duration-300">
                    <Image
                      src={image.src}
                      alt={t(image.altKey as any)}
                      width={600}
                      height={400}
                      className="w-full h-full object-cover"
                      data-ai-hint={image.hint}
                    />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
