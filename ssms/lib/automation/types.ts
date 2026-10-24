// ─────────────────────────────────────────────────────────────────────────────
// Daily automation — settings and results, with no server code, so the
// Administration → Automation page (a client page) can use them too.
// The jobs themselves are lib/automation/jobs.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** system_settings key: which jobs run */
export const AUTOMATION_KEY = 'automation';
/** system_settings key: what the last run did */
export const LAST_RUN_KEY = 'automation_last_run';

export interface AutomationSettings {
  /** The day before a program marked "public website": a message to everyone connected to the bot */
  event_reminders: boolean;
  /** The day before a choir service: a message to each member on its published roster */
  roster_reminders: boolean;
  /** Vestments past their return day: the holder is reminded (again a week later if still out) */
  vestment_reminders: boolean;
  /** Library books at home: the day before the return day, then weekly while late — the borrower (and a student's parents) */
  library_reminders: boolean;
  /** The day after a task's due date: its department's heads are told it is overdue */
  overdue_tasks: boolean;
  /** Once a month: members who owe dues are reminded in the bot */
  dues_reminders: boolean;
  /** Day of the Ethiopian month (1–30) from which the month's dues reminder goes out */
  dues_day: number;
  /** The day before a great feast or the start of a fast: a message to everyone connected to the bot */
  feast_reminders: boolean;
}

export const DEFAULT_AUTOMATION: AutomationSettings = {
  event_reminders: true,
  roster_reminders: true,
  vestment_reminders: true,
  library_reminders: true,
  overdue_tasks: true,
  // Off until the office decides to send them
  dues_reminders: false,
  dues_day: 10,
  // Off until the office decides to send them
  feast_reminders: false,
};

/** Repeating tasks always run: there is nothing to turn off. */
export type JobName = 'repeating_tasks' | 'event_reminders' | 'roster_reminders' | 'vestment_reminders' | 'library_reminders' | 'overdue_tasks' | 'dues_reminders' | 'feast_reminders';

export const JOB_LABELS: Record<JobName, [string, string]> = {
  repeating_tasks: ['Repeating tasks given', 'ተደጋጋሚ ተግባራት ተሰጥተዋል'],
  event_reminders: ['Event reminders', 'የመርሐ ግብር ማስታወሻ'],
  roster_reminders: ['Choir roster reminders', 'የመዘምራን ምደባ ማስታወሻ'],
  vestment_reminders: ['Vestment reminders', 'የክብር ልብስ ማስታወሻ'],
  library_reminders: ['Library book reminders', 'የመጻሕፍት መመለሻ ማስታወሻ'],
  overdue_tasks: ['Overdue task alerts', 'ጊዜው ያለፈ ተግባር ማሳወቂያ'],
  dues_reminders: ['Dues reminders', 'የመዋጮ ማስታወሻ'],
  feast_reminders: ['Feast and fast reminders', 'የበዓልና የጾም ማስታወሻ'],
};

export interface JobResult {
  job: JobName;
  /** Tasks given, messages delivered, or tasks flagged — what the job counts */
  count: number;
  /** Skipped (turned off, not the day yet…) or what went wrong */
  note?: string;
  error?: boolean;
}

export interface LastRun {
  at: string;
  /** timer = the daily call to /api/cron; manual = "Run now" on the Automation page */
  trigger: 'timer' | 'manual';
  results: JobResult[];
}
