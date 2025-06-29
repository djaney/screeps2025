export type ScheduleId = string

export enum Priority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  EMERGENCY = 9
}
export interface ProcessUnit {
  priority: Priority
  func: () => undefined|ProcessResponse;
}

export interface ProcessResponse {
  scheduleIn?:  ScheduleInUnit;
  retry?: boolean;
}

export interface ScheduleInUnit {
  id: ScheduleId
  t: number
}

export interface ScheduleUnit {
  t: number
  p: ProcessUnit
}

export interface Schedule {
  [id: ScheduleId]: ScheduleUnit
}
