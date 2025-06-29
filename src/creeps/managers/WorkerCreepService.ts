import BaseCreepService from "./BaseCreepService";
import Bot from "../../Bot";
import { Priority } from "../../process-manager/types";

export default class WorkerCreepService extends BaseCreepService {
  prefix = 'cwk'
  levelBodies = [
    [WORK, MOVE, CARRY]
  ]

  initialize(){
    this.scheduleAnalyze();
  }

  scheduleAnalyze(){
    for(const roomId in Game.rooms){
      this.bot.process.enqueue({
        priority: Priority.NORMAL,
        func: () => {
          this.analyseRoom(roomId);
          return {
            scheduleIn: {
              id: `${this.prefix}.an.${roomId}`,
              t: 8,
            }
          }
        }
      })
    }
  }

  analyseRoom(roomId: string){
    const room = Game.rooms[roomId];
    if(!room) return;
    // if there is a spawn and a resource
    const spawns = room.find(FIND_MY_SPAWNS);
    const sources = room.find(FIND_SOURCES);
    if(spawns.length > 0 && sources.length > 0){
      const workParts = room.find(FIND_MY_CREEPS).reduce((a, creep) => {
        if(creep.getActiveBodyparts(WORK) === 0) return a;
        if(creep.getActiveBodyparts(MOVE) === 0) return a;
        if(creep.getActiveBodyparts(CARRY) === 0) return a;

        return a + creep.getActiveBodyparts(WORK)
      }, 0)

      if(workParts === 0){
        this.bot.svc.spawn.enqueueSpawn(roomId, this.generateCreepName(), this.levelBodies[0], (n) => this.track(n));
        this.bot.svc.spawn.enqueueSpawn(roomId, this.generateCreepName(), this.levelBodies[0], (n) => this.track(n));
        this.bot.svc.spawn.enqueueSpawn(roomId, this.generateCreepName(), this.levelBodies[0], (n) => this.track(n));
      }

    }
  }

  track(name: string){
    // TODO
  }
}
