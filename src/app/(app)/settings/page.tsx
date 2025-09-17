
'use client';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from '@/hooks/use-translation';
import { PlusCircle, Pencil, KeyRound, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { appUsers, addUser, updateUser, deleteUser as deleteUserFromDb, rolesData, updateRole, classesData, addRole, deleteRole as deleteRoleFromDb, updateUserPassword, departmentsData as mockDepartments, addDepartment, updateDepartment, deleteDepartment as deleteDepartmentFromDb } from '@/lib/mock-data';
import type { AppUser, Role, Permission } from '@/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import React, { useState, useEffect } from 'react';
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

const userFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\d{10}$/, 'Phone number must be 10 digits'),
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


function UserDialog({
  user,
  isOpen,
  onOpenChange,
  onSave,
  roles,
}: {
  user: Partial<AppUser> | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: UserFormValues, id?: number) => void;
  roles: Role[];
}) {
  const { t } = useTranslation();
  const isEditMode = user && user.id;

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      role: user?.role || undefined,
      assignedClasses: user?.assignedClasses || [],
    }
  });
  
  const selectedRoleName = form.watch('role');
  const roleObject = roles.find(r => r.name === selectedRoleName);
  const roleHasClassPermission = roleObject?.permissions.includes('Classes');

  React.useEffect(() => {
    form.reset({
      name: user?.name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      role: user?.role || undefined,
      assignedClasses: user?.assignedClasses || [],
    });
  }, [user, form]);

  const handleSubmit = (data: UserFormValues) => {
    onSave(data, user?.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditMode ? t('edit') : t('addUser')}</DialogTitle>
          <DialogDescription>
            {isEditMode ? t('editUserDescription') : t('addUserDescription')}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem><FormLabel>{t('name')}</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>{t('email')}</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="phone" render={({ field }) => (
              <FormItem><FormLabel>{t('phoneNumber')}</FormLabel><FormControl><Input type="tel" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="role" render={({ field }) => (
              <FormItem>
                <FormLabel>{t('roles')}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder={t('selectRole')} /></SelectTrigger></FormControl>
                  <SelectContent>
                    {roles.map(role => {
                        const roleTranslationKey = role.name.toLowerCase().replace(/\s/g, '') as TranslationKey;
                        return (
                            <SelectItem key={role.id} value={role.name}>
                                {t(roleTranslationKey) || role.name}
                            </SelectItem>
                        );
                    })}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            
            {roleHasClassPermission && (
               <FormField
                  control={form.control}
                  name="assignedClasses"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('assignedClasses')}</FormLabel>
                      <MultiSelect
                        options={classesData.map(c => ({ value: c.id, label: t(c.name)}))}
                        selected={field.value || []}
                        onChange={field.onChange}
                        placeholder={t('selectClasses')}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
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

function ChangePasswordDialog({
  user,
  isOpen,
  onOpenChange,
}: {
  user: AppUser | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);

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
    toast({
      title: "Password Changed",
      description: `The password for ${user.name} has been updated.`,
    });
    onOpenChange(false);
  };

  React.useEffect(() => {
    if (!isOpen) {
      form.reset();
      setShowNewPassword(false);
      setShowConfirmPassword(false);
    }
  }, [isOpen, form]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('changePasswordFor', { name: user?.name || '' })}</DialogTitle>
          <DialogDescription>
            {t('changePasswordDescription')}
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
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('cancel')}</Button>
              <Button type="submit">{t('saveNewPassword')}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const permissionOptions = [
    { value: 'Dashboard', label: 'Dashboard' },
    { value: 'Students', label: 'Students' },
    { value: 'Classes', label: 'Classes' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Departments', label: 'Departments' },
    { value: 'Reports', label: 'Reports' },
    { value: 'Settings', label: 'Settings' },
];

function RoleDialog({
    role,
    isOpen,
    onOpenChange,
    onSave
}: {
    role: Partial<Role> | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: RoleFormValues, id?: string) => void;
}) {
    const { t } = useTranslation();
    const isEditMode = role && role.id;

    const form = useForm<RoleFormValues>({
        resolver: zodResolver(roleFormSchema),
        defaultValues: {
            name: role?.name || '',
            permissions: (role?.permissions as string[]) || [],
        },
    });

    React.useEffect(() => {
        form.reset({
            name: role?.name || '',
            permissions: (role?.permissions as string[]) || [],
        });
    }, [role, form]);

    const handleSubmit = (data: RoleFormValues) => {
        onSave(data, role?.id);
        onOpenChange(false);
    };
    
    const translatedPermissionOptions = permissionOptions.map(opt => ({...opt, label: t(opt.label.toLowerCase() as TranslationKey)}));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditMode ? t('editRole') : t('addRole')}</DialogTitle>
                    <DialogDescription>
                        {isEditMode ? t('editRoleDescription') : t('addRoleDescription')}
                    </DialogDescription>
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
                                <MultiSelect
                                    options={translatedPermissionOptions}
                                    selected={field.value}
                                    onChange={field.onChange}
                                    placeholder={t('selectPermissions')}
                                />
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

function DepartmentDialog({
    department,
    isOpen,
    onOpenChange,
    onSave
}: {
    department: { id: string; name: TranslationKey } | null;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSave: (data: DepartmentFormValues, id?: string) => void;
}) {
    const { t } = useTranslation();
    const isEditMode = department && department.id;

    const form = useForm<DepartmentFormValues>({
        resolver: zodResolver(departmentFormSchema),
        defaultValues: {
            name: department ? t(department.name) : '',
        },
    });

    React.useEffect(() => {
        form.reset({
            name: department ? t(department.name) : '',
        });
    }, [department, form, t]);

    const handleSubmit = (data: DepartmentFormValues) => {
        onSave(data, department?.id);
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEditMode ? t('edit') : t('addDepartment')}</DialogTitle>
                    <DialogDescription>
                        {isEditMode ? t('editUserDescription') : t('addUserDescription')}
                    </DialogDescription>
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


export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [users, setUsers] = useState<AppUser[]>(appUsers);
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

  const handleOpenUserDialog = (user: Partial<AppUser> | null = null) => {
    setCurrentUser(user);
    setIsUserDialogOpen(true);
  };
  
  const handleOpenRoleDialog = (role: Partial<Role> | null = null) => {
    setCurrentRole(role);
    setIsRoleDialogOpen(true);
  };
  
  const handleOpenDepartmentDialog = (department: { id: string; name: TranslationKey } | null = null) => {
    setCurrentDepartment(department);
    setIsDepartmentDialogOpen(true);
  };


  const handleOpenPasswordDialog = (user: AppUser) => {
    setUserForPasswordChange(user);
    setIsPasswordDialogOpen(true);
  };

  const handleSaveUser = (data: UserFormValues, id?: number) => {
    if (id) {
      updateUser(id, data as Partial<AppUser>);
      toast({ title: t('userUpdated'), description: t('userUpdatedSuccessMessage') });
    } else {
      const newUser = { id: Date.now(), ...data };
      addUser(newUser as AppUser);
      toast({ title: t('userAdded'), description: t('userAddedSuccessMessage') });
    }
    setUsers([...appUsers]);
  };
  
  const handleSaveRole = (data: RoleFormValues, id?: string) => {
      if (id) {
          updateRole(id, data as Partial<Role>);
          toast({ title: t('roleUpdated'), description: t('roleUpdatedSuccessMessage') });
      } else {
          const newRole = { id: data.name.toLowerCase().replace(/\s+/g, '-'), ...data };
          addRole(newRole as Role);
          toast({ title: t('roleAdded'), description: t('roleAddedSuccessMessage') });
      }
      setRoles([...rolesData]);
  };
  
  const handleSaveDepartment = (data: DepartmentFormValues, id?: string) => {
      if (id) {
          updateDepartment(id, data.name);
          toast({ title: t('departmentUpdated'), description: t('departmentUpdatedSuccessMessage') });
      } else {
          addDepartment(data.name);
          toast({ title: t('departmentAdded'), description: t('departmentAddedSuccessMessage') });
      }
      setDepartments([...mockDepartments]);
  };

  const handleDeleteUser = (user: AppUser) => {
    setUserToDelete(user);
  };
  
  const handleDeleteRole = (role: Role) => {
      setRoleToDelete(role);
  };
  
  const handleDeleteDepartment = (department: { id: string, name: TranslationKey }) => {
    setDepartmentToDelete(department);
  };

  const confirmDeleteUser = () => {
    if (userToDelete) {
      deleteUserFromDb(userToDelete.id);
      setUsers([...appUsers]);
      toast({ title: "User Deleted", description: `${userToDelete.name} has been removed.` });
      setUserToDelete(null);
    }
  };
  
  const confirmDeleteRole = () => {
      if (roleToDelete) {
          deleteRoleFromDb(roleToDelete.id);
          setRoles([...rolesData]);
          toast({ title: t('roleDeleted'), description: t('roleDeletedSuccessMessage', { name: roleToDelete.name }) });
          setRoleToDelete(null);
      }
  };
  
  const confirmDeleteDepartment = () => {
    if (departmentToDelete) {
      deleteDepartmentFromDb(departmentToDelete.id);
      setDepartments([...mockDepartments]);
      toast({ title: t('departmentDeleted'), description: `The department '${t(departmentToDelete.name)}' has been removed.` });
      setDepartmentToDelete(null);
    }
  };
  
  const handlePermissionsChange = (roleId: string, permissions: string[]) => {
      const newRoles = roles.map(role => 
          role.id === roleId ? { ...role, permissions: permissions as Permission[] } : role
      );
      setRoles(newRoles);
      updateRole(roleId, { permissions: permissions as Permission[] });
  }
  
  const translatedPermissionOptions = permissionOptions.map(opt => ({...opt, label: t(opt.label.toLowerCase() as TranslationKey)}));

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header title={t('settings')} />
      <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-2xl">{t('settings')}</CardTitle>
            <CardDescription>{t('settingsDescription')}</CardDescription>
          </CardHeader>
        </Card>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList>
            <TabsTrigger value="users">{t('users')}</TabsTrigger>
            <TabsTrigger value="roles">{t('roles')}</TabsTrigger>
            <TabsTrigger value="departments">{t('departments')}</TabsTrigger>
            <TabsTrigger value="general">{t('general')}</TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('users')}</CardTitle>
                  <CardDescription>{t('usersDescription')}</CardDescription>
                </div>
                <Button onClick={() => handleOpenUserDialog()}>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  {t('addUser')}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('name')}</TableHead>
                      <TableHead>{t('email')}</TableHead>
                      <TableHead>{t('phoneNumber')}</TableHead>
                      <TableHead>{t('roles')}</TableHead>
                      <TableHead>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => {
                      const roleTranslationKey = user.role.toLowerCase().replace(/\s/g, '') as TranslationKey;
                      return (
                        <TableRow key={user.id}>
                          <TableCell className="font-medium">{user.name}</TableCell>
                          <TableCell>{user.email}</TableCell>
                          <TableCell>{user.phone}</TableCell>
                          <TableCell>
                            <Badge variant={getBadgeVariant(user.role)}>
                              {t(roleTranslationKey) || user.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleOpenUserDialog(user)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenPasswordDialog(user)}>
                                <KeyRound className="h-4 w-4" />
                              </Button>
                              {user.role !== 'Admin' && (
                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteUser(user)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="roles">
             <Card>
                <CardHeader  className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>{t('roles')}</CardTitle>
                        <CardDescription>{t('manageRoles')}</CardDescription>
                    </div>
                     <Button onClick={() => handleOpenRoleDialog()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {t('addRole')}
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('role')}</TableHead>
                                <TableHead>{t('permissions')}</TableHead>
                                <TableHead>{t('actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {roles.map((role) => {
                                const roleTranslationKey = role.name.toLowerCase().replace(/\s/g, '') as TranslationKey;
                                return (
                                <TableRow key={role.id}>
                                    <TableCell className="font-medium">{t(roleTranslationKey) || role.name}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {(role.permissions as string[]).map(p => <Badge variant="outline" key={p}>{t(p.toLowerCase() as TranslationKey)}</Badge>)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                         <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenRoleDialog(role)}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            {role.name !== 'Admin' && (
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteRole(role)} disabled={['admin', 'teacher', 'chiefofficer'].includes(role.id)}>
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>
                                    </TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                    </Table>
                </CardContent>
             </Card>
          </TabsContent>
          <TabsContent value="departments">
             <Card>
                <CardHeader  className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>{t('departments')}</CardTitle>
                        <CardDescription>{t('manageDepartmentsDescription')}</CardDescription>
                    </div>
                     <Button onClick={() => handleOpenDepartmentDialog()}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        {t('addDepartment')}
                    </Button>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('departmentName')}</TableHead>
                                <TableHead>{t('actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {departments.map((dept) => (
                                <TableRow key={dept.id}>
                                    <TableCell className="font-medium">{t(dept.name)}</TableCell>
                                    <TableCell>
                                         <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleOpenDepartmentDialog(dept)}>
                                              <Pencil className="h-4 w-4" />
                                            </Button>
                                            {!['secretariat'].includes(dept.id) && (
                                              <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDeleteDepartment(dept)}>
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
             </Card>
          </TabsContent>
           <TabsContent value="general">
             <Card>
                <CardHeader>
                    <CardTitle>{t('general')}</CardTitle>
                    <CardDescription>{t('manageGeneralSettings')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="church-name">{t('churchName')}</Label>
                        <Input id="church-name" defaultValue="Salo Debre Tsehay St. George Church" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="system-language">{t('defaultLanguage')}</Label>
                        <Input id="system-language" defaultValue="English" />
                    </div>
                     <div className="space-y-2">
                        <Label htmlFor="default-password">{t('defaultPassword')}</Label>
                        <Input id="default-password" readOnly value="password123" />
                         <p className="text-sm text-muted-foreground">{t('defaultPasswordDescription')}</p>
                    </div>
                    <Button>{t('saveChanges')}</Button>
                </CardContent>
             </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      <UserDialog 
        user={currentUser}
        isOpen={isUserDialogOpen}
        onOpenChange={setIsUserDialogOpen}
        onSave={handleSaveUser}
        roles={roles}
      />

      <ChangePasswordDialog 
        user={userForPasswordChange}
        isOpen={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      />
      
      <RoleDialog
        role={currentRole}
        isOpen={isRoleDialogOpen}
        onOpenChange={setIsRoleDialogOpen}
        onSave={handleSaveRole}
      />
      
      <DepartmentDialog
        department={currentDepartment}
        isOpen={isDepartmentDialogOpen}
        onOpenChange={setIsDepartmentDialogOpen}
        onSave={handleSaveDepartment}
      />

      <AlertDialog open={!!userToDelete} onOpenChange={() => setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteUserWarning', { name: userToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteUser}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <AlertDialog open={!!roleToDelete} onOpenChange={() => setRoleToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
                {t('deleteRoleWarning', { name: roleToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRoleToDelete(null)}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteRole}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
       <AlertDialog open={!!departmentToDelete} onOpenChange={() => setDepartmentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('areYouSure')}</AlertDialogTitle>
            <AlertDialogDescription>
                {t('deleteDepartmentWarning', { name: departmentToDelete ? t(departmentToDelete.name) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDepartmentToDelete(null)}>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDepartment}>{t('delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

    

