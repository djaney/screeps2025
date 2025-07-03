import BaseCreepService from "../core/BaseCreepService";
import { Priority } from "../core/process-manager/types";
import { MiningIndex } from "../core/mining/mining";
import { LSinkSpawn } from "../core/logistics/sinks"
import { LSourceMiner } from "../core/logistics/sources"
import { LogisticIndex } from "../core/logistics/LogisticIndex";

enum WorkerType {
  MINER = "m",
  HAULER = "h"
}

type CreepsByType = {
  [roomId in string]?: {
    [type in WorkerType]?: string[]
  }
}

const SMALL_MINER = [WORK, MOVE, CARRY];
const SMALL_HAULER = [MOVE, CARRY];



export default class WorkerCreepService extends BaseCreepService {
  prefix = "w";

  miningIndex: MiningIndex = new MiningIndex();
  logisticsIndex: LogisticIndex = new LogisticIndex();
  creepsByType: CreepsByType = {}

  initialize() {
    for (const roomId in Game.rooms) {
      this.analyzeSources(roomId);
      this.enqueueAnalyzeRoomSpawns(roomId);
      this.analyzeEnergyNeeds(roomId);
    }
  }


  registerCreep(name: string, roomId: string, type: WorkerType){
    if(!_.has(this.creepsByType, [roomId, type])){
      _.set(this.creepsByType, [roomId, type], [])
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    if(!creepList.includes(name)){
      creepList.push(name)
    }

  }

  getCreepTypeBodyPartCount(roomId: string, type: WorkerType, part: BodyPartConstant){
    if(!_.has(this.creepsByType, [roomId, type])){
      _.set(this.creepsByType, [roomId, type], [])
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    return creepList.reduce((a, cName) => {
      const creep = Game.creeps[cName];
      if(!creep) return a;
      return a + creep.getActiveBodyparts(part)
    }, 0)
  }

  deregisterCreep(name: string, roomId: string, type: WorkerType){
    if(!_.has(this.creepsByType, [roomId, type])){
      _.set(this.creepsByType, [roomId, type], [])
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    _.remove(creepList, c => c === name)
  }

  runCreep(name: string) {
    if (!Game.creeps[name]) return;
    const [prefix, type, roomId, idx] = this.splitCreepName(name);
    this.registerCreep(name, roomId, type as WorkerType);
    this.bot.enqueueProcess({
      priority: Priority.NORMAL,
      func: () => {
        const creep = Game.creeps[name];
        if (!creep) {
          // dead
          this.deregisterCreep(name, roomId, type as WorkerType);
          this.analyzeSources(roomId)
          return;
        }
        if (type === WorkerType.MINER) {
          this.runMiner(creep);
        } else if (type === WorkerType.HAULER) {
          this.runHauler(creep);
        }

        if (creep.ticksToLive !== undefined && creep.ticksToLive <= 1) {
          this.enqueueAnalyzeRoomSpawns(roomId, 1);
          return;
        }
        return { scheduleIn: { t: 1, id: `creepRun.${name}` } };
      }
    });
  }

  analyzeSources(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    this.miningIndex.addRoom(room);
  }
  analyzeEnergyNeeds(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    room.find(FIND_MY_SPAWNS).forEach(s => {
      this.logisticsIndex.addSink(new LSinkSpawn(s.id, RESOURCE_ENERGY))
    })
  }

  /*
  ROOM SPAWNS
   */

  private enqueueAnalyzeRoomSpawns(roomId: string, t: number = 0) {
    if (t === 0) {
      this.bot.enqueueProcess({
        priority: Priority.NORMAL,
        func: () => {
          this.analyzeRoomSpawns(roomId);
        }
      });
    } else {
      this.bot.enqueueProcessIn(
        `${this.prefix}.an.${roomId}`,
        {
          priority: Priority.NORMAL,
          func: () => {
            this.analyzeRoomSpawns(roomId);
          }
        },
        10
      );
    }
  }

  private analyzeRoomSpawns(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    // if there is a spawn and a resource
    const haulerCount = this.getCreepTypeBodyPartCount(roomId, WorkerType.HAULER, CARRY);
    const minerCount = this.getCreepTypeBodyPartCount(roomId, WorkerType.MINER, WORK);
    if(haulerCount < minerCount){
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.HAULER, roomId), SMALL_HAULER, n => {
        this.runCreep(n);
        this.enqueueAnalyzeRoomSpawns(roomId);
      });
    }
    else if(this.miningIndex.findAvailableSlot()){
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.MINER, roomId), SMALL_MINER, n => {
        this.runCreep(n);
        this.enqueueAnalyzeRoomSpawns(roomId);
      });
    }
  }

  /*
  CREEP ACTIONS
   */

  runMiner(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    if (!this.miningIndex.isCreepAssigned(creep)) {
      const available = this.miningIndex.findAvailableSlot()
      if (available) {
        this.miningIndex.assignCreep(available, creep);
        this.logisticsIndex.addSource(new LSourceMiner(creep.id, RESOURCE_ENERGY))
      }
    }
    const slot = this.miningIndex.getCreepSlot(creep)
    if(!slot) return;
    if (slot.pos && creep.pos.getRangeTo(slot.pos) > 0) {
      creep.travelTo(slot.pos);
    } else {
      const obj = Game.getObjectById(slot.source.id)
      if (obj) creep.harvest(obj)
    }
  }

  runHauler(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    // allocate creep
    if (!this.logisticsIndex.isCreepAllocated(creep)) {

      // allocated sink + currently carrying
      const sources = this.logisticsIndex.getAvailableSource(roomId, RESOURCE_ENERGY, creep.store.getFreeCapacity(RESOURCE_ENERGY));
      if(sources.length > 0){
        const s = sources[0];
        this.logisticsIndex.allocateSource(creep, s, Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), s.getFreeValue()))
      }

      const sinks = this.logisticsIndex.getAvailableSink(roomId, RESOURCE_ENERGY, creep.store.getCapacity(RESOURCE_ENERGY));
      sinks.forEach(s => {
        this.logisticsIndex.allocateSink(creep, s, s.getRemainingValue())
      })
    }

    // do the work
    const alloc = this.logisticsIndex.getCreepAllocation(creep);
    // get sources
    if(alloc.sources.length > 0){
      const s = alloc.sources[0];
      const a = s.getAllocation(creep);
      if(a){
        const res = s.pickup(creep, a.value);
        const target = Game.getObjectById(s.id);
        if(!target){
          this.logisticsIndex.deallocateSource(creep, s);
        }else if(creep.pos.getRangeTo(target.pos) > 1){
          creep.travelTo(target);
        }else{
          // re-allocate to account for constantly growing miner
          this.logisticsIndex.deallocateSource(creep, s);
          this.logisticsIndex.allocateSource(creep, s, Math.min(creep.store.getFreeCapacity(s.resource),s.getFreeValue()))
          s.pickup(creep, a.value);
          this.logisticsIndex.deallocateSource(creep, s)
        }
      }
    }
    // get sinks
    else if(alloc.sinks.length > 0){
      const s = alloc.sinks[0];
      const a = s.getAllocation(creep);
      if(a){
        const res = s.deliver(creep, a.value);
        const target = Game.getObjectById(s.id)
        if(target && res === ERR_NOT_IN_RANGE){
          creep.travelTo(target)
        }else{
          this.logisticsIndex.deallocateSink(creep, s)
        }
      }
    }
  }

  /*
  UTILITY
   */

  private generateWorkerCreepName(type: WorkerType, roomId: string) {
    return this.generateCreepName([type, roomId]);
  }
}
