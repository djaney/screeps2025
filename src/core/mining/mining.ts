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

export class MiningIndex {
  rooms: {
    [roomId in string]: {
      [sourceId in Id<Source>]: EnergySource
    }
  } = {}

  creeps: {
    [creepId in Id<Creep>]: MinerSlot
  } = {}

  addRoom(room: Room){
    if(this.rooms[room.name]) return; // stop if already added
    this.rooms[room.name] = {};

    room.find(FIND_SOURCES).filter(s => s.pos.findInRange(FIND_HOSTILE_STRUCTURES, 10).length === 0).map(s => {
      this.rooms[room.name][s.id] = new EnergySource(s.id)
    })
  }
  removeRoom(roomId: string): void{
    delete this.rooms[roomId]
  }

  assignCreep(slot: MinerSlot, creep: Creep){
    slot.take(creep.id)
    this.creeps[creep.id] = slot
  }
  removeCreep(creepId: Id<Creep>){
    const slot = this.creeps[creepId];
    delete this.creeps[creepId]
    slot.release()
  }

  getCreepSlot(creep: Creep): MinerSlot{
    return this.creeps[creep.id]
  }

  getCreepCount(): number{
    return _.size(this.creeps)
  }

  isCreepAssigned(creep: Creep){
    return !!this.creeps[creep.id]
  }

  findAvailableSlot(): MinerSlot|undefined {
    // clean-up creeps first
    for(let i in this.creeps){
      if(!Game.getObjectById(i as Id<Creep>)) {
        this.removeCreep(i as Id<Creep>)
      }
    }

    let slots: MinerSlot[] = []
    for(let i in this.rooms){
      for(let j in this.rooms[i]){
        const s = this.rooms[i][j as Id<Source>].findAvailableSlot();
        slots = [...slots, ...s]
      }
    }
    return slots[0]
  }
}
