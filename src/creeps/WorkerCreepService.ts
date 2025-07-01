import BaseCreepService from "../core/BaseCreepService";
import { Priority } from "../core/process-manager/types";
import TerrainAlgo from "../utils/TerrainAlgo";
import { MiningIndex } from "../utils/mining";

enum WorkerType {
  MINER = "m",
  HAULER = "h"
}

const SMALL_MINER = [WORK, MOVE, CARRY];
const SMALL_HAULER = [MOVE, CARRY];

type CreepIndex = {
  [roomId in string]?: {
    [type in string]?: {
      [name in string]?: CreepIndexData;
    };
  };
};
type CreepIndexData = {
  minerSlot?: string[],
  source?: string[]
  sink?: string[]
}|null

type MinerSlotIndex = {
  [roomId in string]?: {
    [xy in string]?: MinerSlotData;
  };
};
type MinerSlotData = {
  target: Id<Source>
  creep?: string[]
}

type SourceIndex = {
  [roomId in string]?: {
    [objectId in string]?: {
      creep?: string[]
    };
  };
};
type SinkIndex = {
  [roomId in string]?: {
    [objectId in string]?: {
      creep?: string[]
    };
  };
};

export default class WorkerCreepService extends BaseCreepService {
  prefix = "w";

  miningIndex: MiningIndex = new MiningIndex()

  initialize() {
    for (const roomId in Game.rooms) {
      this.analyzeSources(roomId);
      this.enqueueAnalyzeRoomSpawns(roomId);
    }
  }

  runCreep(name: string) {
    if (!Game.creeps[name]) return;

    this.bot.enqueueProcess({
      priority: Priority.NORMAL,
      func: () => {
        const creep = Game.creeps[name];
        const [prefix, type, roomId, idx] = this.splitCreepName(name);
        if (!creep) {
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
    const spawns = room.find(FIND_MY_SPAWNS);

    if(spawns.length > 0 && this.miningIndex.findAvailableSlot()){
      this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.MINER, roomId), SMALL_MINER, n => {
        this.runCreep(n);
        this.enqueueAnalyzeRoomSpawns(roomId);
      });
    }

    // if (spawns.length > 0 && sources.length > 0) {
    //   if (this.getWorkerCount(roomId, WorkerType.MINER) < this.getMinerSlotCount(roomId)) {
    //     this.bot.enqueueSpawn(roomId, this.generateWorkerCreepName(WorkerType.MINER, roomId), SMALL_MINER, n => {
    //       this.runCreep(n);
    //       this.enqueueAnalyzeRoomSpawns(roomId);
    //     });
    //   }
    // }
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

  runHauler(creep: Creep) {}

  /*
  UTILITY
   */

  private generateWorkerCreepName(type: WorkerType, roomId: string) {
    return this.generateCreepName([type, roomId]);
  }
}
