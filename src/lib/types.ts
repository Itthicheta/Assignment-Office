export type Status = 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'cancelled'
export type Priority = 'urgent' | 'high' | 'normal' | 'low'

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
  assignee_id: string | null
  due_date: string | null
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

export const STATUSES: Status[] = ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled']
export const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low']
