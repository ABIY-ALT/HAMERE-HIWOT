'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Calendar,
  Music,
  Wallet,
  Package,
  UserCheck,
  BarChart3,
  Shield,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Building2,
  Vote,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useLang } from '@/contexts/LangContext';
import { canSeeNavItem } from '@/lib/permissions';
import type { PermissionCode } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Navigation Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface NavItem {
  labelEn: string;
  labelAm: string;
  href?: string;
  icon?: React.ElementType;
  permissions?: PermissionCode[];
  children?: NavItem[];
}

const NAV_SECTIONS: { sectionEn: string; sectionAm: string; items: NavItem[] }[] = [
  {
    sectionEn: 'Overview',
    sectionAm: 'አጠቃላይ እይታ',
    items: [
      {
        labelEn: 'Dashboard',
        labelAm: 'ዳሽቦርድ',
        href: '/dashboard',
        icon: LayoutDashboard,
        permissions: [],
      },
    ],
  },
  {
    sectionEn: 'Governance',
    sectionAm: 'አስተዳደር',
    items: [
      {
        labelEn: 'Governance',
        labelAm: 'አስተዳደር',
        icon: Vote,
        permissions: ['GOVERNANCE_VIEW'],
        children: [
          { labelEn: 'General Assembly', labelAm: 'ጠቅላላ ጉባኤ', href: '/dashboard/governance/general-assembly', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Audit Committee', labelAm: 'የአፈጻጸም ክትትል ጉባኤ', href: '/dashboard/governance/audit-committee', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Board of Management', labelAm: 'የሥራ አመራር ጉባኤ', href: '/dashboard/governance/management-board', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Executive Committee', labelAm: 'የሥራ አስፈጻሚ ጉባኤ', href: '/dashboard/governance/executive-committee', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Secretariat', labelAm: 'ጽሕፈት ቤት', href: '/dashboard/governance/secretariat', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Advisory Council', labelAm: 'አፈጻጸም አማካሪዎች', href: '/dashboard/governance/advisory-council', permissions: ['GOVERNANCE_VIEW'] },
        ],
      },
      {
        labelEn: 'Organization',
        labelAm: 'ድርጅት',
        icon: Building2,
        permissions: ['GOVERNANCE_VIEW'],
        children: [
          { labelEn: 'Coordinations', labelAm: 'ቅንጅቶች', href: '/dashboard/organization/coordinations', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Departments', labelAm: 'ክፍሎች', href: '/dashboard/organization/departments', permissions: ['GOVERNANCE_VIEW'] },
          { labelEn: 'Org Structure', labelAm: 'ድርጅታዊ መዋቅር', href: '/dashboard/organization/structure', permissions: ['GOVERNANCE_VIEW'] },
        ],
      },
    ],
  },
  {
    sectionEn: 'People',
    sectionAm: 'ሰዎች',
    items: [
      {
        labelEn: 'People',
        labelAm: 'ሰዎች',
        icon: Users,
        permissions: ['MEMBER_VIEW'],
        children: [
          { labelEn: 'Members', labelAm: 'አባላት', href: '/dashboard/people/members', permissions: ['MEMBER_VIEW'] },
          { labelEn: 'Students', labelAm: 'ተማሪዎች', href: '/dashboard/people/students', permissions: ['STUDENT_VIEW'] },
          { labelEn: 'Teachers', labelAm: 'አስተማሪዎች', href: '/dashboard/people/teachers', permissions: ['HR_VIEW'] },
          { labelEn: 'Servants', labelAm: 'አገልጋዮች', href: '/dashboard/people/servants', permissions: ['HR_VIEW'] },
          { labelEn: 'Choir Members', labelAm: 'ዘማሪዎች', href: '/dashboard/people/choir', permissions: ['MEMBER_VIEW'] },
        ],
      },
    ],
  },
  {
    sectionEn: 'Academic',
    sectionAm: 'አካዳሚክ',
    items: [
      {
        labelEn: 'Education',
        labelAm: 'ትምህርት',
        icon: GraduationCap,
        permissions: ['STUDENT_VIEW'],
        children: [
          { labelEn: 'Academic Years', labelAm: 'የትምህርት ዓመታት', href: '/dashboard/education/academic-years', permissions: ['STUDENT_VIEW'] },
          { labelEn: 'Classes', labelAm: 'ክፍሎች', href: '/dashboard/education/classes', permissions: ['STUDENT_VIEW'] },
          { labelEn: 'Subjects', labelAm: 'ትምህርቶች', href: '/dashboard/education/subjects', permissions: ['STUDENT_VIEW'] },
          { labelEn: 'Attendance', labelAm: 'ክትትል', href: '/dashboard/education/attendance', permissions: ['ATTENDANCE_VIEW'] },
          { labelEn: 'Exams & Grades', labelAm: 'ፈተናና ውጤቶች', href: '/dashboard/education/grades', permissions: ['GRADE_VIEW'] },
          { labelEn: 'Results', labelAm: 'ውጤቶች', href: '/dashboard/education/results', permissions: ['GRADE_VIEW'] },
        ],
      },
      {
        labelEn: 'Programs',
        labelAm: 'ፕሮግራሞች',
        icon: Calendar,
        permissions: ['PROGRAM_VIEW'],
        children: [
          { labelEn: 'Programs', labelAm: 'ፕሮግራሞች', href: '/dashboard/programs', permissions: ['PROGRAM_VIEW'] },
          { labelEn: 'Assemblies', labelAm: 'ስብሰባዎች', href: '/dashboard/programs/assemblies', permissions: ['PROGRAM_VIEW'] },
          { labelEn: 'Events', labelAm: 'ዝግጅቶች', href: '/dashboard/programs/events', permissions: ['PROGRAM_VIEW'] },
        ],
      },
      {
        labelEn: 'Sacred Arts',
        labelAm: 'ቅዱስ ጥበብ',
        icon: Music,
        permissions: ['MEMBER_VIEW'],
        children: [
          { labelEn: 'Choir', labelAm: 'ዘማሪ', href: '/dashboard/sacred-arts/choir', permissions: ['MEMBER_VIEW'] },
          { labelEn: 'Hymn Assignments', labelAm: 'የዜማ ምደባ', href: '/dashboard/sacred-arts/hymns', permissions: ['MEMBER_VIEW'] },
        ],
      },
    ],
  },
  {
    sectionEn: 'Administration',
    sectionAm: 'አስተዳደር',
    items: [
      {
        labelEn: 'Human Resources',
        labelAm: 'የሰው ሀብት',
        icon: UserCheck,
        permissions: ['HR_VIEW'],
        children: [
          { labelEn: 'Personnel', labelAm: 'ሠራተኞች', href: '/dashboard/hr/personnel', permissions: ['HR_VIEW'] },
          { labelEn: 'Assignments', labelAm: 'ምደባዎች', href: '/dashboard/hr/assignments', permissions: ['HR_VIEW'] },
          { labelEn: 'HR Attendance', labelAm: 'ክትትል', href: '/dashboard/hr/attendance', permissions: ['HR_VIEW'] },
          { labelEn: 'Discipline', labelAm: 'ዲሲፕሊን', href: '/dashboard/hr/discipline', permissions: ['HR_MANAGE'] },
        ],
      },
      {
        labelEn: 'Finance',
        labelAm: 'ፋይናንስ',
        icon: Wallet,
        permissions: ['FINANCE_VIEW', 'FINANCE_REQUEST', 'FINANCE_APPROVE', 'FINANCE_CREATE'],
        children: [
          {
            labelEn: 'Payment Requests',
            labelAm: 'የክፍያ ጥያቄዎች',
            href: '/dashboard/finance/requests',
            permissions: ['FINANCE_VIEW', 'FINANCE_REQUEST', 'FINANCE_APPROVE', 'FINANCE_CREATE'],
          },
          { labelEn: 'Income', labelAm: 'ገቢ', href: '/dashboard/finance/income', permissions: ['FINANCE_VIEW'] },
          { labelEn: 'Expenses', labelAm: 'ወጪ', href: '/dashboard/finance/expenses', permissions: ['FINANCE_VIEW'] },
          { labelEn: 'Budget', labelAm: 'በጀት', href: '/dashboard/finance/budget', permissions: ['FINANCE_VIEW'] },
          { labelEn: 'Donations', labelAm: 'ስጦታዎች', href: '/dashboard/finance/donations', permissions: ['FINANCE_VIEW'] },
        ],
      },
      {
        labelEn: 'Property',
        labelAm: 'ንብረት',
        icon: Package,
        permissions: ['ASSET_VIEW'],
        children: [
          { labelEn: 'Assets', labelAm: 'ንብረቶች', href: '/dashboard/property/assets', permissions: ['ASSET_VIEW'] },
          { labelEn: 'Custody', labelAm: 'ሃላፊነት', href: '/dashboard/property/custody', permissions: ['ASSET_VIEW'] },
          { labelEn: 'Transfers', labelAm: 'ዝውውር', href: '/dashboard/property/transfers', permissions: ['ASSET_VIEW'] },
          { labelEn: 'Maintenance', labelAm: 'ጥገና', href: '/dashboard/property/maintenance', permissions: ['ASSET_VIEW'] },
          { labelEn: 'Inventory', labelAm: 'ዝርዝር', href: '/dashboard/property/inventory', permissions: ['ASSET_VIEW'] },
        ],
      },
    ],
  },
  {
    sectionEn: 'Analysis',
    sectionAm: 'ትንተና',
    items: [
      {
        labelEn: 'Reports',
        labelAm: 'ሪፖርቶች',
        href: '/dashboard/reports',
        icon: BarChart3,
        permissions: ['REPORT_VIEW'],
      },
      {
        labelEn: 'Audit Trail',
        labelAm: 'ኦዲት ታሪክ',
        href: '/dashboard/audit',
        icon: Shield,
        permissions: ['AUDIT_VIEW_ALL'],
      },
    ],
  },
  {
    sectionEn: 'System',
    sectionAm: 'ስርዓት',
    items: [
      {
        labelEn: 'Administration',
        labelAm: 'ስርዓት አስተዳደር',
        icon: Settings,
        permissions: ['USER_MANAGE'],
        children: [
          { labelEn: 'System Users', labelAm: 'የስርዓት ተጠቃሚዎች', href: '/dashboard/admin/users', permissions: ['USER_MANAGE'] },
          { labelEn: 'Roles', labelAm: 'ሚናዎች', href: '/dashboard/admin/roles', permissions: ['ROLE_MANAGE'] },
          { labelEn: 'Permissions', labelAm: 'ፈቃዶች', href: '/dashboard/admin/permissions', permissions: ['ROLE_MANAGE'] },
          { labelEn: 'System Settings', labelAm: 'የስርዓት ቅንብሮች', href: '/dashboard/admin/settings', permissions: ['SYSTEM_CONFIGURE'] },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function NavItemLeaf({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const { t } = useLang();
  const isActive = item.href ? pathname === item.href || pathname.startsWith(item.href + '/') : false;
  const Icon = item.icon;

  return (
    <Link
      href={item.href ?? '#'}
      className={cn('sidebar-nav-item', isActive && 'active')}
      title={collapsed ? t(item.labelEn, item.labelAm) : undefined}
    >
      {Icon && <Icon size={18} className="flex-shrink-0" />}
      {!collapsed && (
        <span className="truncate">{t(item.labelEn, item.labelAm)}</span>
      )}
    </Link>
  );
}

function NavItemGroup({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const pathname = usePathname();
  const { t } = useLang();
  const { user } = useAuth();
  const Icon = item.icon;

  const hasActiveChild = item.children?.some(
    (c) => c.href && (pathname === c.href || pathname.startsWith(c.href + '/'))
  );

  const [open, setOpen] = useState(hasActiveChild ?? false);

  const visibleChildren = item.children?.filter((c) =>
    canSeeNavItem(user, c.permissions ?? [])
  );

  if (!visibleChildren?.length) return null;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn('sidebar-nav-item w-full', hasActiveChild && !open && 'active')}
        title={collapsed ? t(item.labelEn, item.labelAm) : undefined}
      >
        {Icon && <Icon size={18} className="flex-shrink-0" />}
        {!collapsed && (
          <>
            <span className="truncate flex-1 text-left">{t(item.labelEn, item.labelAm)}</span>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-6 mt-0.5">
          {visibleChildren.map((child) => (
            <NavItemLeaf key={child.href} item={child} collapsed={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Sidebar
// ─────────────────────────────────────────────────────────────────────────────

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapse: () => void;
  onCloseMobile: () => void;
}

export default function Sidebar({ collapsed, mobileOpen, onToggleCollapse, onCloseMobile }: SidebarProps) {
  const { user } = useAuth();
  const { t } = useLang();

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onCloseMobile} />
      )}

      <nav
        className={cn(
          'sidebar',
          collapsed && 'sidebar-collapsed',
          mobileOpen && 'open'
        )}
      >
        {/* Brand */}
        <div className="brand-logo">
          <div className="brand-icon">
            <Image
              src="/logo.png"
              alt="ሳሎ ደብረ ፀሐይ ሐመረ ሕይወት ሰንበት ት/ቤት"
              width={42}
              height={42}
              priority
            />
          </div>
          {!collapsed && (
            <div className="brand-text">
              <div className="name">{t('Hamere Hiwot', 'ሐመረ ሕይወት')}</div>
              <div className="sub">{t('Sallo Debre Tsehay SSMS', 'ሳሎ ደ/ፀ/ቅ/ጊዮርጊስ ሰ/ት/ቤት')}</div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 py-3">
          {NAV_SECTIONS.map((section) => {
            const visibleItems = section.items.filter((item) =>
              canSeeNavItem(user, item.permissions ?? [])
            );
            if (!visibleItems.length) return null;

            return (
              <div key={section.sectionEn} className="mb-1">
                {!collapsed && (
                  <div className="sidebar-section-label">
                    {t(section.sectionEn, section.sectionAm)}
                  </div>
                )}
                {visibleItems.map((item) =>
                  item.children ? (
                    <NavItemGroup key={item.labelEn} item={item} collapsed={collapsed} />
                  ) : (
                    <NavItemLeaf key={item.labelEn} item={item} collapsed={collapsed} />
                  )
                )}
              </div>
            );
          })}
        </div>

        {/* User info at bottom */}
        {!collapsed && user && (
          <div className="border-t border-white/10 p-3 mt-auto">
            <div className="flex items-center gap-2 px-2 py-2 rounded-lg">
              <div className="avatar text-xs">
                {user.person.full_name_en
                  .split(' ')
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-white truncate">
                  {user.person.full_name_en}
                </div>
                <div className="text-xs text-white/40 truncate">
                  {user.systemUser.username}
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Floating collapse toggle on the sidebar edge (outside the scroll container so it isn't clipped) */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="sidebar-collapse-btn hidden md:flex"
        style={{ left: collapsed ? 54 : 246 }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      {/* Mobile: same button on the drawer edge closes the menu */}
      {mobileOpen && (
        <button
          type="button"
          onClick={onCloseMobile}
          className="sidebar-collapse-btn flex md:hidden"
          style={{ left: 246 }}
          title={t('Close menu', 'ምናሌ ዝጋ')}
          aria-label={t('Close menu', 'ምናሌ ዝጋ')}
        >
          <ChevronLeft size={16} />
        </button>
      )}
    </>
  );
}
