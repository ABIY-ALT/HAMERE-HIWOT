// Sample notifications shown in demo mode (bell and dashboard)

import type { Notice } from '@/app/dashboard/actions';

export const DEMO_NOTICES: Notice[] = [
  { id: 'demo-1', version: '1', kind: 'alert', href: '/dashboard/finance/requests', at: null, en: '2 payment requests are waiting for your approval', am: '2 የክፍያ ጥያቄዎች የእርስዎን ማጽደቅ ይጠብቃሉ' },
  { id: 'demo-2', version: '1', kind: 'info', href: '/dashboard/hr/attendance', at: null, en: "Take today's servant attendance", am: 'የዛሬውን የአገልጋዮች ተገኝነት ይያዙ' },
  { id: 'demo-3', version: '1', kind: 'success', href: '/dashboard/finance/requests', at: null, en: 'Your request FR-2026-0003 was approved', am: 'ጥያቄዎ FR-2026-0003 ጸድቋል' },
];
