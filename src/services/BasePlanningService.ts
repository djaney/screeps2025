import ServiceInterface from "../ServiceInterface";
import { getDistanceTransform, getPositionsByPathCost } from "../utils/distance_transform/distance-transform.js";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";

type XY = [number, number];

type LabsData = {
  g1:[XY,XY,XY],
  g2:[XY,XY,XY],
  g3:[XY,XY,XY],
  g4:[XY,XY,XY],
}

declare global {
  interface RoomMemory {
    bp?: {
      distTrans?: number[];
      allocated?: number[];
      upgrade?: StampBox;
      core?: StampBox;
      costMat?: number[];
      labs?: LabsData;
      constructionSites?: XY[];
    };
  }
}

interface StampBox {
  x: number;
  y: number;
  r: number;
}

export class BasePlanningService implements ServiceInterface {
  constructor(readonly bot: Bot, readonly debug = true) {}

  initialize() {
    Object.keys(Game.rooms).forEach(roomId => {
      this.bot.enqueueProcess({
        priority: Priority.LOW,
        func: () => {
          const room = Game.rooms[roomId];
          if (!room) return;
          if (!room.memory.bp) room.memory.bp = {};
          if (!room.memory.bp.distTrans) {
            this.findDistTrans(room);
          } else if (room.memory.bp.distTrans && !room.memory.bp.upgrade) {
            this.findUpgrade(room);
          } else if (room.memory.bp.distTrans && !room.memory.bp.core) {
            this.findCore(room);
          } else if (!room.memory.bp.costMat) {
            this.findCostMat(room);
          } else if (!room.memory.bp.labs) {
            this.findLabs(room);
          } else if (!room.memory.bp.constructionSites) {
            this.findBuildingSites(room);
          }

          if (this.debug && room.memory.bp.upgrade) this.renderStamp(room, room.memory.bp.upgrade);
          if (this.debug && room.memory.bp.core) this.renderStamp(room, room.memory.bp.core);
          if (this.debug && room.memory.bp.labs) this.renderLabs(room, room.memory.bp.labs);
          if(this.debug && room.memory.bp.constructionSites) this.renderConstructionSites(room, room.memory.bp.constructionSites)

          return { scheduleIn: { id: `bp.${roomId}`, t: 1 } };
        }
      });
    });
  }

  findDistTrans(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    const distTrans = getDistanceTransform(room.name, { visual: this.debug });
    room.memory.bp.distTrans = distTrans.serialize();
  }

  /**
   * Find 5x5 square
   * nearest to all
   * @param room
   */
  findUpgrade(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.controller) return;
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);

    let cost: number = +Infinity;
    let pos: number[] = [0, 0];
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (distTrans.get(x, y) < 2) continue;
        const c = room.controller.pos.getRangeTo(x, y);
        if (cost > c) {
          cost = c;
          pos = [x, y];
        }
      }
    }

    room.memory.bp.upgrade = { x: pos[0], y: pos[1], r: 1 };
    this.stampBoxAllocate(room, room.memory.bp.upgrade);
  }

  /**
   * Find 5x5 square
   * nearest to all
   * @param room
   */
  findCore(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);

    let cost: number = +Infinity;
    let pos: number[] = [0, 0];
    const positions = room.find(FIND_SOURCES).map(s => s.pos);
    if (room.controller) positions.push(room.controller.pos);
    for (let x = 0; x < 50; x++) {
      for (let y = 0; y < 50; y++) {
        if (distTrans.get(x, y) < 4) continue;
        if (this.isStampBoxAllocated(room, { x: x, y: y, r: 3 })) continue;
        const c =
          positions
            .map(p => p.getRangeTo(x, y))
            .reduce((a, d) => {
              return a + d;
            }, 0) / positions.length;
        if (cost > c) {
          cost = c;
          pos = [x, y];
        }
      }
    }

    room.memory.bp.core = { x: pos[0], y: pos[1], r: 3 };
    this.stampBoxAllocate(room, room.memory.bp.core);
  }

  findCostMat(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.core) return;
    const coreCenterPos = room.getPositionAt(room.memory.bp.core.x, room.memory.bp.core.y);
    if (!coreCenterPos) return;
    const costMat = getPositionsByPathCost(room.name, [coreCenterPos], { visual: this.debug });
    room.memory.bp.costMat = costMat.serialize();
  }

  findLabs(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.core) return;
    if (!room.memory.bp.allocated) return;
    const allocation = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);

    const startPos = room.getPositionAt(room.memory.bp.core.x, room.memory.bp.core.y);
    if (!startPos) return;

    const generatePositions = (x: number, y: number): XY[] => {
      return [
        // build this group first
        [x + 1, y + 1], // 1SINK
        [x + 0, y + 2], // 1
        [x + 0, y + 1], // 1
        // build second group
        [x + 2, y + 2], // 2SINK
        [x + 2, y + 3], // 2
        [x + 1, y + 3], // 2
        // build additional sources
        [x + 1, y + 0], // 1
        [x + 2, y + 0], // 1
        [x + 3, y + 1], // 2
        [x + 3, y + 2] // 2
      ];
    };

    const foundArea = this.findArea(
      startPos,
      2,
      (x, y) => {
        return !generatePositions(x, y).find(xy => {
          // return true if there is an obstruction
          return allocation.get(xy[0], xy[1]) > 0;
        });
      },
      { maxCost: 10 }
    );

    if (!foundArea) {
      throw new Error("Unable to find space for labs");
    }
    const positions = generatePositions(foundArea[0], foundArea[1]);
    positions.forEach(([x, y]) => allocation.set(x, y, 1));
    room.memory.bp.labs = {
      g1: [positions[0], positions[1], positions[2]],
      g2: [positions[3], positions[4], positions[5]],
      g3: [positions[0], positions[6], positions[7]],
      g4: [positions[3], positions[8], positions[9]],
    }
    room.memory.bp.allocated = allocation.serialize();
  }

  findBuildingSites(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.core) return;
    if (!room.memory.bp.allocated) return;
    if (!room.memory.bp.costMat) return;
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);
    const allocation = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    const costMat = PathFinder.CostMatrix.deserialize(room.memory.bp.costMat);
    let open: XY[] = [[room.memory.bp.core.x, room.memory.bp.core.y]];
    let close: XY[] = [];
    let diagStep = 5;
    let first = true;
    const visited = new PathFinder.CostMatrix();
    let itr = 0;
    while (true) {
      // fill open
      let tmpOpen: XY[] = [];
      if (open.length === 0) break;

      // work on open, new open in temporary
      open.forEach(([x, y]) => {
        visited.set(x, y, 1);
        [
          [x - diagStep, y - diagStep],
          [x + diagStep, y - diagStep],
          [x - diagStep, y + diagStep],
          [x + diagStep, y + diagStep]
        ].forEach(([x, y]) => {
          if (x < 1 || x > 49) return;
          if (y < 1 || y > 49) return;
          if (visited.get(x, y) > 0) return;
          if (costMat.get(x, y) > 10) return;
          tmpOpen.push([x, y]);
          visited.set(x, y, 1);
        });
      });

      if (first && tmpOpen.length > 0) {
        tmpOpen = [tmpOpen[0]];
        first = false;
      }
      // open to close
      close = close.concat(tmpOpen);
      // temporary open to open
      open = tmpOpen;
      diagStep = 2;
    }
    const constructionSites: XY[] = [];

    close.sort((a, b) => {
      return costMat.get(a[0], a[1]) - costMat.get(b[0], b[1]);
    });

    close.forEach(([x, y]) => {
      if (room.getTerrain().get(x, y) > 0) return;
      if (distTrans.get(x, y) <= 1) return;
      if (allocation.get(x, y) > 0) return;
      [
        [x, y],
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y]
      ].forEach(([x, y]) => {
        constructionSites.push([x, y]);
        allocation.set(x, y, 1);
      });
    });

    room.memory.bp.constructionSites = constructionSites;
  }

  private renderStamp(room: Room, stamp: StampBox) {
    room.visual.rect(stamp.x - stamp.r, stamp.y - stamp.r, stamp.r * 2, stamp.r * 2);
  }

  private stampBoxAllocate(room: Room, box: StampBox) {
    if (!room.memory.bp) room.memory.bp = {};
    let allocations: CostMatrix;
    if (room.memory.bp.allocated) {
      allocations = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    } else {
      allocations = new PathFinder.CostMatrix();
    }
    for (let x = box.x - box.r; x <= box.x + box.r; x++) {
      for (let y = box.y - box.r; y <= box.y + box.r; y++) {
        allocations.set(x, y, 1);
      }
    }
    room.memory.bp.allocated = allocations.serialize();
  }

  private isStampBoxAllocated(room: Room, box: StampBox): boolean {
    if (!room.memory.bp) return false;
    let allocations;
    if (!room.memory.bp.allocated) return false;
    allocations = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    for (let x = box.x - box.r; x <= box.x + box.r; x++) {
      for (let y = box.y - box.r; y <= box.y + box.r; y++) {
        if (allocations.get(x, y) > 0) return true;
      }
    }
    return false;
  }

  private isGridAllocated(room: Room, x: number, y: number, allocations: CostMatrix): boolean {
    if (!room.memory.bp) return false;
    if (!room.memory.bp.allocated) return false;

    return !![
      [x, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y],
      [x + 1, y]
    ].find(([x, y]) => {
      return allocations.get(x, y) > 0;
    });
  }

  private allocateGrid(room: Room, x: number, y: number, allocations: CostMatrix) {
    if (!room.memory.bp) return;
    if (!room.memory.bp.allocated) return;
    [
      [x, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y],
      [x + 1, y]
    ].forEach(([x, y]) => allocations.set(x, y, 1));
  }

  private renderConstructionSites(room: Room, constructionSites: XY[]) {
    constructionSites.forEach(([x, y]) => {
      room.visual.circle(x, y);
    });
  }

  private renderLabs(room: Room, sites: LabsData) {
    const render = (s: [XY, XY, XY]) => {
      const [sinkX, sinkY] = s[0]
      const [x1, y1] = s[1]
      const [x2, y2] = s[2]
      room.visual.line(sinkX, sinkY, x1, y1)
      room.visual.line(sinkX, sinkY, x2, y2)
    }
    render(sites.g1)
    render(sites.g2)
    render(sites.g3)
    render(sites.g4)


  }

  private findArea(
    pos: RoomPosition,
    step: number,
    isFound: (x: number, y: number) => boolean,
    options: {
      maxCost: number;
    } = { maxCost: 10 }
  ) {
    const room = Game.rooms[pos.roomName];
    if (!room) return;
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.costMat) return;
    const costMat = PathFinder.CostMatrix.deserialize(room.memory.bp.costMat);
    let open: XY[] = [[pos.x, pos.y]];
    let close: XY[] = [];
    const visited = new PathFinder.CostMatrix();
    while (true) {
      // fill open
      let tmpOpen: XY[] = [];
      if (open.length === 0) break;

      // work on open, new open in temporary
      open.forEach(([x, y]) => {
        visited.set(x, y, 1);
        [
          [x - step, y - step],
          [x + step, y - step],
          [x - step, y + step],
          [x + step, y + step]
        ].forEach(([x, y]) => {
          if (x < 1 || x > 49) return;
          if (y < 1 || y > 49) return;
          if (visited.get(x, y) > 0) return;
          if (costMat.get(x, y) > options.maxCost) return;
          visited.set(x, y, 1);

          tmpOpen.push([x, y]);

          if (isFound(x, y)) {
            close.push([x, y]);
          }
        });
      });

      // temporary open to open
      open = tmpOpen;
      if (close.length > 0) break;
    }
    return close[0];
  }
}
