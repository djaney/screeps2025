import BaseCreepService from "../core/BaseCreepService";
import { Priority } from "../core/process-manager/types";
import { MiningIndex } from "../core/mining/mining";
import { TransferSink } from "../core/logistics/sinks";
import { LSourceMiner } from "../core/logistics/sources";
import { LogisticIndex } from "../core/logistics/LogisticIndex";
import { Building } from "../services/BasePlanningService";
import TerrainAlgo from "../utils/TerrainAlgo";

enum WorkerType {
  MINER = "m",
  HAULER = "h",
  CONTROLLER = "c",
  BUILDER = "b"
}

type CreepsByType = {
  [roomId in string]?: {
    [type in WorkerType]?: string[];
  };
};

const SMALL_MINER = [WORK, MOVE, CARRY];
const SMALL_HAULER = [MOVE, CARRY];
const MEDIUM_HAULER = [MOVE, MOVE, CARRY, CARRY];
const SMALL_BUILDER = [WORK, MOVE, CARRY];

export default class WorkerCreepService extends BaseCreepService {
  prefix = "w";

  miningIndex: MiningIndex = new MiningIndex();
  logisticsIndex: LogisticIndex = new LogisticIndex();
  creepsByType: CreepsByType = {};

  initialize() {
    for (const roomId in Game.rooms) {
      this.initializeRoom(roomId);
    }
  }

  initializeRoom(roomId: string) {
    super.initializeRoom(roomId);
    this.analyzeSources(roomId);
    this.analyzeConstruction(roomId);
    this.enqueueAnalyzeRoomSpawns(roomId);
    this.enqueueAnalyzeEnergyNeeds(roomId);
  }

  registerCreep(name: string, roomId: string, type: WorkerType) {
    if (!_.has(this.creepsByType, [roomId, type])) {
      _.set(this.creepsByType, [roomId, type], []);
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    if (!creepList.includes(name)) {
      creepList.push(name);
    }
  }

  deregisterCreep(name: string, roomId: string, type: WorkerType) {
    if (!_.has(this.creepsByType, [roomId, type])) {
      _.set(this.creepsByType, [roomId, type], []);
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    _.remove(creepList, c => c === name);
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
          this.analyzeSources(roomId);
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
        const id = `analyze.construction.${roomId}`;
        const room = Game.rooms[roomId];
        if (!room) return;
        if (!room.memory.bp) return { scheduleIn: { id, t: 5 } };
        if (room.memory.bp.result === undefined) {
          return { scheduleIn: { id, t: 5 } };
        } else if (!room.memory.bp.result) {
          return;
        }
        // start building only in RCL 3
        if ((room.controller?.level || 0) < 3) return { scheduleIn: { id, t: 10 } };
        if (room.find(FIND_MY_CONSTRUCTION_SITES).length > 0) return { scheduleIn: { id, t: 5 } };
        const buildings = room.memory.bp?.buildings;
        if (!buildings) return;
        for (let i in buildings) {
          const b: Building = buildings[i];
          const pos = room.getPositionAt(...b.p);
          if (!pos) continue;
          // destroy obstacle
          if (b.b in OBSTACLE_OBJECT_TYPES) {
            const obstacle = pos.lookFor(LOOK_STRUCTURES).find(s => s.structureType in OBSTACLE_OBJECT_TYPES);
            if (obstacle) {
              obstacle.destroy();
              continue;
            }
          }
          const res = pos.createConstructionSite(b.b);
          if (res === OK) {
            break;
          } else if (res === ERR_RCL_NOT_ENOUGH) {
          } else {
            console.log(`Error placing construction site ${res}`);
          }
        }

        return { scheduleIn: { id, t: 5 } };
      }
    });
  }

  enqueueAnalyzeEnergyNeeds(roomId: string) {
    this.bot.enqueueProcess({
      priority: Priority.NORMAL,
      func: () => {
        this.analyzeEnergyNeeds(roomId);
        return { scheduleIn: { id: `analyzeEnergyNeeds.${roomId}`, t: 6 } };
      }
    });
  }

  analyzeEnergyNeeds(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    room.find(FIND_MY_STRUCTURES).forEach(s => {
      // @ts-ignore
      if (s.store?.getCapacity(RESOURCE_ENERGY)) {
        // @ts-ignore
        this.logisticsIndex.addSink(new TransferSink(s.id, RESOURCE_ENERGY));
      }
    });
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
          return { scheduleIn: { id: `${this.prefix}.enqueueAnalyzeRoomSpawns.${roomId}`, t: 5 } };
        }
      });
    } else {
      this.bot.enqueueProcessIn(
        `${this.prefix}.enqueueAnalyzeRoomSpawns.${roomId}`,
        {
          priority: Priority.NORMAL,
          func: () => {
            this.analyzeRoomSpawns(roomId);
            return { scheduleIn: { id: `${this.prefix}.enqueueAnalyzeRoomSpawns.${roomId}`, t: 5 } };
          }
        },
        10
      );
    }
  }

  private analyzeRoomSpawns(roomId: string) {
    const room = Game.rooms[roomId];
    if (!room) return;
    if (!room.energyAvailable) return;

    // if there is a spawn and a resource
    const controllerCreeps = this.getCreepTypeSpawnedCount(roomId, WorkerType.CONTROLLER);
    const minerCreeps = this.getCreepTypeSpawnedCount(roomId, WorkerType.MINER);
    const builderCreeps = this.getCreepTypeSpawnedCount(roomId, WorkerType.BUILDER);
    const haulerCreeps = this.getCreepTypeSpawnedCount(roomId, WorkerType.HAULER);

    const haulerBodyCount = this.getCreepTypeBodyPartCount(haulerCreeps, CARRY);
    const minerBodyCount = this.getCreepTypeBodyPartCount(minerCreeps, WORK);

    // console.log("-=SPAWN DEBUG=-")
    // console.log("controllerCreeps", controllerCreeps)
    // console.log("minerCreeps", minerCreeps)
    // console.log("builderCreeps", builderCreeps)
    // console.log("haulerCreeps", haulerCreeps)
    // console.log("haulerBodyCount", haulerBodyCount)
    // console.log("minerBodyCount", minerBodyCount)


    // clear queue if economy is stuck
    if (haulerBodyCount === 0 || minerBodyCount === 0) {
      this.bot.clearSpawnQueue(roomId);
    }

    const currentSpawnQueueCount = this.bot.countSpawnQueue(roomId);
    if (currentSpawnQueueCount > 0) return;

    // hauler
    if (haulerBodyCount < minerBodyCount * 2) {
      let parts: BodyPartConstant[];
      if (haulerBodyCount === 0) {
        parts = [MOVE, CARRY];
      } else {
        parts = this.generateCreepParts(room, [MOVE, CARRY], [MOVE, CARRY]);
      }
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.HAULER, roomId), parts, n => {
        try {
          this.runCreep(n);
        } finally {
          this.enqueueAnalyzeRoomSpawns(roomId);
        }
      });
    }
    // controller
    else if (minerBodyCount > 1 && haulerBodyCount > 1 && controllerCreeps.length < 1) {
      const parts = this.generateCreepParts(room, [MOVE, CARRY], [MOVE, WORK, CARRY]);
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.CONTROLLER, roomId), parts, n => {
        try {
          this.runCreep(n);
        } finally {
          this.enqueueAnalyzeRoomSpawns(roomId);
        }
      });
    }
    // miner
    else if (
      this.miningIndex.slotCount() > minerCreeps.length &&
      minerBodyCount < 5 * this.miningIndex.getRoomSourceCount(roomId)
    ) {
      let parts: BodyPartConstant[];
      if (minerCreeps.length === 0) {
        parts = [MOVE, WORK, CARRY];
      } else {
        parts = this.generateCreepParts(room, [MOVE, CARRY], [MOVE, WORK, CARRY]);
      }

      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.MINER, roomId), parts, n => {
        try {
          this.runCreep(n);
        } finally {
          this.enqueueAnalyzeRoomSpawns(roomId);
        }
      });
    }
    // builder
    else if (3 > builderCreeps.length) {
      const parts = this.generateCreepParts(room, [MOVE, CARRY], [WORK, CARRY]);
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.BUILDER, roomId), parts, n => {
        try {
          this.runCreep(n);
        } finally {
          this.enqueueAnalyzeRoomSpawns(roomId);
        }
      });
    }
  }

  /*
  CREEP ACTIONS
   */

  runMiner(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    if (!this.miningIndex.isCreepAssigned(creep)) {
      const available = this.miningIndex.findAvailableSlot(creep);
      if (available) {
        this.miningIndex.assignCreep(available, creep);
        this.logisticsIndex.addSource(new LSourceMiner(creep.id, RESOURCE_ENERGY));
      }
    }
    const slot = this.miningIndex.getCreepSlot(creep);
    if (!slot) return;
    if (slot.pos && creep.pos.getRangeTo(slot.pos) > 0) {
      creep.drop(RESOURCE_ENERGY); // drop all if moving
      creep.travelTo(slot.pos);
      return;
    }

    // if creep has extra space
    // pick-up from ground
    // if nothing to pick-up, try containers
    if (creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const dropped = creep.pos.lookFor(LOOK_RESOURCES);
      if (dropped.length > 0) {
        creep.pickup(dropped[0]);
      } else {
        const containers: StructureContainer[] = creep.pos.findInRange(FIND_STRUCTURES, 1, {
          filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
        });
        if (containers.length > 0) {
          creep.withdraw(containers[0], RESOURCE_ENERGY, HARVEST_POWER * creep.getActiveBodyparts(WORK));
        }
      }
    }

    // if creep is full, try to deposit in nearby container
    else {
      const containers: StructureContainer[] = creep.pos.findInRange(FIND_STRUCTURES, 1, {
        filter: s => s.structureType === STRUCTURE_CONTAINER && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
      });
      if (containers.length > 0) {
        creep.transfer(containers[0], RESOURCE_ENERGY, HARVEST_POWER * creep.getActiveBodyparts(WORK));
      }
    }

    const obj = Game.getObjectById(slot.source.id);
    if (obj) creep.harvest(obj);
  }

  runHauler(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    // allocate creep
    if (!this.logisticsIndex.isCreepAllocated(creep)) {
      // allocated sink + currently carrying
      const sources = this.logisticsIndex.getAvailableSource(
        roomId,
        RESOURCE_ENERGY,
        creep.store.getFreeCapacity(RESOURCE_ENERGY)
      );
      if (sources.length > 0) {
        const s = sources[0];
        this.logisticsIndex.allocateSource(
          creep,
          s,
          Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), s.getFreeValue())
        );
      }

      const sinks = this.logisticsIndex.getAvailableSink(
        roomId,
        RESOURCE_ENERGY,
        creep.store.getCapacity(RESOURCE_ENERGY)
      );
      sinks.forEach(s => {
        this.logisticsIndex.allocateSink(creep, s, s.getRemainingValue());
      });
    }

    // do the work
    const alloc = this.logisticsIndex.getCreepAllocation(creep);
    // get sources
    if (alloc && alloc.sources.length > 0) {
      const s = alloc.sources[0];
      const a = s.getAllocation(creep);

      if (creep.store.getFreeCapacity(s.resource) === 0) {
        this.logisticsIndex.deallocateSource(creep, s);
        return;
      }

      if (a) {
        s.pickup(creep, a.value);
        const target = Game.getObjectById(s.id);
        if (!target) {
          this.logisticsIndex.deallocateSource(creep, s);
        } else if (creep.pos.getRangeTo(target.pos) > 1) {
          creep.travelTo(target);
        } else {
          // re-allocate to account for constantly growing miner
          this.logisticsIndex.deallocateSource(creep, s);
          this.logisticsIndex.allocateSource(
            creep,
            s,
            Math.min(creep.store.getFreeCapacity(s.resource), s.getFreeValue())
          );
          s.pickup(creep, a.value);
          this.logisticsIndex.deallocateSource(creep, s);
        }
      }
    }
    // get sinks
    else if (alloc && alloc.sinks.length > 0) {
      const s = alloc.sinks[0];
      const a = s.getAllocation(creep);

      if (creep.store.getUsedCapacity(s.resource) === 0) {
        this.logisticsIndex.deallocateSink(creep, s);
        return;
      }

      if (a) {
        const res = s.deliver(creep, a.value);
        const target = Game.getObjectById(s.id);
        if (target && res === ERR_NOT_IN_RANGE) {
          creep.travelTo(target);
        } else {
          this.logisticsIndex.deallocateSink(creep, s);
        }
      }
    }
  }

  runController(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    this.logisticsIndex.addSink(new TransferSink(creep.id, RESOURCE_ENERGY));
    const room = Game.rooms[roomId];
    if (!room) return;
    if (!room.controller) return;
    this.shareEnergyToNeighbors(creep);

    let dest;
    // try to position inside upgrade stamp
    if (room.memory.bp?.upgrade) {
      const slot = TerrainAlgo.ring(room.memory.bp.upgrade.x, room.memory.bp.upgrade.y, 1).find(xy => {
        const pos = room.getPositionAt(...xy);
        if (!pos) return false;
        // look for obstructions
        return (
          pos.lookFor(LOOK_CREEPS).filter(c => {
            if (c.id === creep.id) return false; // if self
            if (!c.my) return false; // if not mine
            if (!c.name.startsWith(this.prefix)) return false; // if not worker
            if (!c.memory._trav.state) return false; // if moving
            const [cx, cy, stuckCount, cpu, dx, dy, nm] = c.memory._trav.state;
            return dx === c.pos.x || dy === c.pos.y;
          }).length === 0
        );
      });
      if (slot) dest = room.getPositionAt(slot[0], slot[1]);
    }
    // if no stamp, just anywhere
    if (!dest && creep.pos.getRangeTo(room.controller.pos) > 1) {
      dest = room.controller.pos;
    }
    if (dest) creep.travelTo(dest);
    creep.upgradeController(room.controller);
  }

  runBuilder(creep: Creep) {
    const [prefix, type, roomId, idx] = this.splitCreepName(creep.name);
    this.logisticsIndex.addSink(new TransferSink(creep.id, RESOURCE_ENERGY));
    const room = Game.rooms[roomId];
    if (!room) return;
    const sites = room.find(FIND_MY_CONSTRUCTION_SITES);
    if (sites.length === 0) {
      this.runController(creep);
      return;
    }

    if (creep.pos.getRangeTo(sites[0].pos) > 1) {
      creep.travelTo(sites[0].pos);
    } else {
      const totalBuildPower = Math.min(
        BUILD_POWER * creep.getActiveBodyparts(WORK),
        creep.store.getUsedCapacity(RESOURCE_ENERGY)
      );
      const remaining = sites[0].progressTotal - sites[0].progress;
      // expect new building next tick
      if (remaining <= totalBuildPower) {
        const pos = sites[0].pos;
        this.bot.enqueueProcessIn(
          `new.bldg.${roomId}.${pos.x}.${pos.y}`,
          {
            priority: Priority.LOW,
            func: () => {
              pos.lookFor(LOOK_STRUCTURES).forEach(struct => {
                // @ts-ignore
                if (!struct.my) return;
                // @ts-ignore
                if (struct.store?.getCapacity(RESOURCE_ENERGY)) {
                  // @ts-ignore
                  this.logisticsIndex.addSink(new TransferSink<RESOURCE_ENERGY>(struct.id));
                }
              });
            }
          },
          1
        );
      }
    }
    this.shareEnergyToNeighbors(creep);
    creep.build(sites[0]);
  }

  /*
  UTILITY
   */

  private generateWorkerCreepName(type: WorkerType, roomId: string) {
    return this.generateCreepName([type, roomId]);
  }

  private shareEnergyToNeighbors(creep: Creep) {
    const neighbors = creep.pos.findInRange(FIND_MY_CREEPS, 1, {
      filter: c => {
        return (
          c.name.substring(0, 1) === creep.name.substring(0, 1) &&
          c.getActiveBodyparts(CARRY) > 0 &&
          c.store.getUsedCapacity(RESOURCE_ENERGY) < creep.store.getUsedCapacity(RESOURCE_ENERGY)
        );
      }
    });
    if (neighbors.length === 0) return;
    neighbors.sort((a, b) => {
      return a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY);
    });
    const target = neighbors[0];
    const toGive = Math.floor(
      (creep.store.getUsedCapacity(RESOURCE_ENERGY) - target.store.getUsedCapacity(RESOURCE_ENERGY)) / 2
    );
    if (toGive <= 0) return;
    creep.transfer(target, RESOURCE_ENERGY, toGive);
  }

  private getCreepTypeBodyPartCount(creeps: Creep[], part: BodyPartConstant): number {
    return creeps.reduce((a, c) => {
      return a + c.getActiveBodyparts(part);
    }, 0);
  }

  /**
   * Creep count minus the dying ones.
   * Dying means ticks to live is less than time to spawn
   * @param roomId
   * @param type
   * @private
   */
  private getCreepTypeSpawnedCount(roomId: string, type: WorkerType): Creep[] {
    if (!_.has(this.creepsByType, [roomId, type])) {
      _.set(this.creepsByType, [roomId, type], []);
    }
    const creepList: string[] = _.get(this.creepsByType, [roomId, type]);
    return creepList
      .map(cName => {
        return Game.creeps[cName];
      }, 0)
      .filter(c => {
        if (!c) return false;
        if (c.ticksToLive === undefined) return true;
        return c.ticksToLive > c.body.length * CREEP_SPAWN_TIME;
      });
  }

  private generateCreepParts(
    room: Room,
    initialParts: BodyPartConstant[],
    incrementalParts: BodyPartConstant[]
  ): BodyPartConstant[] {
    const initialCost: number = initialParts.reduce((a, p) => a + BODYPART_COST[p], 0);
    const incrementalCost: number = incrementalParts.reduce((a, p) => a + BODYPART_COST[p], 0);
    const increments = Math.floor((room.energyCapacityAvailable - initialCost) / incrementalCost);
    if (increments === 0) throw new Error("cannot afford parts");
    return _.flatten([...initialParts, ...Array(increments).fill(incrementalParts)]);
  }
}
