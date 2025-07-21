import ServiceInterface from "../ServiceInterface";
import {
  getDistanceTransform,
  getMincut,
  getPositionsByPathCost
} from "../utils/distance_transform/distance-transform.js";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";
import TerrainAlgo from "../utils/TerrainAlgo";
import { ErrorMapper } from "../utils/ErrorMapper";
import { PrintBoxCoordinates } from "../core/visual";

type XY = [number, number];

type LabsData = {
  g1:[XY,XY,XY],
  g2:[XY,XY,XY],
  g3:[XY,XY,XY],
  g4:[XY,XY,XY],
  r: XY[]
}

export type Building = {
  p: XY,
  b: BuildableStructureConstant
}

declare global {
  interface RoomMemory {
    bp?: {
      result?: boolean;
      err?: string;
      distTrans?: number[];
      allocated?: number[];
      upgrade?: StampBox;
      core?: StampBox;
      costMat?: number[];
      labs?: LabsData;
      constructionSites?: XY[];
      potentialRoad?: number[];
      buildings?: Building[];
      ramparts?: XY[];
    };
  }
}

interface StampBox {
  x: number;
  y: number;
  r: number;
}

export class BasePlanningService implements ServiceInterface {
  constructor(readonly bot: Bot) {}

  initialize() {
    Object.keys(Game.rooms).forEach(roomId => {
      this.initializeRoom(roomId);
    });
  }

  debug(coords: PrintBoxCoordinates): PrintBoxCoordinates {
    return coords
  }

  initializeRoom(roomId: string) {
    this.bot.enqueueProcess({
      priority: Priority.LOW,
      func: () => {
        const room = Game.rooms[roomId];
        if (!room) return;
        // only if controller claimed
        if (!room.controller?.my) return;

        // defined result means already done
        if (room.memory.bp?.result !== undefined) {
          return;
        }

        try {
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
          } else if (!room.memory.bp.constructionSites || !room.memory.bp.potentialRoad) {
            this.findBuildingSites(room);
          } else if ((Game.rooms.sim || Game.cpu.tickLimit >= 50) && !room.memory.bp.buildings) {
            this.generateBuildings(room);
          } else if ((Game.rooms.sim || Game.cpu.tickLimit >= 50) && !room.memory.bp.ramparts) {
            this.generateRamparts(room);
          } else {
            // DONE
            room.memory.bp = {
              result: true,
              buildings: room.memory.bp.buildings,
              core: room.memory.bp.core,
              upgrade: room.memory.bp.upgrade,
              labs: room.memory.bp.labs
            };
            return;
          }
        } catch (e) {
          if (e instanceof Error) {
            room.memory.bp = { err: _.escape(ErrorMapper.sourceMappedStackTrace(e)), result: false };
          } else {
            room.memory.bp = { err: String(e), result: false };
          }

          return;
        }

        if (true && room.memory.bp.upgrade) this.renderStamp(room, room.memory.bp.upgrade);
        if (true && room.memory.bp.core) this.renderStamp(room, room.memory.bp.core);
        if (true && room.memory.bp.labs) this.renderLabs(room, room.memory.bp.labs);
        if (true && room.memory.bp.constructionSites)
          this.renderConstructionSites(room, room.memory.bp.constructionSites);
        if (true && room.memory.bp.buildings) this.renderBuildings(room, room.memory.bp.buildings);

        return { scheduleIn: { id: `bp.${roomId}`, t: 1 } };
      }
    });
  }

  findDistTrans(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    const distTrans = getDistanceTransform(room.name, { visual: true });
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

    const spawn = room.find(FIND_MY_SPAWNS)[0];

    if (!spawn && "sim" in Game.rooms) return; // simulations need spawn

    if (spawn) {
      room.memory.bp.core = { x: spawn.pos.x + 1, y: spawn.pos.y + 1, r: 2 };
    } else {
      const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);
      let cost: number = +Infinity;
      let pos: number[] = [0, 0];
      const positions = room.find(FIND_SOURCES).map(s => s.pos);
      if (room.controller) positions.push(room.controller.pos);
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          if (distTrans.get(x, y) < 3) continue;
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

      room.memory.bp.core = { x: pos[0], y: pos[1], r: 2 };
    }

    this.stampBoxAllocate(room, room.memory.bp.core);
  }

  findCostMat(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.core) return;
    const coreCenterPos = room.getPositionAt(room.memory.bp.core.x, room.memory.bp.core.y);
    if (!coreCenterPos) return;
    const costMat = getPositionsByPathCost(room.name, [coreCenterPos], { visual: true });
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

    // keep roads clear
    const road: XY[] = [
      [foundArea[0], foundArea[1] + 3],
      [foundArea[0] + 1, foundArea[1] + 2],
      [foundArea[0] + 2, foundArea[1] + 1],
      [foundArea[0] + 3, foundArea[1]]
    ];
    road.forEach(([x, y]) => {
      allocation.set(x, y, 1);
    });

    allocation.set(foundArea[0] + 1, foundArea[1] + 2, 1);
    allocation.set(foundArea[0] + 2, foundArea[1] + 1, 1);
    allocation.set(foundArea[0] + 3, foundArea[1], 1);

    room.memory.bp.labs = {
      g1: [positions[0], positions[1], positions[2]],
      g2: [positions[3], positions[4], positions[5]],
      g3: [positions[0], positions[6], positions[7]],
      g4: [positions[3], positions[8], positions[9]],
      r: road
    };
    room.memory.bp.allocated = allocation.serialize();
  }

  findBuildingSites(room: Room) {
    if (!room.memory.bp) room.memory.bp = {};
    if (!room.memory.bp.core) return;
    if (!room.memory.bp.upgrade) return;
    if (!room.memory.bp.allocated) return;
    if (!room.memory.bp.costMat) return;
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans || []);
    const allocation = PathFinder.CostMatrix.deserialize(room.memory.bp.allocated);
    const costMat = PathFinder.CostMatrix.deserialize(room.memory.bp.costMat);
    const potentialRoad = new PathFinder.CostMatrix();
    const core = room.memory.bp.core;
    const upgrade = room.memory.bp.upgrade;
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
          // if (costMat.get(x, y) > 10) return;
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

      // add potential road
      [
        [x - 1, y - 1],
        [x + 1, y - 1],
        [x - 1, y + 1],
        [x + 1, y + 1],
        [x - 2, y],
        [x + 2, y],
        [x, y - 2],
        [x, y + 2]
      ].forEach(p => {
        potentialRoad.set(p[0], p[1], 1);
      });

      [
        [x, y],
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y]
      ]
        .filter(([x, y]) => {
          // if collide with core
          if (x >= core.x - core.r && x <= core.x + core.r && y >= core.y - core.r && y <= core.y + core.r)
            return false;
          // if collide with upgrade
          if (
            x >= upgrade.x - upgrade.r &&
            x <= upgrade.x + upgrade.r &&
            y >= upgrade.y - upgrade.r &&
            y <= upgrade.y + upgrade.r
          )
            return false;
          if (allocation.get(x, y) > 0) return;
          return true;
        })
        .forEach(([x, y]) => {
          constructionSites.push([x, y]);
          allocation.set(x, y, 1);
        });
    });

    room.memory.bp.potentialRoad = potentialRoad.serialize();
    room.memory.bp.constructionSites = constructionSites;
  }

  generateBuildings(room: Room) {
    if (!room.memory.bp) return;
    if (!room.memory.bp?.distTrans) return;
    if (!room.memory.bp?.constructionSites) return;
    if (!room.memory.bp?.core) return;
    if (!room.memory.bp?.upgrade) return;
    if (!room.memory.bp?.labs) return;
    if (!room.memory.bp?.potentialRoad) return;

    const buildings: Building[] = [];
    const taken = new PathFinder.CostMatrix();
    const distTrans = PathFinder.CostMatrix.deserialize(room.memory.bp.distTrans);
    const potentialRoad = PathFinder.CostMatrix.deserialize(room.memory.bp.potentialRoad);

    const place = (x: number, y: number, b: BuildableStructureConstant) => {
      if (taken.get(x, y) > 0) throw Error(`Error placing ${b}, position already taken ${x},${y}`);
      buildings.push({ p: [x, y], b: b });
      taken.set(x, y, 1);
    };

    // from core
    place(room.memory.bp.core.x - 1, room.memory.bp.core.y - 1, STRUCTURE_SPAWN);
    place(room.memory.bp.core.x, room.memory.bp.core.y - 1, STRUCTURE_SPAWN);
    place(room.memory.bp.core.x + 1, room.memory.bp.core.y - 1, STRUCTURE_SPAWN);
    place(room.memory.bp.core.x, room.memory.bp.core.y + 1, STRUCTURE_STORAGE);
    place(room.memory.bp.core.x + 1, room.memory.bp.core.y + 1, STRUCTURE_TERMINAL);
    place(room.memory.bp.core.x - 1, room.memory.bp.core.y + 1, STRUCTURE_LINK);

    // upgrade
    place(room.memory.bp.upgrade.x, room.memory.bp.upgrade.y, STRUCTURE_LINK);

    // tower
    let towerCount = this.getMaxBuildingType(STRUCTURE_TOWER);
    _(room.memory.bp.constructionSites)
      .forEach(site => {
        if (towerCount <= 0) return false;
        if (taken.get(site[0], site[1]) > 0) return;
        place(site[0], site[1], STRUCTURE_TOWER);
        towerCount--;
        return;
      })
      .run();

    // extensions
    let extensionCounter = this.getMaxBuildingType(STRUCTURE_EXTENSION);
    _(room.memory.bp.constructionSites)
      .forEach(site => {
        if (extensionCounter <= 0) return false;
        if (taken.get(site[0], site[1]) > 0) return;
        place(site[0], site[1], STRUCTURE_EXTENSION);
        extensionCounter--;
        return;
      })
      .run();

    // labs
    for (let i of [room.memory.bp.labs.g1, room.memory.bp.labs.g2, room.memory.bp.labs.g3, room.memory.bp.labs.g4]) {
      const [sink, source1, source2] = i;
      if (taken.get(sink[0], sink[1]) === 0) place(sink[0], sink[1], STRUCTURE_LAB);
      place(source1[0], source1[1], STRUCTURE_LAB);
      place(source2[0], source2[1], STRUCTURE_LAB);
    }
    room.memory.bp.labs.r.forEach(([x, y]) => {
      place(x, y, STRUCTURE_ROAD);
    });

    // links and containers
    let linkCounter: number =
      this.getMaxBuildingType(STRUCTURE_LINK) - buildings.filter(b => b.b === STRUCTURE_LINK).length;
    let containerCounter: number = this.getMaxBuildingType(STRUCTURE_CONTAINER);
    _(room.find(FIND_SOURCES).filter(s => s.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10).length === 0))
      .forEach(s => {
        if (linkCounter <= 0) return false;
        const sourceRing = TerrainAlgo.ring(s.pos.x, s.pos.y, 1).filter(
          xy => room.getTerrain().get(...xy) !== TERRAIN_MASK_WALL && taken.get(...xy) === 0
        );
        if (sourceRing.length > 0) {
          const cont = sourceRing[0];
          place(cont[0], cont[1], STRUCTURE_CONTAINER);
          containerCounter--;
          const containerRing = TerrainAlgo.ring(...cont, 1).filter(
            xy =>
              room.getTerrain().get(...xy) !== TERRAIN_MASK_WALL && distTrans.get(...xy) >= 2 && taken.get(...xy) === 0
          );
          if (containerRing.length > 0) {
            const link = containerRing[0];
            place(link[0], link[1], STRUCTURE_LINK);
            linkCounter--;
          }
        }
        return;
      })
      .run();

    // last index
    let lastIndex: number = room.memory.bp.constructionSites.findIndex(xy => {
      return taken.get(...xy) === 0;
    });

    // factory
    for (; lastIndex < room.memory.bp.constructionSites.length; lastIndex++) {
      const xy = room.memory.bp.constructionSites[lastIndex];
      if (taken.get(...xy) === 0) {
        place(...xy, STRUCTURE_FACTORY);
        break;
      }
    }

    // observer
    for (; lastIndex < room.memory.bp.constructionSites.length; lastIndex++) {
      const xy = room.memory.bp.constructionSites[lastIndex];
      if (taken.get(...xy) === 0) {
        place(...xy, STRUCTURE_OBSERVER);
        break;
      }
    }
    // power spawn
    for (; lastIndex < room.memory.bp.constructionSites.length; lastIndex++) {
      const xy = room.memory.bp.constructionSites[lastIndex];
      if (taken.get(...xy) === 0) {
        place(...xy, STRUCTURE_POWER_SPAWN);
        break;
      }
    }
    // nuker
    for (; lastIndex < room.memory.bp.constructionSites.length; lastIndex++) {
      const xy = room.memory.bp.constructionSites[lastIndex];
      if (taken.get(...xy) === 0) {
        place(...xy, STRUCTURE_NUKER);
        break;
      }
    }

    // roads within grid
    const tmpBuildings = _.cloneDeep(buildings);
    for (let i in tmpBuildings) {
      const building = tmpBuildings[Number(i)];
      const [x, y] = building.p;
      TerrainAlgo.ring(x, y, 1).forEach(p => {
        if (taken.get(...p) === 0 && potentialRoad.get(...p) > 0 && room.getTerrain().get(...p) !== TERRAIN_MASK_WALL) {
          place(...p, STRUCTURE_ROAD);
        }
      });
    }

    room.memory.bp.buildings = buildings;
  }

  generateRamparts(room: Room) {
    if (!room.memory.bp) return;
    if (!room.memory.bp.buildings) return;
    const buildings = room.memory.bp.buildings;
    const sources = buildings.map(b => room.getPositionAt(b.p[0], b.p[1])) as RoomPosition[];
    const cut = getMincut(room.name, sources);

    room.memory.bp.ramparts = cut.map(p => {
      return [p.x, p.y];
    });
    const newBuildings = room.memory.bp.ramparts.map(xy => {
      return { p: xy, b: STRUCTURE_RAMPART };
    });
    room.memory.bp.buildings = room.memory.bp.buildings.concat(newBuildings);
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
      const [sinkX, sinkY] = s[0];
      const [x1, y1] = s[1];
      const [x2, y2] = s[2];
      room.visual.line(sinkX, sinkY, x1, y1);
      room.visual.line(sinkX, sinkY, x2, y2);
    };
    render(sites.g1);
    render(sites.g2);
    render(sites.g3);
    render(sites.g4);
  }

  private renderBuildings(room: Room, buildings: Building[]) {
    const mapper = {
      [STRUCTURE_SPAWN]: "🟢",
      [STRUCTURE_STORAGE]: "🏦",
      [STRUCTURE_TERMINAL]: "🚅",
      [STRUCTURE_FACTORY]: "🏭",
      [STRUCTURE_LINK]: "📡",
      [STRUCTURE_EXTENSION]: "🟡",
      [STRUCTURE_LAB]: "🎛",
      [STRUCTURE_CONTAINER]: "🫙",
      [STRUCTURE_OBSERVER]: "👁️",
      [STRUCTURE_POWER_SPAWN]: "🔥",
      [STRUCTURE_NUKER]: "💥",
      [STRUCTURE_TOWER]: "🔫"
    };
    buildings.forEach(building => {
      if (building.b === STRUCTURE_RAMPART) {
        room.visual.rect(building.p[0] - 0.5, building.p[1] - 0.5, 1, 1, {
          opacity: 0.4,
          fill: "green"
        });
      } else if (building.b === STRUCTURE_ROAD) {
        room.visual.rect(building.p[0] - 0.5, building.p[1] - 0.5, 1, 1, {
          opacity: 0.4,
          fill: "blue"
        });
      } else {
        // @ts-ignore
        room.visual.text(mapper[building.b] !== undefined ? mapper[building.b] : "", building.p[0], building.p[1]);
      }
    });
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

  private getMaxBuildingType(t: BuildableStructureConstant): number {
    return Math.max(...Object.values(CONTROLLER_STRUCTURES[t]));
  }
}

