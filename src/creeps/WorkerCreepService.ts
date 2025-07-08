import BaseCreepService from "../core/BaseCreepService";
import { Priority } from "../core/process-manager/types";
import { MiningIndex } from "../core/mining/mining";
import { TransferSink } from "../core/logistics/sinks";
import { LSourceMiner } from "../core/logistics/sources";
import { LogisticIndex } from "../core/logistics/LogisticIndex";
import { Building } from "../services/BasePlanningService";

enum WorkerType {
  MINER = "m",
  HAULER = "h",
  CONTROLLER = "c",
  BUILDER = "b"
}

type CreepsByType = {
  [roomId in string]?: {
    [type in WorkerType]?: string[]
  }
}

const SMALL_MINER = [WORK, MOVE, CARRY];
const SMALL_HAULER = [MOVE, CARRY];
const MEDIUM_HAULER = [MOVE, MOVE, CARRY, CARRY];
const SMALL_BUILDER = [WORK, MOVE, CARRY];



export default class WorkerCreepService extends BaseCreepService {
  prefix = "w";

  miningIndex: MiningIndex = new MiningIndex();
  logisticsIndex: LogisticIndex = new LogisticIndex();
  creepsByType: CreepsByType = {}

  initialize() {
    for (const roomId in Game.rooms) {
      this.analyzeSources(roomId);
      this.analyzeConstruction(roomId);
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

  getCreepTypeCount(roomId: string, type: WorkerType){
    if(!_.has(this.creepsByType, [roomId, type])){
      _.set(this.creepsByType, [roomId, type], [])
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    return creepList.reduce((a, cName) => {
      const creep = Game.creeps[cName];
      if(!creep) return a;
      return a + 1;
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
        } else if (type === WorkerType.CONTROLLER) {
          this.runController(creep);
        } else if (type === WorkerType.BUILDER) {
          this.runBuilder(creep);
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

  analyzeConstruction(roomId: string) {
    this.bot.enqueueProcess({
      priority: Priority.LOW,
      func: () => {
        const id = `analyze.construction.${roomId}`
        const room = Game.rooms[roomId];
        if(!room) return;
        if(!room.memory.bp) return {scheduleIn:{id, t: 5}}
        if(room.memory.bp.result === undefined) {
          return {scheduleIn:{id, t: 5}}
        }
        else if(!room.memory.bp.result) {
          return;
        }
        // start building only in RCL 3
        if((room.controller?.level || 0) < 3) return {scheduleIn:{id, t: 10}}
        if(room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) return {scheduleIn:{id, t: 5}}
        const buildings = room.memory.bp?.buildings;
        if(!buildings) return;
        for(let i in buildings){
          const b: Building = buildings[i];
          const pos = room.getPositionAt(...b.p);
          if(!pos) continue;
          // destroy obstacle
          if(b.b in OBSTACLE_OBJECT_TYPES){
            const obstacle = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType in OBSTACLE_OBJECT_TYPES);
            if(obstacle){
              obstacle.destroy();
              continue
            }
          }
          const res = pos.createConstructionSite(b.b);
          if(res === OK){
            break;
          }
          else if(res === ERR_RCL_NOT_ENOUGH){
            continue;
          }
          else{
            console.log(`Error placing construction site ${res}`)
          }
        }

        return {scheduleIn:{id, t: 5}}
      }
    })
  }

  analyzeEnergyNeeds(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    room.find(FIND_MY_STRUCTURES).forEach(s => {
      // @ts-ignore
      if(s.store?.getCapacity(RESOURCE_ENERGY)){
        // @ts-ignore
        this.logisticsIndex.addSink(new TransferSink(s.id, RESOURCE_ENERGY))
      }

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
    const haulerBodyCount = this.getCreepTypeBodyPartCount(roomId, WorkerType.HAULER, CARRY);
    const minerBodyCount = this.getCreepTypeBodyPartCount(roomId, WorkerType.MINER, WORK);
    const controllerCount = this.getCreepTypeCount(roomId, WorkerType.CONTROLLER);
    const minerCount = this.getCreepTypeCount(roomId, WorkerType.MINER);
    const builderCount = this.getCreepTypeCount(roomId, WorkerType.BUILDER);

    if(haulerBodyCount < minerBodyCount*3){
      let parts: BodyPartConstant[]
      if(haulerBodyCount === 0){
        parts = SMALL_HAULER
      }else{
        parts = MEDIUM_HAULER
      }
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.HAULER, roomId), parts, n => {
        this.runCreep(n);
        this.enqueueAnalyzeRoomSpawns(roomId);
      });
    }
    else if(
      minerBodyCount > 1 && haulerBodyCount > 1 && controllerCount < 1
    ){
      this.bot.enqueueSpawn(
        roomId, this.generateWorkerCreepName(WorkerType.CONTROLLER, roomId),
        [MOVE, CARRY, WORK],
          n => {
            this.runCreep(n);
            this.enqueueAnalyzeRoomSpawns(roomId);
          }
      );
    }
    else if(this.miningIndex.slotCount() > minerCount){
      const parts = [MOVE, CARRY];
      const initialCost: number = parts.reduce((a,p) => a + BODYPART_COST[p], 0);
      const workCount = Math.floor((room.energyCapacityAvailable - initialCost) / (BODYPART_COST[WORK]+BODYPART_COST[CARRY]));
      this.bot.enqueueSpawn(
        roomId,
        this.generateWorkerCreepName(WorkerType.MINER, roomId),
        parts.concat(Array(workCount).fill(WORK), Array(workCount).fill(CARRY)),
          n => {
        this.runCreep(n);
        this.enqueueAnalyzeRoomSpawns(roomId);
      });
    }
    else if(3 > builderCount){
      const parts = [MOVE, CARRY];
      const initialCost: number = parts.reduce((a,p) => a + BODYPART_COST[p], 0);
      const workCount = Math.floor((room.energyCapacityAvailable - initialCost) / BODYPART_COST[WORK]);
      this.bot.enqueueSpawn(
        roomId, this.generateWorkerCreepName(WorkerType.BUILDER, roomId),
        parts.concat(Array(workCount).fill(WORK)),
          n => {
            this.runCreep(n);
            this.enqueueAnalyzeRoomSpawns(roomId);
          }
      );
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

      if(creep.store.getFreeCapacity(s.resource) === 0){
        this.logisticsIndex.deallocateSource(creep, s);
        return;
      }

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

      if(creep.store.getUsedCapacity(s.resource) === 0){
        this.logisticsIndex.deallocateSink(creep, s);
        return;
      }

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

  runController(creep: Creep){
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    this.logisticsIndex.addSink(new TransferSink(creep.id, RESOURCE_ENERGY));
    const room = Game.rooms[roomId];
    if(!room) return
    if(!room.controller) return
    if(creep.pos.getRangeTo(room.controller.pos) > 1){
      creep.travelTo(room.controller.pos)
    }else{
      creep.upgradeController(room.controller)
    }

  }

  runBuilder(creep: Creep){
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    this.logisticsIndex.addSink(new TransferSink(creep.id, RESOURCE_ENERGY));
    const room = Game.rooms[roomId];
    if(!room) return
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    if(sites.length === 0){
      this.runController(creep);
      return;
    }
    if(creep.pos.getRangeTo(sites[0].pos) > 1){
      creep.travelTo(sites[0].pos)
    }else{
      const totalBuildPower = Math.min(BUILD_POWER * creep.getActiveBodyparts(WORK), creep.store.getUsedCapacity(RESOURCE_ENERGY))
      const remaining = sites[0].progressTotal - sites[0].progress;
      // expect new building next tick
      if(remaining <= totalBuildPower){
        const pos = sites[0].pos
        this.bot.enqueueProcessIn(
          `new.bldg.${roomId}.${pos.x}.${pos.y}`,
          {
            priority: Priority.LOW,
            func: () => {
              pos.lookFor(LOOK_STRUCTURES).forEach(struct => {
                // @ts-ignore
                if(!struct.my) return;
                // @ts-ignore
                if(struct.store?.getCapacity(RESOURCE_ENERGY)){
                  // @ts-ignore
                  this.logisticsIndex.addSink(new TransferSink<RESOURCE_ENERGY>(struct.id))
                }
              })
            }
          },
          1
        )
      }
      creep.build(sites[0]);
    }
  }

  /*
  UTILITY
   */

  private generateWorkerCreepName(type: WorkerType, roomId: string) {
    return this.generateCreepName([type, roomId]);
  }
}
