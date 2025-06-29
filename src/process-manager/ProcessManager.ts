import { ProcessUnit, Schedule, ScheduleId } from "./types";
import Bot from "../Bot";
import ServiceInterface from "../ServiceInterface";

export default class ProcessManager implements ServiceInterface {
  constructor(readonly bot: Bot) {}

  /**
   * Queue of ProcessUnit. Index 0 is the first to execute
   */
  queue: ProcessUnit[] = [];

  /**
   * schedule map
   */
  schedule: Schedule = {};

  /**
   * Enqueue unit
   * Prioritize on the fly
   * @param unit
   */
  enqueue(unit: ProcessUnit) {
    const index = this.queue.findIndex(u => {
      return u.priority < unit.priority;
    });

    if (index > 0) {
      this.queue.splice(index, 0, unit);
    } else {
      this.queue.push(unit);
    }
  }

  /**
   * Enqueue after some tick
   * @param id
   * @param unit
   * @param t
   */
  enqueueIn(id: ScheduleId, unit: ProcessUnit, t: number) {
    // do not queue again if already queued
    if (Object.keys(this.schedule).includes(id)) return;

    this.schedule[id] = {
      t: t,
      p: unit
    };
  }

  loop() {
    while (this.queue.length > 0) {
      const index = 0;
      const unit = this.queue[index];
      if (!unit) continue;

      // run process unit
      const res = unit.func();

      // explicit retry
      if (res?.retry) {
        this.enqueue(unit);
      } else if (res?.scheduleIn) {
        this.enqueueIn(res.scheduleIn.id, unit, res.scheduleIn.t);
      }
      // remove from queue if everything is a success
      this.queue.splice(index, 1);

      // scheduling
      for (let i in this.schedule) {
        if (this.schedule[i].t <= 0) {
          this.enqueue(this.schedule[i].p);
          delete this.schedule[i];
        } else {
          this.schedule[i].t -= 1;
        }
      }
    }
  }
}
