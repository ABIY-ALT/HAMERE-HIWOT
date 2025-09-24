
import type { TranslationKey } from "@/lib/i18n";

export interface Student {
  id: number;
  studentId: string;
  name: string;
  age: number;
  grade: string;
  status: 'Active' | 'Transferred';
  parentPhone: string;
  gender?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  registrationDate?: string;
  address?: string;
  guardianName?: string;
  guardianRelationship?: string;
  guardianPhone2?: string;
  photoUrl?: string;
}

export interface Class {
  id: string;
  name: string;
  teacher: string;
  studentCount: number;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: 'Income' | 'Expense';
  receiptNumber?: string;
}

export interface StudentTransfer {
  id: number;
  studentName: string;
  fromClass: string;
  toClass: string;
  date: string;
}

export interface ClassReport {
  id: number;
  date: string;
  submittedBy: string;
  content: string;
}

export interface DepartmentReport {
  id: number;
  date: string;
  submittedBy: string;
  content?: string;
  departmentId: string;
  departmentName: TranslationKey;
  attachmentName?: string;
  attachmentUrl?: string;
  recipientDepartmentIds?: string[];
}

export type AttendanceStatus = 'present' | 'absent';

export interface AttendanceRecord {
  studentId: number | string;
  studentName: string;
  status: AttendanceStatus;
}

export interface AttendanceLog {
  date: string;
  records: AttendanceRecord[];
}

export type Permission = 'Dashboard' | 'Classes' | 'Finance' | 'Departments' | 'Reports' | 'Settings' | 'About' | 'Members';

export interface Role {
    id: string;
    name: string;
    permissions: Permission[];
}

export interface AppUser {
    id: number;
    name: string;
    email: string;
    phone: string;
    role: string;
    password?: string;
    assignedClasses?: string[];
    isFirstLogin?: boolean;
}
