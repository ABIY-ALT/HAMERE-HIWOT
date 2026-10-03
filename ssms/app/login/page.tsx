import type { Metadata } from 'next';
import LoginForm from '@/components/auth/LoginForm';

export const metadata: Metadata = {
  description: 'Sign in to the Sunday School Management Information System',
};

export default function LoginPage() {
  return <LoginForm />;
}
