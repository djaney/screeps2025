import BaseCreepService from "../core/BaseCreepService";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";

declare global {
  interface RoomMemory {
    /**
     * Classification of room
     */
    cl?: RoomClassification;
    /**
     * Rooms exploted by this room
     */
    ex?: string[]; // rooms exploited
    /**
     * Parent of exploited room
     */
    pa?: string; // parent of exploited room
    /**
     * Verified classification
     */
    ve?: boolean; // is it verified as exploitable - check if there are resources
  }

  interface CreepMemory {
    /**
     * Target to explore
     */
    ex?: string; // room to explore
  }
}

export enum RoomClassification {
  /**
   * City is a room with your spawn
   */
  CITY = "cit",
  /**
   * A room that you want to be exploited by a city. Resources from this room is transported to the city.
   */
  EXPLOIT = "exp",
  /**
   * Nothing significant in this room
   */
  SKIP = "ski"
}

export default class ExplorationCreepService extends BaseCreepService {
  prefix: string = "e";
  creeps: { [roomId in string]?: Id<Creep>[] } = {};

  constructor(readonly bot: Bot) {
    super(bot);
  }

  initialize() {
    for (const roomId in Game.rooms) {
      this.initializeRoom(roomId);
    }
  }

  initializeRoom(roomId: string) {
    super.initializeRoom(roomId);
    this.classifyRoom(roomId);
    this.enqueueAnalyzeSpawn(roomId);
  }

  runCreep(name: string): void {
    this.registerCreep(name);
    this.bot.enqueueProcess({
      priority: Priority.LOW,
      func: () => {
        const creep = Game.creeps[name];
        if (!creep) return;
        if (!creep.memory.ex) return;

        if (creep.room.name !== creep.memory.ex) {
          const exitConstant = creep.room.findExitTo(creep.memory.ex);
          if (exitConstant > 0) {
            const goTo = creep.room.find(exitConstant as ExitConstant);
            if (goTo.length > 0) {
              creep.travelTo(goTo[0]);
            }
          }
        } else {
          const p = creep.pos;
          if (p.x === 0 && p.y === 0) {
            creep.move(BOTTOM_RIGHT);
          } else if (p.x === 49 && p.y === 0) {
            creep.move(BOTTOM_LEFT);
          } else if (p.x === 0 && p.y === 49) {
            creep.move(TOP_RIGHT);
          } else if (p.x === 49 && p.y === 49) {
            creep.move(TOP_LEFT);
          } else if (p.x === 0) {
            creep.move(RIGHT);
          } else if (p.x === 49) {
            creep.move(LEFT);
          } else if (p.y === 0) {
            creep.move(BOTTOM);
          } else if (p.y === 49) {
            creep.move(TOP);
          }
          this.classifyRoom(creep.memory.ex);
        }
        return {scheduleIn: {id: `${this.prefix}.runCreep.${name}`, t: 1}}
      }
    });
  }

  registerCreep(name: string) {
    const creep = Game.creeps[name];
    if (!creep) return;
    const [prefix, roomId, idx] = this.splitCreepName(name);
    if (!this.creeps[roomId]) {
      this.creeps[roomId] = [];
    }
    this.creeps[roomId]?.push(creep.id);
    this.assignExplorationRoom(creep, roomId);
  }

  private assignExplorationRoom(creep: Creep, roomId: string) {
    if (!creep.memory.ex) {
      // find room not yet explored by creep
      const roomToExplore = (creep.room.memory.ex || []).find(
        r => !this.creeps[roomId]?.find(c => Game.getObjectById(c)?.memory.ex === r)
      );
      if (roomToExplore) {
        creep.memory.ex = roomToExplore;
      }
    }
  }

  private classifyRoom(roomId: string) {
    this.bot.enqueueProcess({
      priority: Priority.LOW,
      func: () => {
        const room = Game.rooms[roomId];
        if (!room) return;

        // if it has at least 1 spawn
        if (!room.memory.cl && room.find(FIND_MY_SPAWNS).length > 0) {
          room.memory.cl = RoomClassification.CITY;
        }

        if (room.memory.cl === RoomClassification.CITY && !room.memory.ex) {
          // find rooms to exploit
          const exits = Object.values(Game.map.describeExits(roomId) || {}).filter(r => !Memory.rooms[r]?.cl);
          exits.forEach(r => {
            if (!Memory.rooms[r]) Memory.rooms[r] = {};
            Memory.rooms[r].cl = RoomClassification.EXPLOIT;
            Memory.rooms[roomId].pa = roomId;
          });
          room.memory.ex = exits;
        }

        if (room.memory.cl === RoomClassification.EXPLOIT && !room.memory.ve) {
          if (room.find(FIND_SOURCES).length > 0) {
            room.memory.ve = true;
          } else {
            room.memory.cl = RoomClassification.SKIP;
          }
        }
      }
    });
  }

  private enqueueAnalyzeSpawn(roomId: string) {
    this.bot.enqueueProcessIn(
      `${this.prefix}.spawn`,
      {
        priority: Priority.LOW,
        func: () => {
          const room = Game.rooms[roomId];
          if (!room) return;
          if (this.bot.countSpawnQueue(roomId) > 0) return;
          if (!room.memory.ex || room.memory.ex.length === 0) return;

          if (room.memory.ex.length > (this.creeps[roomId]?.length || 0)) {
            this.bot.enqueueSpawn(roomId, this.generateCreepName([roomId]), [MOVE], name => {
              this.runCreep(name);
            });
          }
          return { scheduleIn: { id: `${this.prefix}.spawn`, t: 7 } };
        }
      },
      7
    );
  }
}
