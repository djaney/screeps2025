import ServiceInterface from "../ServiceInterface";
import { getDistanceTransform, getPositionsByPathCost } from "../utils/distance_transform/distance-transform.js";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";

declare global {
  interface RoomMemory {
    bp?: {
      distTrans?: number[],
      costMat?: number[],
      allocated?: number[],
      upgrade?: StampBox,
      core?: StampBox,
    }
  }
}

interface StampBox {
  x: number,
  y: number,
  r: number,
}

export class BasePlanningService implements ServiceInterface {
  constructor(readonly bot: Bot, readonly debug = true) {}
  initialize() {
    Object.keys(Game.rooms).forEach(roomId => {
      this.bot.enqueueProcess({
        priority: Priority.LOW,
        func: () => {
          const room = Game.rooms[roomId];
          if(!room) return
          if(!room.memory.bp) room.memory.bp = {};
          if(!room.memory.bp.distTrans){
            this.findDistTrans(room);
          }else if(!room.memory.bp.costMat){
            this.findCostMat(room);
          }else if(room.memory.bp.distTrans && room.memory.bp.costMat && !room.memory.bp.upgrade){
            this.findUpgrade(room);
          }else if(room.memory.bp.distTrans && room.memory.bp.costMat && !room.memory.bp.core){
            this.findCore(room);
          }

          if(this.debug && room.memory.bp.upgrade) this.renderStamp(room, room.memory.bp.upgrade)
          if(this.debug && room.memory.bp.core) this.renderStamp(room, room.memory.bp.core)

          return {scheduleIn: {id: `bp.${roomId}`, t: 1}}
        }
      });
    });
  }

  findDistTrans(room: Room){
    if(!room.memory.bp) room.memory.bp = {}
    const distTrans = getDistanceTransform(room.name, {visual: this.debug});
    room.memory.bp.distTrans = distTrans.serialize();
  }

  findCostMat(room: Room){
    if(!room.memory.bp) room.memory.bp = {}
    const positions = room.find(FIND_SOURCES).map(s => s.pos);

    if(room.controller){
      positions.push(room.controller.pos);
    }
    const costMat = getPositionsByPathCost(room.name, positions, {visual: this.debug});
    room.memory.bp.costMat = costMat.serialize();
  }

  /**
   * Find 5x5 square
   * nearest to all
   * @param room
   */
  findUpgrade(room: Room){
    if(!room.memory.bp) room.memory.bp = {}
    if(!room.controller) return;
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);


    let cost: number = +Infinity;
    let pos: number[] = [0,0];
    for(let x=0; x<50;x++){
      for(let y=0; y<50;y++){
        if(distTrans.get(x,y) < 2) continue;
        const c = room.controller.pos.getRangeTo(x, y)
        if(cost > c){
          cost = c
          pos = [x,y]
        }
      }
    }

    room.memory.bp.upgrade = {x: pos[0], y: pos[1], r: 1}
    this.stampBoxAllocate(room, room.memory.bp.upgrade)
  }

  /**
   * Find 5x5 square
   * nearest to all
   * @param room
   */
  findCore(room: Room){
    if(!room.memory.bp) room.memory.bp = {}
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);

    let cost: number = +Infinity;
    let pos: number[] = [0,0];
    const positions = room.find(FIND_SOURCES).map(s => s.pos);
    if(room.controller) positions.push(room.controller.pos)
    for(let x=0; x<50;x++){
      for(let y=0; y<50;y++){
        if(distTrans.get(x,y) < 4) continue;
        if(this.isStampBoxAllocated(room, {x: x, y: y, r: 3})) continue;
        const c = (positions.map(p => p.getRangeTo(x, y)))
          .reduce((a, d) => {
            return a + d;
          }, 0) / positions.length;
        if(cost > c){
          cost = c
          pos = [x,y]
        }
      }
    }

    room.memory.bp.core = {x: pos[0], y: pos[1], r: 3}
    this.stampBoxAllocate(room, room.memory.bp.core)
  }

  private renderStamp(room: Room, stamp: StampBox){
    room.visual.rect(stamp.x-stamp.r, stamp.y-stamp.r, stamp.r*2, stamp.r*2)
  }

  private stampBoxAllocate(room: Room, box: StampBox){
    if (!room.memory.bp) room.memory.bp = {};
    let allocations: CostMatrix;
    if (room.memory.bp.allocated){
      allocations = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    }else {
      allocations = new PathFinder.CostMatrix();
    }
    for(let x = box.x - box.r; x <= box.x + box.r; x++){
      for(let y = box.y - box.r; y <= box.y + box.r; y++){
        allocations.set(x, y, 1);
      }
    }
    room.memory.bp.allocated = allocations.serialize();
  }

  private isStampBoxAllocated(room: Room, box: StampBox): boolean{
    if (!room.memory.bp) return false;
    let allocations;
    if (!room.memory.bp.allocated) return false;
    allocations = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    for(let x = box.x - box.r; x <= box.x + box.r; x++){
      for(let y = box.y - box.r; y <= box.y + box.r; y++){
        if(allocations.get(x, y) > 0) return true
      }
    }
    return false;
  }
}
