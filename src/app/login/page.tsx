
'use client';

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
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from '@/hooks/use-translation';
import { Logo } from '@/components/logo';
import { LanguageSwitcher } from '@/components/language-switcher';
import React, { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { appUsers } from '@/lib/mock-data';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { login } = useAuth();
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    const foundUser = appUsers.find(user => user.phone === phone);

    if (foundUser && foundUser.password === password) {
      login(foundUser.id);
      router.push('/dashboard');
    } else {
      toast({
        title: t('loginFailed'),
        description: t('loginFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <main 
        className="relative flex min-h-screen flex-col items-center justify-center bg-cover bg-center p-4"
        style={{ backgroundImage: "url('https://picsum.photos/seed/church-exterior/1280/960')" }}
        data-ai-hint="church building"
    >
      <div className="absolute inset-0 bg-black/60 z-0" />
      <div className="absolute top-8 left-8 flex items-center gap-2 z-10">
         <div className="p-1 rounded-lg bg-white flex items-center justify-center w-10 h-10">
            <Logo className="w-8 h-8" />
         </div>
        <span className="text-xl font-bold font-headline text-white">
          Hamere Hiwot
        </span>
      </div>
       <div className="absolute top-8 right-8 z-10">
        <LanguageSwitcher />
      </div>
      <Card className="w-full max-w-sm z-10">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('login')}</CardTitle>
          <CardDescription>
            {t('loginDescriptionPhone')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('phoneNumber')}</Label>
              <Input 
                id="phone" 
                type="tel" 
                placeholder="09..." 
                required 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('password')}</Label>
                 <Link
                  href="#"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Input 
                  id="password" 
                  type={showPassword ? 'text' : 'password'} 
                  required 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full">
              {t('login')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
