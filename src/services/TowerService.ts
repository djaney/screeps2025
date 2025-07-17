import ServiceInterface from "../ServiceInterface";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";


export default class TowerService implements ServiceInterface {
  constructor(readonly bot: Bot) {}
  initialize(): void {
    _.forEach(Game.rooms, room => {
      const roomId = room.name;
      this.initializeRoom(roomId);
    });
  }

  initializeRoom(roomId: string) {

    this.bot.enqueueProcess({
        priority: Priority.NORMAL,
        func: () => {

          const room = Game.rooms[roomId];
          if (!room) return;
          const RETURN_NEXT = { scheduleIn: { id: `tower.${roomId}`, t: 1 } };

          const towers = room.find(FIND_MY_STRUCTURES, {
            filter: s => s.structureType === STRUCTURE_TOWER
          }) as StructureTower[];
          if(towers){
            if(this.attackHostile(room, towers)) return RETURN_NEXT;
            if(this.repairDefense(room, towers)) return RETURN_NEXT;
            if(this.repairAll(room, towers)) return RETURN_NEXT;
          }



          return RETURN_NEXT;
        }
      });
  }

  repairDefense(room: Room, towers: StructureTower[]): boolean{
    const targetRamparts = room.find(FIND_MY_STRUCTURES, {
      filter: s => s.structureType in [STRUCTURE_RAMPART, STRUCTURE_WALL]  && s.hits < 1000
    }) as StructureRampart[];

    targetRamparts.sort((a, b) => a.hits - b.hits)
    if(targetRamparts.length > 0){
      towers.forEach(t => {
        t.repair(targetRamparts[0]);
      });
      return true;
    }
    return false;
  }

  repairAll(room: Room, towers: StructureTower[]): boolean{
    const targets = room.find(FIND_STRUCTURES, {
      filter: s => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL}) as StructureRampart[];
    targets.sort((a, b) => a.hits/a.hitsMax - b.hits/b.hitsMax)

    if(targets.length > 0){
      towers.forEach(t => {
        t.repair(targets[0]);
      });
      return true;
    }
    return false;
  }

  attackHostile(room: Room, towers: StructureTower[]): boolean{
    const targetCreep = room.find(FIND_HOSTILE_CREEPS)[0];
    if(targetCreep){
      towers.forEach(t => {
        t.attack(targetCreep);
      });
      return true;
    }
    return false;
  }
}
