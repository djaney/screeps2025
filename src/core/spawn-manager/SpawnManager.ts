import Bot from "../../Bot";
import ServiceInterface from "../../ServiceInterface";
import { CreepBody } from "../../creeps/types";
import { Priority } from "../process-manager/types";
import { union } from "lodash";

export type QueueCallback = (name: string) => void;
export type QueueItem = { name: string; body: BodyPartConstant[]; callback: QueueCallback };
export type Queue = {
  [roomId in string]?: QueueItem[];
};

export default class SpawnManager implements ServiceInterface {
  queue: Queue = {};

  constructor(readonly bot: Bot) {}

  initialize() {}

  enqueueSpawn(roomId: string, name: string, body: BodyPartConstant[], callback: QueueCallback) {
    const room = Game.rooms[roomId];
    if (!room) throw new Error("Cannot enqueueSpawn, room does not visible");

    if (room.energyCapacityAvailable < this.getSpawnCost(body)) {
      throw new Error("Cannot enqueueSpawn, exceeds room energy capacity");
    }
    if (!(roomId in this.queue)) {
      this.queue[roomId] = [];
    }
    this.queue[roomId]?.push({ name, body, callback });
    this.doSpawn(roomId)

  }

  doSpawn(roomId: string){
    const room = Game.rooms[roomId];
    if(!room) return;
    const roomQueue = this.queue[roomId];
    if(!roomQueue) return;

    const id = `spawn.${roomId}`
    const idx = 0

    // if nothing in queue, do nothing
    if(roomQueue.length === 0){
      return
    }

    // if no energy available, try again next tick
    const item = roomQueue[idx]
    if(this.getSpawnCost(item.body) > room.energyAvailable){
      this.bot.enqueueProcessIn(id, {
        priority: Priority.NORMAL,
        func: () => this.doSpawn(roomId)
      }, 1)
      return
    }

    // if no available spawns, try again after remaining time
    const availableSpawn = room.find(FIND_MY_SPAWNS).find(s => !s.spawning)
    if(!availableSpawn){
      const remainingTime = room.find(FIND_MY_SPAWNS).reduce((a, s) => {
        return Math.min(a, s.spawning?.remainingTime || +Infinity)
      }, +Infinity);
      this.bot.enqueueProcessIn(id, {
        priority: Priority.NORMAL,
        func: () => this.doSpawn(roomId)
      }, remainingTime+1)
      return
    }
    // spawn creep
    const res = availableSpawn.spawnCreep(item.body, item.name)
    if(res === OK){
      // check again next tick
      this.bot.enqueueProcessIn(id, {
        priority: Priority.NORMAL,
        func: () => this.doSpawn(roomId)
      }, 1)

      this.bot.enqueueProcessIn(`${id}.cb.${item.name}`, {
        priority: Priority.NORMAL,
        func: () => item.callback(item.name)
      }, item.body.length * CREEP_SPAWN_TIME)
    }else{
      console.log(`Spawning error ${res}: ${JSON.stringify(item.body)} @ ${roomId}`)
    }
    // remove from queue
    roomQueue.splice(idx, 1);


  }

  getSpawnCost(body: CreepBody) {
    return body.reduce((a, b) => {
      return a + BODYPART_COST[b];
    }, 0);
  }
}
