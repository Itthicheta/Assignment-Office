export type Status = 'in_progress' | 'done'
export type Priority = 'normal' | 'urgent'

export interface Profile {
  id: string
  full_name: string
  username: string | null
  role: 'admin' | 'member'
}

export interface Project {
  id: string
  name: string
  description: string
  color: string
  archived: boolean
  section_id: string | null
  position: number
  created_by: string
  created_at: string
}

export interface ProjectSection {
  id: string
  name: string
  position: number
  created_by: string
  created_at: string
}

export interface Task {
  id: string
  project_id: string
  parent_id: string | null
  title: string
  description: string
  status: Status
  priority: Priority
  tick_done: boolean
  tick_checked: boolean
  approved: boolean
  position: number
  assignee_id: string | null
  due_date: string | null
  due_time: string | null
  created_by: string
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface Comment {
  id: string
  task_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Activity {
  id: string
  project_id: string
  task_id: string | null
  actor_id: string
  action: string
  detail: Record<string, string>
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  actor_id: string | null
  task_id: string | null
  type: string
  read: boolean
  created_at: string
}

export interface Attachment {
  id: string
  project_id: string
  task_id: string | null
  name: string
  path: string
  size: number
  uploaded_by: string
  created_at: string
}

export interface Routine {
  id: string
  title: string
  assignee_id: string
  repeat_type: 'weekly' | 'monthly'
  weekdays: number[]   // 0 = Sunday … 6 = Saturday
  monthdays: number[]  // 1 … 31
  active: boolean
  approved: boolean
  created_by: string
  created_at: string
}

export interface RoutineCompletion {
  routine_id: string
  on_date: string
  completed_by: string
  completed_at: string
}
