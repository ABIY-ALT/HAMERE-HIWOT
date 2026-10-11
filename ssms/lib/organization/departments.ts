// ─────────────────────────────────────────────────────────────────────────────
// The Sunday school's departments (ክፍሎች) as the paper forms name them — one
// list for the asset template ("ባለቤት ክፍል", codes TM…DK, per-department files
// public/templates/departments/<code>.xlsx) and for the member registration
// form ("ማገልገል የሚፈልጉበት ክፍል"). unitCode = organization_units.code it
// belongs to in the app.
// ─────────────────────────────────────────────────────────────────────────────

export interface SchoolDepartment {
  code: string;
  name: string;
  name_en: string;
  unitCode: string;
}

export const SCHOOL_DEPARTMENTS: SchoolDepartment[] = [
  { code: 'TM', name: 'ትምህርት ክፍል', name_en: 'Education', unitCode: 'DEPT_EDUCATION' },
  { code: 'MZ', name: 'መዝሙር ክፍል', name_en: 'Hymns (Mezmur)', unitCode: 'DEPT_SACRED_ARTS' },
  { code: 'KT', name: 'ኪነ ጥበብ ክፍል', name_en: 'Arts (Kine-tibeb)', unitCode: 'DEPT_SACRED_ARTS' },
  { code: 'HS', name: 'ሕጻናት ክፍል', name_en: 'Children', unitCode: 'DEPT_EDUCATION' },
  { code: 'AG', name: 'አባላት ጉዳይ ክፍል', name_en: 'Member affairs', unitCode: 'DEPT_HR' },
  { code: 'LM', name: 'ልማትና ገቢ ማስገኛ ክፍል', name_en: 'Development & income', unitCode: 'DEPT_DEVELOPMENT' },
  { code: 'MD', name: 'ሚዲያና ቴክኖሎጂ ክፍል', name_en: 'Media & technology', unitCode: 'COORD_MEDIA' },
  { code: 'HN', name: 'ሒሳብና ንብረት ክፍል', name_en: 'Finance & property', unitCode: 'DEPT_FINANCE_PROPERTY' },
  { code: 'TS', name: 'ጽሕፈት ቤት', name_en: 'Office (secretariat)', unitCode: 'EXECUTIVE_SECRETARIAT' },
  { code: 'DK', name: 'የዲኮር ኮሚቴ', name_en: 'Decoration committee', unitCode: 'DEPT_PROGRAMS' },
];
