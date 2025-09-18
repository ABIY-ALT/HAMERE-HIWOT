
import type { DepartmentReport, AttendanceLog, AppUser, ClassReport, Student, Transaction, Role, Permission } from '@/types';
import type { TranslationKey } from './i18n';
import { translations } from './i18n';

// In-memory store for department reports to simulate a database.
export let allReports: DepartmentReport[] = [
    { 
        id: 1, 
        date: '2024-05-18', 
        submittedBy: 'W/ro Martha', 
        content: 'Finalized the curriculum for the upcoming month. Materials have been ordered.',
        departmentId: 'children',
        departmentName: 'childrensSection'
    },
    { 
        id: 2, 
        date: '2024-05-20', 
        submittedBy: 'Ato Daniel', 
        content: 'Guest speaker confirmed for next Sunday.',
        departmentId: 'education',
        departmentName: 'educationSection',
        attachmentName: 'GuestSpeaker-Bio.pdf',
        attachmentUrl: 'mock-url',
        recipientDepartmentIds: ['choir']
    },
    { 
        id: 3, 
        date: '2024-05-13', 
        submittedBy: 'Ato Daniel', 
        content: 'Reviewed educational materials for the youth group.',
        departmentId: 'education',
        departmentName: 'educationSection'
    },
];

// Function to add a new report
export const addReport = (report: DepartmentReport) => {
    allReports.unshift(report); // Add to the beginning of the array
};

// Static department details
export let departmentDetails: Record<string, { name: TranslationKey }> = {
    'children': { name: 'childrensSection' },
    'choir': { name: 'choirSection' },
    'education': { name: 'educationSection' },
    'general-services': { name: 'generalServicesSection' },
    'property': { name: 'propertyManagementSection' },
    'art': { name: 'artSection' },
    'secretariat': { name: 'secretariat' },
    'communication': { name: 'communicationSection' },
};

export let departmentsData = Object.entries(departmentDetails).map(([id, details]) => ({
    id,
    name: details.name,
}));

const regenerateDepartmentsData = () => {
    departmentsData = Object.entries(departmentDetails).map(([id, details]) => ({
        id,
        name: details.name,
    }));
}

export const addDepartment = (name: string) => {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    const translationKey = id.replace(/-/g, '') as TranslationKey; // a bit of a guess, might need a better system
    if (!departmentDetails[id]) {
        departmentDetails[id] = { name: translationKey };
        // This is a hack for now. In a real app, you'd add to a translation file.
        // @ts-ignore
        translations.en[translationKey] = name;
        // @ts-ignore
        translations.am[translationKey] = name; // You'd need a real translation here
        regenerateDepartmentsData();
    }
};

export const updateDepartment = (id: string, name: string) => {
    if (departmentDetails[id]) {
        const translationKey = departmentDetails[id].name;
         // This is a hack for now. In a real app, you'd add to a translation file.
        // @ts-ignore
        translations.en[translationKey] = name;
        // @ts-ignore
        translations.am[translationKey] = name; // You'd need a real translation here
        // The key in departmentDetails remains the same, just the display value changes.
    }
};

export const deleteDepartment = (id: string) => {
    if (departmentDetails[id]) {
        delete departmentDetails[id];
        regenerateDepartmentsData();
    }
};


export let attendanceHistory: AttendanceLog[] = [
  {
    date: '2024-05-19',
    records: [
      { studentId: 5, studentName: 'Meseret Defar', status: 'present' },
      { studentId: 6, studentName: 'Student F', status: 'present' },
      { studentId: 7, studentName: 'Student G', status: 'absent' },
    ],
  },
  {
    date: '2024-05-12',
    records: [
      { studentId: 5, studentName: 'Meseret Defar', status: 'present' },
      { studentId: 6, studentName: 'Student F', status: 'present' },
      { studentId: 7, studentName: 'Student G', status: 'present' },
    ],
  },
];

// Function to add a new attendance log
export const addAttendanceLog = (log: AttendanceLog) => {
    // To prevent duplicate entries for the same day, remove existing log for that day
    const existingIndex = attendanceHistory.findIndex(h => h.date === log.date);
    if (existingIndex !== -1) {
        attendanceHistory.splice(existingIndex, 1);
    }
    attendanceHistory.push(log);
};


export let appUsers: AppUser[] = [
    { id: 1, name: 'Abiy Hailemichael', email: 'Abiy.Hmichael@nibbank.com.et', phone: '0932489095', role: 'Teacher', assignedClasses: ['qedamay', 'kalay'], isFirstLogin: true, password: 'password123' },
    { id: 2, name: 'Admin Admin', email: 'Admin@gmail.com', phone: '0912345678', role: 'Admin', isFirstLogin: false, password: 'admin' },
    { id: 3, name: 'Alhamdu Yajbo', email: 'www.alex94lykam@gmail.com', phone: '0933480007', role: 'Chief Officer', isFirstLogin: true, password: 'password123' },
];

// This function simulates getting the currently logged-in user.
// In a real application, this would come from an authentication context.
export const getCurrentUser = (): AppUser | undefined => {
    if (typeof window !== 'undefined') {
        const loggedInUserId = sessionStorage.getItem('loggedInUserId');
        if (loggedInUserId) {
            return appUsers.find(u => u.id === parseInt(loggedInUserId, 10));
        }
    }
    // Return a default user if no one is logged in or if on the server
    return appUsers[2]; 
};

export const addUser = (user: AppUser) => {
    appUsers.unshift(user);
};

export const updateUser = (id: number, updatedData: Partial<AppUser>) => {
    const index = appUsers.findIndex(u => u.id === id);
    if (index !== -1) {
        appUsers[index] = { ...appUsers[index], ...updatedData };
    }
};

export const deleteUser = (id: number) => {
    const index = appUsers.findIndex(u => u.id === id);
    if (index !== -1) {
        appUsers.splice(index, 1);
    }
};

export const updateUserFirstLogin = (id: number, isFirstLogin: boolean) => {
    const index = appUsers.findIndex(u => u.id === id);
    if (index !== -1) {
        appUsers[index].isFirstLogin = isFirstLogin;
    }
};

export const updateUserPassword = (id: number, newPassword: string) => {
    const index = appUsers.findIndex(u => u.id === id);
    if (index !== -1) {
        appUsers[index].password = newPassword;
    }
};

export let classReportsData: ClassReport[] = [
    { id: 1, date: '2024-05-19', submittedBy: 'Ato Solomon', content: 'This week we covered the story of David and Goliath. All students participated well, and their homework was satisfactory.' },
    { id: 2, date: '2024-05-12', submittedBy: 'Ato Solomon', content: 'Review of the Ten Commandments. Some students are struggling to memorize them. Plan to do a review session next week.' },
];

export const addClassReport = (report: ClassReport) => {
    classReportsData.unshift(report);
};

export let studentsData: Student[] = [
  {
    id: 1,
    studentId: 'H001',
    name: 'Abebe Bikila',
    age: 12,
    grade: 'salsay',
    status: 'Active',
    parentPhone: '+251911234567',
    gender: 'Male',
    dateOfBirth: '1932-08-07',
    placeOfBirth: 'Jato',
    address: 'Addis Ababa, Ethiopia',
    guardianName: 'Bikila Demissie',
    guardianRelationship: 'Father',
    registrationDate: '2022-09-01',
    photoUrl: undefined,
  },
  {
    id: 5,
    studentId: 'H005',
    name: 'Meseret Defar',
    age: 13,
    grade: 'qedamay',
    status: 'Active',
    parentPhone: '+251931234567',
    gender: 'Female',
    dateOfBirth: '1983-11-19',
    placeOfBirth: 'Addis Ababa',
    address: 'Addis Ababa, Ethiopia',
    guardianName: 'Defar Tulu',
    guardianRelationship: 'Father',
    registrationDate: '2023-01-15',
    photoUrl: undefined,
  },
  {
    id: 2,
    studentId: 'H002',
    name: 'Tirunesh Dibaba',
    age: 10,
    grade: "rabay",
    status: 'Active',
    parentPhone: '+251912345678',
    gender: 'Female',
    dateOfBirth: '1985-06-01',
    placeOfBirth: 'Bekoji',
    address: 'Addis Ababa, Ethiopia',
    guardianName: 'Dibaba Keneni',
    guardianRelationship: 'Father',
    registrationDate: '2022-10-20',
    photoUrl: undefined,
  },
  {
    id: 3,
    studentId: 'H003',
    name: 'Haile Gebrselassie',
    age: 14,
    grade: 'salsay',
    status: 'Transferred',
    parentPhone: '+251913456789',
    gender: 'Male',
    dateOfBirth: '1973-04-18',
    placeOfBirth: 'Asella',
    address: 'Addis Ababa, Ethiopia',
    guardianName: 'Gebrselassie Bekele',
    guardianRelationship: 'Father',
    registrationDate: '2021-09-05',
    photoUrl: undefined,
  },
  {
    id: 4,
    studentId: 'H004',
    name: 'Kenenisa Bekele',
    age: 11,
    grade: "kalay",
    status: 'Active',
    parentPhone: '+251921234567',
    gender: 'Male',
    dateOfBirth: '1982-06-13',
    placeOfBirth: 'Bekoji',
    address: 'Addis Ababa, Ethiopia',
    guardianName: 'Bekele Beyecha',
    guardianRelationship: 'Father',
    registrationDate: '2022-11-01',
    photoUrl: undefined,
  },
   { id: 6, studentId: 'H006', name: 'Student F', age: 6, grade: 'qedamay', status: 'Active', parentPhone: '+251912345678', gender: 'Female', guardianName: 'Father F', photoUrl: undefined, },
   { id: 7, studentId: 'H007', name: 'Student G', age: 6, grade: 'qedamay', status: 'Active', parentPhone: '+251912345678', gender: 'Male', guardianName: 'Father G', photoUrl: undefined, },
   { id: 8, studentId: 'H008', name: 'Student H', age: 7, grade: "kalay", status: 'Active', parentPhone: '+251912345678', gender: 'Female', guardianName: 'Father H', photoUrl: undefined, },
   { id: 9, studentId: 'H009', name: 'Student I', age: 7, grade: "kalay", status: 'Active', parentPhone: '+251912345678', gender: 'Male', guardianName: 'Father I', photoUrl: undefined, },
   { id: 10, studentId: 'H010', name: 'Student J', age: 8, grade: 'rabay', status: 'Active', parentPhone: '+251912345678', gender: 'Female', guardianName: 'Father J', photoUrl: undefined, },
   { id: 11, studentId: 'H011', name: 'Student K', age: 9, grade: 'rabay', status: 'Active', parentPhone: '+251912345678', gender: 'Male', guardianName: 'Father K', photoUrl: undefined, },
];

export const addStudent = (student: Student) => {
    studentsData.unshift(student);
};

export const getStudentById = (id: number) => {
    return studentsData.find(s => s.id === id);
}

export const updateStudent = (id: number, updatedStudent: Partial<Student>) => {
    const index = studentsData.findIndex(s => s.id === id);
    if (index !== -1) {
        studentsData[index] = { ...studentsData[index], ...updatedStudent };
    }
}

export const deleteStudent = (id: number) => {
    const index = studentsData.findIndex(s => s.id === id);
    if (index !== -1) {
        studentsData.splice(index, 1);
    }
}

export let transactionsData: Transaction[] = [
  { id: 1, date: '2024-05-20', description: 'Weekly Offering', amount: 350.75, type: 'Income', receiptNumber: 'R-001' },
  { id: 2, date: '2024-05-19', description: 'Sunday School Supplies', amount: 85.50, type: 'Expense', receiptNumber: 'R-002' },
  { id: 3, date: '2024-05-18', description: 'Book Sale Fundraiser', amount: 1200.00, type: 'Income', receiptNumber: 'R-003' },
  { id: 4, date: '2024-05-17', description: 'Guest Speaker Honorarium', amount: 150.00, type: 'Expense', receiptNumber: 'R-004' },
  { id: 5, date: '2024-05-13', description: 'Weekly Offering', amount: 325.50, type: 'Income', receiptNumber: 'R-005' },
];

export const addTransaction = (transaction: Transaction) => {
    transactionsData.unshift(transaction);
};

export let rolesData: Role[] = [
    { id: 'admin', name: 'Admin', permissions: ['Dashboard', 'Members', 'Students', 'Classes', 'Finance', 'Departments', 'About', 'Settings', 'Reports'] },
    { id: 'teacher', name: 'Teacher', permissions: ['Dashboard', 'Students', 'Classes', 'About', 'Reports'] },
    { id: 'chiefofficer', name: 'Chief Officer', permissions: ['Dashboard', 'Members', 'Finance', 'Departments', 'About', 'Reports'] },
];

export const addRole = (role: Role) => {
    rolesData.push(role);
};

export const updateRole = (id: string, updatedData: Partial<Role>) => {
    const index = rolesData.findIndex(r => r.id === id);
    if (index !== -1) {
        rolesData[index] = { ...rolesData[index], ...updatedData };
    }
};

export const deleteRole = (id: string) => {
    const index = rolesData.findIndex(r => r.id === id);
    if (index !== -1) {
        rolesData.splice(index, 1);
    }
};

export const classesData: { id: string, name: TranslationKey }[] = [
    { id: 'qedamay', name: 'qedamay' },
    { id: 'kalay', name: 'kalay' },
    { id: 'salsay', name: 'salsay' },
    { id: 'rabay', name: 'rabay' },
];
