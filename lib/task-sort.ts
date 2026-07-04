import type { Task, TaskPriority } from './tasks-mock'

export const PRIORITY_ORDER: Record<TaskPriority, number> = { khẩn: 0, cao: 1, trung: 2, thấp: 3 }

// Việc hoàn thành luôn xuống dưới cùng; trong nhóm chưa hoàn thành, việc khẩn lên trên.
export function taskSortRank(t: Task): number {
  return (t.status === 'hoan_thanh' ? 10 : 0) + PRIORITY_ORDER[t.priority]
}
