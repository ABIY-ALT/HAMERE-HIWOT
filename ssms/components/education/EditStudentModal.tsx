'use client';

import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useLang } from '@/contexts/LangContext';
import { Modal } from '@/components/ui/Modal';
import { updateStudent, useEducation } from '@/lib/education/client';
import type { Student, StudentGender, StudentStatus } from '@/lib/students/store';

/** Edit a student's details, class (this academic year) and active status. */
export function EditStudentModal({
  student,
  onClose,
  onSaved,
}: {
  student: Student;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, locale } = useLang();
  const { classes } = useEducation();

  const [nameEn, setNameEn] = useState(student.name_en);
  const [nameAm, setNameAm] = useState(student.name_am);
  const [baptismal, setBaptismal] = useState(student.baptismal);
  const [gender, setGender] = useState<StudentGender>(student.gender);
  const [classId, setClassId] = useState(student.class_id);
  const [parent, setParent] = useState(student.parent);
  const [phone, setPhone] = useState(student.phone);
  const [status, setStatus] = useState<StudentStatus>(student.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const res = await updateStudent(student.id, {
      name_en: nameEn.trim(),
      name_am: nameAm.trim(),
      baptismal: baptismal.trim(),
      gender,
      class_id: classId,
      parent: parent.trim(),
      phone: phone.trim(),
      status,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('Edit Student', 'ተማሪ አርትዕ')}
      subtitle={`${student.reg_no} • ${locale === 'am' ? student.name_am : student.name_en}`}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('Student Name (English)', 'የተማሪ ስም (እንግሊዝኛ)') + ' *'}>
            <input type="text" required value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Student Name (Amharic)', 'የተማሪ ስም (አማርኛ)')}>
            <input type="text" value={nameAm} onChange={(e) => setNameAm(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Baptismal Name', 'የክርስትና ስም')}>
            <input type="text" value={baptismal} onChange={(e) => setBaptismal(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Gender', 'ፆታ')}>
            <select value={gender} onChange={(e) => setGender(e.target.value as StudentGender)} className="form-input text-sm">
              <option value="MALE">{t('Male', 'ወንድ')}</option>
              <option value="FEMALE">{t('Female', 'ሴት')}</option>
            </select>
          </Field>
          <Field label={t('Class (this academic year)', 'ክፍል (በዚህ የትምህርት ዓመት)')}>
            <select value={classId} onChange={(e) => setClassId(e.target.value)} className="form-input text-sm">
              {!classId && <option value="">{t('— Not in a class —', '— ክፍል የለውም —')}</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{locale === 'am' ? c.name_am : c.name_en}</option>
              ))}
            </select>
          </Field>
          <Field label={t('Status', 'ሁኔታ')}>
            <select value={status} onChange={(e) => setStatus(e.target.value as StudentStatus)} className="form-input text-sm">
              <option value="ACTIVE">{t('Active', 'ንቁ')}</option>
              <option value="INACTIVE">{t('Inactive (left / stopped)', 'የቦዘነ (የለቀቀ)')}</option>
            </select>
          </Field>
          <Field label={t('Parent / Guardian Name', 'የወላጅ / አሳዳጊ ስም')}>
            <input type="text" value={parent} onChange={(e) => setParent(e.target.value)} className="form-input text-sm" />
          </Field>
          <Field label={t('Guardian Phone', 'የወላጅ ስልክ')}>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="form-input text-sm" />
          </Field>
        </div>

        {status === 'INACTIVE' && student.status === 'ACTIVE' && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t(
              'Inactive students are kept with their history but no longer appear on roll calls.',
              'የቦዘኑ ተማሪዎች ታሪካቸው ይቀመጣል፤ ግን በስም ጥሪ ላይ አይታዩም።'
            )}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn btn-secondary text-xs">
            {t('Cancel', 'ሰርዝ')}
          </button>
          <button type="submit" disabled={busy} className="btn btn-primary text-xs disabled:opacity-60">
            {busy ? t('Saving…', 'በመመዝገብ ላይ…') : t('Save Changes', 'ለውጦችን አስቀምጥ')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}
