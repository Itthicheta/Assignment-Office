import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'th' | 'en'

const dict = {
  // App chrome
  appName: { en: 'Assignment Office', th: 'Assignment Office' },
  myTasks: { en: 'My Tasks', th: 'งานของฉัน' },
  projects: { en: 'Projects', th: 'โปรเจกต์' },
  routines: { en: 'Routine', th: 'งานประจำ' },
  calendar: { en: 'Calendar', th: 'ปฏิทิน' },
  notifications: { en: 'Notifications', th: 'การแจ้งเตือน' },
  signOut: { en: 'Sign out', th: 'ออกจากระบบ' },
  team: { en: 'Team', th: 'ทีม' },

  // Auth
  signIn: { en: 'Sign in', th: 'เข้าสู่ระบบ' },
  password: { en: 'Password', th: 'รหัสผ่าน' },
  fullName: { en: 'Full name', th: 'ชื่อ-นามสกุล' },
  username: { en: 'Username', th: 'ชื่อผู้ใช้' },
  usernameOrEmail: { en: 'Username or email', th: 'ชื่อผู้ใช้หรืออีเมล' },
  loginHint: { en: 'Accounts are created by your admin.', th: 'บัญชีถูกสร้างโดยผู้ดูแลระบบของคุณ' },
  confirmPassword: { en: 'Confirm password', th: 'ยืนยันรหัสผ่าน' },
  passwordMismatch: { en: 'Passwords do not match', th: 'รหัสผ่านไม่ตรงกัน' },
  createMember: { en: 'Create account', th: 'สร้างบัญชี' },
  newMember: { en: 'New member', th: 'เพิ่มสมาชิกใหม่' },
  memberCreated: { en: 'Account created — share the username and password with them.', th: 'สร้างบัญชีแล้ว — ส่งชื่อผู้ใช้และรหัสผ่านให้สมาชิก' },
  adminRole: { en: 'Admin', th: 'ผู้ดูแล' },
  memberRole: { en: 'Member', th: 'สมาชิก' },
  adminOnly: { en: 'This page is for admins only.', th: 'หน้านี้สำหรับผู้ดูแลระบบเท่านั้น' },
  edit: { en: 'Edit', th: 'แก้ไข' },
  save: { en: 'Save', th: 'บันทึก' },
  newPassword: { en: 'New password (blank = unchanged)', th: 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' },
  confirmDeleteAccount1: { en: 'Delete this account?', th: 'ลบบัญชีนี้?' },
  confirmDeleteAccount2: {
    en: 'Are you SURE? This cannot be undone — their tasks, comments and files will be transferred to you.',
    th: 'แน่ใจหรือไม่? การลบย้อนกลับไม่ได้ — งาน ความคิดเห็น และไฟล์ของบุคคลนี้จะถูกโอนมาที่คุณ',
  },
  authTagline: {
    en: 'Assign work, track progress, get things done — together.',
    th: 'มอบหมายงาน ติดตามความคืบหน้า ทำงานให้เสร็จ — ไปด้วยกัน',
  },

  // Statuses & ticks
  in_progress: { en: 'In Progress', th: 'กำลังทำ' },
  done: { en: 'Done', th: 'เสร็จแล้ว' },
  tickWork: { en: 'Done', th: 'เสร็จ' },
  tickCheck: { en: 'Checked', th: 'ตรวจแล้ว' },
  waitingMyCheck: { en: 'Waiting for my check', th: 'รอฉันตรวจ' },
  pendingApproval: { en: 'Pending approval', th: 'รออนุมัติ' },
  approve: { en: 'Approve', th: 'อนุมัติ' },
  approvedLock: { en: 'Approved (locked)', th: 'อนุมัติแล้ว (ล็อก)' },
  createdBy: { en: 'Created', th: 'สร้างโดย' },

  // Priorities
  urgent: { en: 'Urgent', th: 'ด่วน' },
  normal: { en: 'Normal', th: 'ปกติ' },

  // My Tasks page
  allCaughtUp: { en: 'All caught up — no open tasks assigned to you.', th: 'เยี่ยม! ไม่มีงานค้างที่มอบหมายให้คุณ' },
  allProjects: { en: 'All projects', th: 'ทุกโปรเจกต์' },
  mainTasks: { en: 'Tasks', th: 'งานหลัก' },
  overdueSection: { en: 'Past deadline', th: 'เลยกำหนด' },
  chaseSection: { en: 'Due today / past deadline', th: 'ถึงกำหนดวันนี้ / เลยกำหนด' },
  dueTime: { en: 'Time (optional)', th: 'เวลา (ไม่บังคับ)' },
  confirmDeleteProject1: { en: 'Delete this project and ALL tasks inside it?', th: 'ลบโปรเจกต์นี้และงานทั้งหมดข้างใน?' },
  confirmDeleteProject2: {
    en: 'Are you SURE? Everything in this project will be permanently deleted.',
    th: 'แน่ใจหรือไม่? ทุกอย่างในโปรเจกต์นี้จะถูกลบถาวร',
  },
  deleteProject: { en: 'Delete project', th: 'ลบโปรเจกต์' },

  // Projects
  newProject: { en: 'New project', th: 'สร้างโปรเจกต์' },
  projectName: { en: 'Project name', th: 'ชื่อโปรเจกต์' },
  projectDescription: { en: 'Description (optional)', th: 'รายละเอียด (ไม่บังคับ)' },
  create: { en: 'Create', th: 'สร้าง' },
  cancel: { en: 'Cancel', th: 'ยกเลิก' },
  noProjects: { en: 'No projects yet.', th: 'ยังไม่มีโปรเจกต์' },
  tasksDone: { en: 'done', th: 'เสร็จ' },
  newSection: { en: 'New section', th: 'เพิ่มหมวด' },
  sectionName: { en: 'Section name', th: 'ชื่อหมวด' },
  noSection: { en: 'Other projects', th: 'โปรเจกต์อื่น ๆ' },
  confirmDeleteSection: { en: 'Delete this section? Its projects are kept.', th: 'ลบหมวดนี้? โปรเจกต์จะไม่ถูกลบ' },
  section: { en: 'Section', th: 'หมวด' },

  // Project detail / tasks
  addTask: { en: 'Add a task…', th: 'เพิ่มงาน…' },
  addSubtask: { en: 'Add a subtask…', th: 'เพิ่มงานย่อย…' },
  assignee: { en: 'Assignee', th: 'ผู้รับผิดชอบ' },
  unassigned: { en: 'Unassigned', th: 'ยังไม่มอบหมาย' },
  dueDate: { en: 'Due date', th: 'กำหนดส่ง' },
  priority: { en: 'Priority', th: 'ความสำคัญ' },
  description: { en: 'Description', th: 'รายละเอียด' },
  subtasks: { en: 'Subtasks', th: 'งานย่อย' },
  comments: { en: 'Comments', th: 'ความคิดเห็น' },
  writeComment: { en: 'Write a comment…', th: 'เขียนความคิดเห็น…' },
  send: { en: 'Send', th: 'ส่ง' },
  activityLog: { en: 'Activity', th: 'ประวัติ' },
  deleteTask: { en: 'Delete task', th: 'ลบงาน' },
  confirmDelete: { en: 'Delete this task and its subtasks?', th: 'ลบงานนี้และงานย่อยทั้งหมด?' },
  noTasks: { en: 'No tasks yet.', th: 'ยังไม่มีงาน' },
  addDetails: { en: 'Add details…', th: 'เพิ่มรายละเอียด…' },

  // Files
  files: { en: 'Files', th: 'ไฟล์' },
  uploadFile: { en: 'Upload file', th: 'อัปโหลดไฟล์' },
  uploading: { en: 'Uploading…', th: 'กำลังอัปโหลด…' },
  confirmDeleteFile: { en: 'Delete this file?', th: 'ลบไฟล์นี้?' },

  // Activity actions
  act_created: { en: 'created this task', th: 'สร้างงานนี้' },
  act_assigned: { en: 'assigned to', th: 'มอบหมายให้' },
  act_unassigned: { en: 'removed the assignee', th: 'ยกเลิกการมอบหมาย' },
  act_due: { en: 'set due date to', th: 'ตั้งกำหนดส่งเป็น' },
  act_priority: { en: 'set priority to', th: 'ตั้งความสำคัญเป็น' },
  act_deleted: { en: 'deleted task', th: 'ลบงาน' },
  act_tick_done: { en: 'marked the work done', th: 'ทำงานเสร็จแล้ว' },
  act_untick_done: { en: 'reopened the work', th: 'เปิดงานใหม่อีกครั้ง' },
  act_checked: { en: 'checked and approved', th: 'ตรวจผ่านแล้ว' },
  act_unchecked: { en: 'removed the approval', th: 'ยกเลิกการอนุมัติ' },
  act_approved: { en: 'approved this task', th: 'อนุมัติงานนี้' },
  act_unapproved: { en: 'removed task approval', th: 'ยกเลิกการอนุมัติงานนี้' },

  // Notifications
  notif_assigned: { en: 'assigned you a task', th: 'มอบหมายงานให้คุณ' },
  notif_comment: { en: 'commented on your task', th: 'แสดงความคิดเห็นในงานของคุณ' },
  notif_review: { en: 'finished a task — waiting for your check', th: 'ทำงานเสร็จแล้ว รอคุณตรวจ' },
  notif_returned: { en: 'returned your task with feedback', th: 'ส่งงานกลับมาให้คุณแก้ไข' },
  notif_done: { en: 'checked and approved your task', th: 'ตรวจงานของคุณผ่านแล้ว' },
  notif_new_task: { en: 'created a new task — waiting for your approval', th: 'สร้างงานใหม่ รอคุณอนุมัติ' },
  notif_task_approved: { en: 'approved your task', th: 'อนุมัติงานของคุณแล้ว' },
  notif_new_routine: { en: 'created a new routine — waiting for your approval', th: 'สร้างงานประจำใหม่ รอคุณอนุมัติ' },
  notif_routine_approved: { en: 'approved your routine', th: 'อนุมัติงานประจำของคุณแล้ว' },
  markAllRead: { en: 'Mark all as read', th: 'อ่านทั้งหมดแล้ว' },
  noNotifications: { en: 'No notifications', th: 'ไม่มีการแจ้งเตือน' },

  // Routines
  newRoutine: { en: 'New routine', th: 'เพิ่มงานประจำ' },
  routineTitle: { en: 'Routine name', th: 'ชื่องานประจำ' },
  repeatWeekly: { en: 'Weekly — pick days of the week', th: 'รายสัปดาห์ — เลือกวัน' },
  repeatMonthly: { en: 'Monthly — pick days of the month', th: 'รายเดือน — เลือกวันที่' },
  active: { en: 'Active', th: 'ใช้งาน' },
  paused: { en: 'Paused', th: 'พักไว้' },
  doneToday: { en: 'Done today', th: 'เสร็จวันนี้' },
  notDueToday: { en: 'Not due today', th: 'วันนี้ไม่มีกำหนด' },
  history: { en: 'History', th: 'ประวัติ' },
  noRoutines: { en: 'No routines yet.', th: 'ยังไม่มีงานประจำ' },
  confirmDeleteRoutine: { en: 'Delete this routine and its history?', th: 'ลบงานประจำนี้และประวัติทั้งหมด?' },

  // Calendar
  showTasks: { en: 'Tasks', th: 'งาน' },
  showRoutines: { en: 'Routines', th: 'งานประจำ' },
  today: { en: 'Today', th: 'วันนี้' },

  loading: { en: 'Loading…', th: 'กำลังโหลด…' },
} as const

export type TKey = keyof typeof dict

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: TKey) => string
}

const I18nContext = createContext<I18n>(null!)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem('lang')
    if (saved === 'th' || saved === 'en') return saved
    return navigator.language.startsWith('th') ? 'th' : 'en'
  })
  const setLang = (l: Lang) => {
    localStorage.setItem('lang', l)
    setLangState(l)
  }
  // Tolerant lookup: old data may reference keys that no longer exist
  // (e.g. removed statuses/priorities in activity history) — fall back to
  // the raw key instead of crashing the page.
  const t = (key: TKey) => dict[key]?.[lang] ?? String(key)
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
