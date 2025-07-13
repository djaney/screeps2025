import { ProcessUnit, Schedule, ScheduleId } from "./types";
import Bot from "../../Bot";
import ServiceInterface from "../../ServiceInterface";

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

  initialize() {}
  initializeRoom(roomId: string) {}

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
      if (!unit) break;

      // run process unit
      const res = unit.func();

      // explicit retry
      if (res?.scheduleIn) {
        this.enqueueIn(res.scheduleIn.id, unit, res.scheduleIn.t);
      }
      // remove from queue if everything is a success
      this.queue.splice(index, 1);
    }
    // scheduling
    this.printSchedule('W5S7')
    for (let i in this.schedule) {
      this.schedule[i].t -= 1;
      if (this.schedule[i].t <= 0) {
        this.enqueue(this.schedule[i].p);
        delete this.schedule[i];
      }
    }

  }

  printSchedule(roomId: string){
    // print schedule
    const room = Game.rooms[roomId];
    if(room){
      let count = 0;
      _.forEach(this.schedule, (s, id) => {
        if(id) room.visual.text(`${s.t} - ${id}`, 0, count++, {
          align: "left"
        })
      })
    }
  }
}
