import { createContext, useContext, useState, type ReactNode } from 'react'

export type Lang = 'th' | 'en'

const dict = {
  // App chrome
  appName: { en: 'Assignment Office', th: 'Assignment Office' },
  myTasks: { en: 'My Tasks', th: 'งานของฉัน' },
  projects: { en: 'Projects', th: 'โปรเจกต์' },
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
  authTagline: {
    en: 'Assign work, track progress, get things done — together.',
    th: 'มอบหมายงาน ติดตามความคืบหน้า ทำงานให้เสร็จ — ไปด้วยกัน',
  },

  // Statuses
  todo: { en: 'To Do', th: 'รอดำเนินการ' },
  in_progress: { en: 'In Progress', th: 'กำลังทำ' },
  in_review: { en: 'In Review', th: 'รอตรวจ' },
  blocked: { en: 'Blocked', th: 'ติดปัญหา' },
  done: { en: 'Done', th: 'เสร็จแล้ว' },
  cancelled: { en: 'Cancelled', th: 'ยกเลิก' },

  // Priorities
  urgent: { en: 'Urgent', th: 'ด่วนมาก' },
  high: { en: 'High', th: 'สูง' },
  normal: { en: 'Normal', th: 'ปกติ' },
  low: { en: 'Low', th: 'ต่ำ' },

  // My Tasks page
  overdue: { en: 'Overdue', th: 'เลยกำหนด' },
  dueToday: { en: 'Due today', th: 'ครบกำหนดวันนี้' },
  upcoming: { en: 'Upcoming', th: 'กำลังจะถึงกำหนด' },
  noDueDate: { en: 'No due date', th: 'ไม่มีกำหนดส่ง' },
  waitingMyReview: { en: 'Waiting for my review', th: 'รอฉันตรวจ' },
  allCaughtUp: { en: 'All caught up — no open tasks assigned to you.', th: 'เยี่ยม! ไม่มีงานค้างที่มอบหมายให้คุณ' },

  // Projects
  newProject: { en: 'New project', th: 'สร้างโปรเจกต์' },
  projectName: { en: 'Project name', th: 'ชื่อโปรเจกต์' },
  projectDescription: { en: 'Description (optional)', th: 'รายละเอียด (ไม่บังคับ)' },
  create: { en: 'Create', th: 'สร้าง' },
  cancel: { en: 'Cancel', th: 'ยกเลิก' },
  noProjects: { en: 'No projects yet. Create the first one!', th: 'ยังไม่มีโปรเจกต์ สร้างอันแรกเลย!' },
  tasksDone: { en: 'done', th: 'เสร็จ' },

  // Project detail / tasks
  addTask: { en: 'Add a task…', th: 'เพิ่มงาน…' },
  addSubtask: { en: 'Add a subtask…', th: 'เพิ่มงานย่อย…' },
  assignee: { en: 'Assignee', th: 'ผู้รับผิดชอบ' },
  unassigned: { en: 'Unassigned', th: 'ยังไม่มอบหมาย' },
  dueDate: { en: 'Due date', th: 'กำหนดส่ง' },
  priority: { en: 'Priority', th: 'ความสำคัญ' },
  status: { en: 'Status', th: 'สถานะ' },
  description: { en: 'Description', th: 'รายละเอียด' },
  subtasks: { en: 'Subtasks', th: 'งานย่อย' },
  comments: { en: 'Comments', th: 'ความคิดเห็น' },
  writeComment: { en: 'Write a comment…', th: 'เขียนความคิดเห็น…' },
  send: { en: 'Send', th: 'ส่ง' },
  activityLog: { en: 'Activity', th: 'ประวัติ' },
  deleteTask: { en: 'Delete task', th: 'ลบงาน' },
  confirmDelete: { en: 'Delete this task and its subtasks?', th: 'ลบงานนี้และงานย่อยทั้งหมด?' },
  noTasks: { en: 'No tasks yet — add the first one above.', th: 'ยังไม่มีงาน เพิ่มงานแรกได้ที่ด้านบน' },
  addDetails: { en: 'Add details…', th: 'เพิ่มรายละเอียด…' },

  // Activity actions
  act_created: { en: 'created this task', th: 'สร้างงานนี้' },
  act_status: { en: 'changed status to', th: 'เปลี่ยนสถานะเป็น' },
  act_assigned: { en: 'assigned to', th: 'มอบหมายให้' },
  act_unassigned: { en: 'removed the assignee', th: 'ยกเลิกการมอบหมาย' },
  act_due: { en: 'set due date to', th: 'ตั้งกำหนดส่งเป็น' },
  act_priority: { en: 'set priority to', th: 'ตั้งความสำคัญเป็น' },
  act_deleted: { en: 'deleted task', th: 'ลบงาน' },

  // Notifications
  notif_assigned: { en: 'assigned you a task', th: 'มอบหมายงานให้คุณ' },
  notif_comment: { en: 'commented on your task', th: 'แสดงความคิดเห็นในงานของคุณ' },
  notif_review: { en: 'submitted a task for your review', th: 'ส่งงานให้คุณตรวจ' },
  notif_returned: { en: 'returned your task with feedback', th: 'ส่งงานกลับมาให้คุณแก้ไข' },
  notif_done: { en: 'approved your task', th: 'อนุมัติงานของคุณแล้ว' },
  markAllRead: { en: 'Mark all as read', th: 'อ่านทั้งหมดแล้ว' },
  noNotifications: { en: 'No notifications', th: 'ไม่มีการแจ้งเตือน' },

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
  const t = (key: TKey) => dict[key][lang]
  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
