import TerrainAlgo from "../../utils/TerrainAlgo";
export class MinerSlot {
  creepId?: Id<Creep>
  constructor(readonly source: EnergySource, readonly pos: RoomPosition) {
  }

  take(creepId: Id<Creep>): void {
    this.creepId = creepId;
  }

  release(){
    this.creepId = undefined
  }
}
export class EnergySource {
  slots: MinerSlot[] = []
  constructor(readonly id: Id<Source>) {
    const source = Game.getObjectById(id)
    if(!source) throw Error(`EnergySource constructor error: source ${id} does not exist`)
    TerrainAlgo.ring(source.pos.x, source.pos.y, 1)
        .filter(xy => source.room.getTerrain().get(...xy) !== TERRAIN_MASK_WALL)
        .forEach(xy => {
          const slotPos = new RoomPosition(xy[0], xy[1], source.room.name);
          if(!this.slots.find(s => s.pos.isEqualTo(slotPos))){
            this.slots.push(new MinerSlot(this, slotPos))
          }
        });
  }

  findAvailableSlot(): MinerSlot[]{
    const workParts = this.slots
      .map(s => s.creepId ? Game.getObjectById(s.creepId) : null)
      .reduce((a, c) => {
        if(!c) return a;
        return a + c.getActiveBodyparts(WORK);
      }, 0)
    const source = Game.getObjectById(this.id)
    const totalHarvestPower = HARVEST_POWER * workParts
    if(!source) return []

    // if already enough harvest power, mark it as the source as taken
    if(totalHarvestPower >= (source.energyCapacity / ENERGY_REGEN_TIME)){
      return [];
    }

    return this.slots.filter(s => !s.creepId);
  }
}


