import type { Metadata } from 'next';
import RegisterForm from '@/components/auth/RegisterForm';

export const metadata: Metadata = {
  title: 'Register your Sunday school',
  description: 'Start using the Sunday School Management System for your Sunday school — free trial, no card needed.',
};

export default function RegisterPage() {
  return <RegisterForm />;
}
