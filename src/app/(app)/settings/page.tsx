
'use client';

import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { PlusCircle, Pencil, KeyRound, Trash2, Eye, EyeOff } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  appUsers,
  addUser,
  updateUser,
  deleteUser as deleteUserFromDb,
  rolesData,
  updateRole,
  classesData,
  addRole,
  deleteRole as deleteRoleFromDb,
  updateUserPassword,
  mockDepartments,
  addDepartment,
  updateDepartment,
  deleteDepartment as deleteDepartmentFromDb
} from '@/lib/mock-data';
import type { AppUser, Role, Permission } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { TranslationKey } from '@/lib/i18n';
import { MultiSelect } from '@/components/ui/multi-select';

// -------------------- Schemas --------------------
const userFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  role: z.string().min(1, 'Please select a role'),
  assignedClasses: z.array(z.string()).optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

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

const roleFormSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  permissions: z.array(z.string()).min(1, 'At least one permission is required'),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

const departmentFormSchema = z.object({
  name: z.string().min(1, 'Department name is required'),
});

type DepartmentFormValues = z.infer<typeof departmentFormSchema>;

// -------------------- Dialogs --------------------
function UserDialog({ user, isOpen, onOpenChange, onSave, roles }: {
  user: Partial<AppUser> | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: UserFormValues, id?: number) => void;
  roles: Role[];
}) {
  const { t } = useTranslation();
  const isEditMode = Boolean(user?.id);

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { name: '', email: '', phone: '', role: '', assignedClasses: [] },
  });

  useEffect(() => {
    if (isOpen) {
      form.reset({
        name: user?.name || '',
        email: user?.email || '',
        phone: user?.phone || '',
        role: user?.role || '',
        assignedClasses: user?.assignedClasses || [],
      });
    }
  }, [user, isOpen, form]);

  const selectedRoleName = form.watch('role');
  const roleObject = roles.find(r => r.name === selectedRoleName);
  const roleHasClassPermission = roleObject?.permissions.includes('Classes');

  const handleSubmit = (data: UserFormValues) => {
    onSave(data, user?.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('edit') : t('addUser')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('editUserDescription') : t('addUserDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('name')}</FormLabel>
                <FormControl><Input {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('email')}</FormLabel>
                <FormControl><Input type="email" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('phoneNumber')}</FormLabel>
                <FormControl><Input type="tel" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('roles')}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder={t('selectRole')} /></SelectTrigger>
                  <SelectContent>
                    {roles.map(role => (
                      <SelectItem key={role.id} value={role.name}>{t(role.name.toLowerCase().replace(/\s/g, '') as TranslationKey) || role.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {roleHasClassPermission && (
              <FormField control={form.control} name="assignedClasses" render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('assignedClasses')}</FormLabel>
                  <MultiSelect
                    options={classesData.map(c => ({ value: c.id, label: t(c.name) }))}
                    selected={field.value ?? []}
                    onChange={field.onChange}
                    placeholder={t('selectClasses')}
                  />
                  <FormMessage />
                </FormItem>
              )} />
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit">{t('save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({ user, isOpen, onOpenChange }: { user: AppUser | null; isOpen: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  useEffect(() => { if (!isOpen) form.reset(); }, [isOpen, form]);

  const handleSubmit = (data: PasswordFormValues) => {
    if (!user) return;
    updateUserPassword(user.id, data.newPassword);
    toast({ title: "Password Changed", description: `The password for ${user.name} has been updated.` });
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('changePasswordFor', { name: user?.name || '' })}</DialogTitle>
          <DialogDescription>{t('changePasswordDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="newPassword" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('newPassword')}</FormLabel>
                <div className="relative">
                  <FormControl><Input type={showNewPassword ? 'text' : 'password'} {...field} /></FormControl>
                  <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                    {showNewPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
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
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit">{t('saveNewPassword')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Permissions --------------------
const permissionOptions = [
  { value: 'Dashboard', label: 'Dashboard' },
  { value: 'Members', label: 'Members' },
  { value: 'Classes', label: 'Classes' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Departments', label: 'Departments' },
  { value: 'Reports', label: 'Reports' },
  { value: 'Settings', label: 'Settings' },
  { value: 'About', label: 'About' },
];

function RoleDialog({ role, isOpen, onOpenChange, onSave }: {
  role: Partial<Role> | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: RoleFormValues, id?: string) => void;
}) {
  const { t } = useTranslation();
  const isEditMode = role && role.id;

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: { name: role?.name || '', permissions: role?.permissions || [] },
  });

  useEffect(() => {
    form.reset({ name: role?.name || '', permissions: role?.permissions || [] });
  }, [role, form]);

  const handleSubmit = (data: RoleFormValues) => { onSave(data, role?.id); onOpenChange(false); };
  const translatedPermissionOptions = permissionOptions.map(opt => ({ ...opt, label: t(opt.label.toLowerCase() as TranslationKey) }));

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('editRole') : t('addRole')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('editRoleDescription') : t('addRoleDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('roleName')}</FormLabel>
                <FormControl><Input {...field} placeholder={t('roleNamePlaceholder')} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="permissions" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('permissions')}</FormLabel>
                <MultiSelect options={translatedPermissionOptions} selected={field.value ?? []} onChange={field.onChange} placeholder={t('selectPermissions')} />
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit">{t('save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Departments --------------------
function DepartmentDialog({ department, isOpen, onOpenChange, onSave }: {
  department: { id: string; name: TranslationKey } | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: DepartmentFormValues, id?: string) => void;
}) {
  const { t } = useTranslation();
  const isEditMode = !!department?.id;

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: department?.name || '' },
  });

  useEffect(() => { form.reset({ name: department?.name || '' }); }, [department, form]);

  const handleSubmit = (data: DepartmentFormValues) => { onSave(data, department?.id); onOpenChange(false); };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('edit') : t('addDepartment')}</DialogTitle>
          <DialogDescription>{isEditMode ? t('editUserDescription') : t('addUserDescription')}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('departmentName')}</FormLabel>
                <FormControl><Input {...field} placeholder="e.g., Sunday School" /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit">{t('save')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Settings Page --------------------
export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [users, setUsers] = useState<AppUser[]>([]);
  const [roles, setRoles] = useState<Role[]>(rolesData);
  const [departments, setDepartments] = useState([...mockDepartments]);

  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<Partial<AppUser> | null>(null);
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [userForPasswordChange, setUserForPasswordChange] = useState<AppUser | null>(null);

  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<Partial<Role> | null>(null);
  const [roleToDelete, setRoleToDelete] = useState<Role | null>(null);

  const [isDepartmentDialogOpen, setIsDepartmentDialogOpen] = useState(false);
  const [currentDepartment, setCurrentDepartment] = useState<{ id: string; name: TranslationKey } | null>(null);
  const [departmentToDelete, setDepartmentToDelete] = useState<{ id: string; name: TranslationKey } | null>(null);

  useEffect(() => { setUsers([...appUsers]); }, []);
  
  const handlePermissionsChange = useCallback((roleId: string, newPermissions: string[]) => {
    setRoles(prevRoles =>
      prevRoles.map(role =>
        role.id === roleId ? { ...role, permissions: newPermissions as Permission[] } : role
      )
    );
     // Note: In a real app, you'd also call an API to save this change.
    updateRole(roleId, { permissions: newPermissions as Permission[] });
    toast({ title: t('roleUpdated'), description: t('roleUpdatedSuccessMessage') });
  }, [t]);


  const getBadgeVariant = (roleName: string) => {
    const role = roles.find(r => r.name === roleName);
    if (!role) return 'secondary';
    switch (role.id) {
      case 'admin': return 'default';
      case 'teacher': return 'secondary';
      case 'chiefofficer': return 'outline';
      default: return 'secondary';
    }
  };

  // -------------------- Handlers --------------------
  const handleOpenUserDialog = (user: Partial<AppUser> | null = null) => { setCurrentUser(user); setIsUserDialogOpen(true); };
  const handleOpenRoleDialog = (role: Partial<Role> | null = null) => { setCurrentRole(role); setIsRoleDialogOpen(true); };
  const handleOpenDepartmentDialog = (department: { id: string; name: TranslationKey } | null = null) => { setCurrentDepartment(department); setIsDepartmentDialogOpen(true); };

  const handleSaveUser = (data: UserFormValues, id?: number) => {
    if (id != null) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
      updateUser(id, data);
      toast({ title: t('updatedUser'), description: `${data.name} ${t('updatedSuccessfully')}` });
    } else {
      const newUser: AppUser = { id: Date.now(), ...data };
      setUsers(prev => [...prev, newUser]);
      addUser(newUser);
      toast({ title: t('addedUser'), description: `${data.name} ${t('addedSuccessfully')}` });
    }
  };

  const handleDeleteUser = (user: AppUser) => {
    setUsers(prev => prev.filter(u => u.id !== user.id));
    deleteUserFromDb(user.id);
    setUserToDelete(null);
    toast({ title: t('deletedUser'), description: `${user.name} ${t('deletedSuccessfully')}` });
  };

  const handleSaveRole = (data: RoleFormValues, id?: string) => {
    if (id) {
      setRoles(prev => prev.map(r => r.id === id ? { ...r, ...data } : r));
      updateRole(id, data);
      toast({ title: t('updatedRole'), description: `${data.name} ${t('updatedSuccessfully')}` });
    } else {
      const newRole: Role = { id: data.name.toLowerCase().replace(/\s+/g, '-'), ...data };
      setRoles(prev => [...prev, newRole]);
      addRole(newRole);
      toast({ title: t('addedRole'), description: `${data.name} ${t('addedSuccessfully')}` });
    }
  };

  const handleDeleteRole = (role: Role) => {
    setRoles(prev => prev.filter(r => r.id !== role.id));
    deleteRoleFromDb(role.id);
    setRoleToDelete(null);
    toast({ title: t('deletedRole'), description: `${role.name} ${t('deletedSuccessfully')}` });
  };

  const handleSaveDepartment = (data: DepartmentFormValues, id?: string) => {
    if (id) {
      setDepartments(prev => prev.map(d => d.id === id ? { ...d, name: data.name as TranslationKey } : d));
      updateDepartment(id, data.name as TranslationKey);
      toast({ title: t('updatedDepartment'), description: `${data.name} ${t('updatedSuccessfully')}` });
    } else {
      const newDept = { id: Date.now().toString(), name: data.name as TranslationKey };
      setDepartments(prev => [...prev, newDept]);
      addDepartment(newDept);
      toast({ title: t('addedDepartment'), description: `${data.name} ${t('addedSuccessfully')}` });
    }
  };

  const handleDeleteDepartment = (department: { id: string; name: TranslationKey }) => {
    setDepartments(prev => prev.filter(d => d.id !== department.id));
    deleteDepartmentFromDb(department.id);
    setDepartmentToDelete(null);
    toast({ title: t('deletedDepartment'), description: `${department.name} ${t('deletedSuccessfully')}` });
  };

  // -------------------- Render --------------------
  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('settings')} />
      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-6">
        <Tabs defaultValue="users" className="space-y-6">
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="users">{t('users')}</TabsTrigger>
              <TabsTrigger value="roles">{t('roles')}</TabsTrigger>
              <TabsTrigger value="departments">{t('departments')}</TabsTrigger>
            </TabsList>
          </div>

          {/* Users */}
          <TabsContent value="users">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                  <CardTitle>{t('users')}</CardTitle>
                  <CardDescription>{t('usersDescription')}</CardDescription>
                </div>
                <Button onClick={() => handleOpenUserDialog()} className="w-full md:w-auto"><PlusCircle className="mr-2 h-4 w-4"/> {t('addUser')}</Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('name')}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t('email')}</TableHead>
                      <TableHead className="hidden md:table-cell">{t('phone')}</TableHead>
                      <TableHead>{t('role')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>{user.name}</TableCell>
                        <TableCell className="hidden sm:table-cell">{user.email}</TableCell>
                        <TableCell className="hidden md:table-cell">{user.phone}</TableCell>
                        <TableCell><Badge variant={getBadgeVariant(user.role)}>{user.role}</Badge></TableCell>
                        <TableCell className="flex gap-1 sm:gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenUserDialog(user)}><Pencil className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" onClick={() => { setUserForPasswordChange(user); setIsPasswordDialogOpen(true); }}><KeyRound className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setUserToDelete(user)}><Trash2 className="h-4 w-4"/></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Roles */}
          <TabsContent value="roles">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <div>
                  <CardTitle>{t('roles')}</CardTitle>
                  <CardDescription>{t('manageRoles')}</CardDescription>
                </div>
                <Button onClick={() => handleOpenRoleDialog()} className="w-full md:w-auto"><PlusCircle className="mr-2 h-4 w-4"/> {t('addRole')}</Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('roleName')}</TableHead>
                      <TableHead>{t('permissions')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map(role => (
                      <TableRow key={role.id}>
                        <TableCell>{role.name}</TableCell>
                        <TableCell className="max-w-xs md:max-w-md lg:max-w-lg">
                           <MultiSelect
                              options={permissionOptions.map(opt => ({...opt, label: t(opt.label.toLowerCase() as TranslationKey)}))}
                              selected={role.permissions}
                              onChange={(newPermissions) => handlePermissionsChange(role.id, newPermissions)}
                              placeholder={t('selectPermissions')}
                              className="min-w-[300px]"
                            />
                        </TableCell>
                        <TableCell className="flex gap-1 sm:gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenRoleDialog(role)}><Pencil className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRoleToDelete(role)}><Trash2 className="h-4 w-4"/></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Departments */}
          <TabsContent value="departments">
            <Card>
              <CardHeader className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
                <CardTitle>{t('departments')}</CardTitle>
                <Button onClick={() => handleOpenDepartmentDialog()} className="w-full md:w-auto"><PlusCircle className="mr-2 h-4 w-4"/> {t('addDepartment')}</Button>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('departmentName')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map(dept => (
                      <TableRow key={dept.id}>
                        <TableCell>{t(dept.name)}</TableCell>
                        <TableCell className="flex gap-1 sm:gap-2">
                          <Button size="sm" variant="ghost" onClick={() => handleOpenDepartmentDialog(dept)}><Pencil className="h-4 w-4"/></Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDepartmentToDelete(dept)}><Trash2 className="h-4 w-4"/></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dialogs */}
        <UserDialog user={currentUser} isOpen={isUserDialogOpen} onOpenChange={setIsUserDialogOpen} onSave={handleSaveUser} roles={roles} />
        <ChangePasswordDialog user={userForPasswordChange} isOpen={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen} />
        <RoleDialog role={currentRole} isOpen={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen} onSave={handleSaveRole} />
        <DepartmentDialog department={currentDepartment} isOpen={isDepartmentDialogOpen} onOpenChange={setIsDepartmentDialogOpen} onSave={handleSaveDepartment} />

        {/* AlertDialogs */}
        {userToDelete && (
          <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteUser')}</AlertDialogTitle>
                <AlertDialogDescription>{t('confirmDeleteUser', { name: userToDelete.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteUser(userToDelete)}>{t('delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {roleToDelete && (
          <AlertDialog open={!!roleToDelete} onOpenChange={() => setRoleToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteRole')}</AlertDialogTitle>
                <AlertDialogDescription>{t('confirmDeleteRole', { name: roleToDelete.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteRole(roleToDelete)}>{t('delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        {departmentToDelete && (
          <AlertDialog open={!!departmentToDelete} onOpenChange={() => setDepartmentToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteDepartment')}</AlertDialogTitle>
                <AlertDialogDescription>{t('confirmDeleteDepartment', { name: departmentToDelete.name })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleDeleteDepartment(departmentToDelete)}>{t('delete')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </main>
    </div>
  );
}
