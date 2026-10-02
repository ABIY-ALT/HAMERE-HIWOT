'use client';

import React, { useState } from 'react';
import { Plus, CheckCircle2 } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { MOCK_PERSONNEL } from '@/lib/mock/modules';
import { Modal } from '@/components/ui/Modal';

interface AssignmentItem {
  id: string;
  name_en: string;
  name_am: string;
  role: string;
  role_am: string;
  dept: string;
  dept_am: string;
  joined: string;
}

export default function AssignmentsPage() {
  const { t, locale } = useLang();
  const [assignments, setAssignments] = useState<AssignmentItem[]>(MOCK_PERSONNEL as AssignmentItem[]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [reassignItem, setReassignItem] = useState<AssignmentItem | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form State
  const [nameEn, setNameEn] = useState('');
  const [nameAm, setNameAm] = useState('');
  const [roleEn, setRoleEn] = useState('Department Unit Lead');
  const [roleAm, setRoleAm] = useState('የክፍል ንዑስ አስተባባሪ');
  const [deptEn, setDeptEn] = useState('Education Department');
  const [deptAm, setDeptAm] = useState('የትምህርት ክፍል');

  // Reassign Form State
  const [newRoleEn, setNewRoleEn] = useState('');
  const [newDeptEn, setNewDeptEn] = useState('Education Department');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleAddAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    const newAssign: AssignmentItem = {
      id: `asg-${Date.now()}`,
      name_en: nameEn,
      name_am: nameAm || nameEn,
      role: roleEn,
      role_am: roleAm || roleEn,
      dept: deptEn,
      dept_am: deptAm || deptEn,
      joined: new Date().toISOString().slice(0, 10),
    };

    setAssignments([newAssign, ...assignments]);
    setIsAddModalOpen(false);
    showToast(t(`New role assignment recorded for ${nameEn}!`, `ለ${nameAm || nameEn} አዲስ ምደባ ተመዝግቧል!`));

    // Reset
    setNameEn('');
    setNameAm('');
  };

  const handleSaveReassign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignItem) return;
    setAssignments(
      assignments.map((a) =>
        a.id === reassignItem.id
          ? {
              ...a,
              role: newRoleEn || a.role,
              role_am: newRoleEn || a.role_am,
              dept: newDeptEn,
              dept_am: newDeptEn,
            }
          : a
      )
    );
    showToast(t(`Reassigned ${reassignItem.name_en} to ${newDeptEn}!`, `${reassignItem.name_am || reassignItem.name_en} ወደ ${newDeptEn} ተዛውሯል!`));
    setReassignItem(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 size={18} className="text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t('Departmental Staff Assignments', 'የክፍል ምደባዎች')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {t(
              'Organizational deployment of teachers, officers, and servants across 7 departments and 7 coordinations',
              'በ7ቱ ክፍሎች እና በ7ቱ ቅንጅቶች የተከናወኑ የአገልጋዮች ምደባ'
            )}
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="btn btn-primary self-start sm:self-auto inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t('New Role Assignment', 'አዲስ ምደባ')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="table-container rounded-none border-0">
          <table>
            <thead>
              <tr>
                <th>{t('Personnel', 'ሠራተኛ')}</th>
                <th>{t('Primary Designation', 'ዋና ኃላፊነት')}</th>
                <th>{t('Target Department / Coordination', 'የተመደቡበት ክፍል')}</th>
                <th>{t('Effective Date', 'የተመደበበት ቀን')}</th>
                <th>{t('Status', 'ሁኔታ')}</th>
                <th className="text-right">{t('Action', 'ተግባር')}</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-slate-900">
                    {locale === 'am' ? p.name_am : p.name_en}
                  </td>
                  <td>
                    <span className="badge badge-info">{locale === 'am' ? p.role_am : p.role}</span>
                  </td>
                  <td className="text-slate-700 text-xs font-medium">
                    {locale === 'am' ? p.dept_am : p.dept}
                  </td>
                  <td className="text-slate-500 text-xs font-mono">{p.joined}</td>
                  <td>
                    <span className="badge badge-success">{t('Assigned', 'የተመደበ')}</span>
                  </td>
                  <td className="text-right">
                    <button
                      onClick={() => {
                        setReassignItem(p);
                        setNewRoleEn(p.role);
                        setNewDeptEn(p.dept);
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                    >
                      {t('Reassign', 'ዳግም መድብ')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Role Assignment Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('Assign Personnel to Department', 'አዲስ የአገልግሎት ምደባ መዝግብ')}
        subtitle={t('Deploy Sunday school servant to designated department or coordination', 'አገልጋዩን ለተወሰነ ክፍል ወይም ቅንጅት ይመድቡ')}
      >
        <form onSubmit={handleAddAssignment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Personnel Name (English)', 'የአገልጋይ ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Deacon Michael"
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Personnel Name (Amharic)', 'የአገልጋይ ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="ለምሳሌ: ዲ/ን ሚካኤል"
                className="form-input text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Title (English)', 'የኃላፊነት ስም (እንግሊዝኛ)')} *
              </label>
              <input
                type="text"
                required
                value={roleEn}
                onChange={(e) => setRoleEn(e.target.value)}
                className="form-input text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('Role Title (Amharic)', 'የኃላፊነት ስም (አማርኛ)')}
              </label>
              <input
                type="text"
                value={roleAm}
                onChange={(e) => setRoleAm(e.target.value)}
                className="form-input text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('Target Department', 'የሚመደቡበት ክፍል')} *
            </label>
            <select
              value={deptEn}
              onChange={(e) => {
                setDeptEn(e.target.value);
                if (e.target.value === 'Education Department') setDeptAm('የትምህርት ክፍል');
                if (e.target.value === 'Choir Department') setDeptAm('የዝማሬ ክፍል');
                if (e.target.value === 'Property Department') setDeptAm('የንብረት ክፍል');
                if (e.target.value === 'Finance Department') setDeptAm('የፋይናንስ ክፍል');
              }}
              className="form-input text-sm"
            >
              <option value="Education Department">Education Department (የትምህርት ክፍል)</option>
              <option value="Choir Department">Choir Department (የዝማሬ ክፍል)</option>
              <option value="Property Department">Property Department (የንብረት ክፍል)</option>
              <option value="Finance Department">Finance Department (የፋይናንስ ክፍል)</option>
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="btn btn-secondary text-xs py-2"
            >
              {t('Cancel', 'ሰርዝ')}
            </button>
            <button type="submit" className="btn btn-primary text-xs py-2 px-4">
              {t('Confirm Assignment', 'ምደባውን አረጋግጥ')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reassign Modal */}
      {reassignItem && (
        <Modal
          isOpen={Boolean(reassignItem)}
          onClose={() => setReassignItem(null)}
          title={t('Reassign Staff Member', 'የአገልጋይ ምደባ ቀይር')}
          subtitle={`${locale === 'am' ? reassignItem.name_am : reassignItem.name_en} • Current: ${reassignItem.dept}`}
        >
          <form onSubmit={handleSaveReassign} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('New Role Title', 'አዲስ ኃላፊነት')} *
              </label>
              <input
                type="text"
                required
                value={newRoleEn}
                onChange={(e) => setNewRoleEn(e.target.value)}
                className="form-input text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('New Department', 'አዲስ ክፍል')} *
              </label>
              <select
                value={newDeptEn}
                onChange={(e) => setNewDeptEn(e.target.value)}
                className="form-input text-sm"
              >
                <option value="Education Department">Education Department (የትምህርት ክፍል)</option>
                <option value="Choir Department">Choir Department (የዝማሬ ክፍል)</option>
                <option value="Property Department">Property Department (የንብረት ክፍል)</option>
                <option value="Finance Department">Finance Department (የፋይናንስ ክፍል)</option>
                <option value="Youth Fellowship">Youth Fellowship (የወጣቶች ክፍል)</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReassignItem(null)}
                className="btn btn-secondary text-xs py-2"
              >
                {t('Cancel', 'ሰርዝ')}
              </button>
              <button type="submit" className="btn btn-primary text-xs py-2 px-4">
                {t('Save Changes', 'ለውጦችን መዝግብ')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
