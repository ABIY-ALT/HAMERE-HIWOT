
'use client';

import * as React from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { updateUserPassword } from '@/lib/mock-data';
import { Eye, EyeOff } from 'lucide-react';

const passwordFormSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
    .regex(/[0-9]/, 'Password must contain at least one number.')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character.'),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;

export function ForcePasswordChangeDialog() {
  const { user, completeFirstLogin } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

  React.useEffect(() => {
    if (user?.isFirstLogin) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  }, [user]);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const handleSubmit = (data: PasswordFormValues) => {
    if (!user) return;
    
    updateUserPassword(user.id, data.newPassword);
    completeFirstLogin();

    toast({
      title: "Password Changed",
      description: "Your password has been successfully updated. You can now access the application.",
    });

    setIsOpen(false);
  };
  
  React.useEffect(() => {
    if (!isOpen) {
        form.reset();
        setShowNewPassword(false);
        setShowConfirmPassword(false);
    }
  }, [isOpen, form]);

  return (
    <Dialog open={isOpen}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('welcome')}!</DialogTitle>
          <DialogDescription>
            For your security, please set a new password before you continue.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('newPassword')}</FormLabel>
                <div className="relative">
                  <FormControl><Input type={showNewPassword ? 'text' : 'password'} {...field} /></FormControl>
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="confirmPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('confirmNewPassword')}</FormLabel>
                <div className="relative">
                  <FormControl><Input type={showConfirmPassword ? 'text' : 'password'} {...field} /></FormControl>
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="submit">{t('saveNewPassword')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

    