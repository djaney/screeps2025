import { EnergySource, MinerSlot } from "../mining/mining";

export default class SlotIndex {
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

  slotCount(){
    let slots = 0;
    for(let i in this.rooms){
      for(let j in this.rooms[i]){
        slots += _.size(this.rooms[i][j as Id<Source>].slots)
      }
    }
    return slots;
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
