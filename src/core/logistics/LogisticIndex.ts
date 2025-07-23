import {
  CreepIndex,
  LResourceConstant,
  LSinkConstant,
  LSinkInterface,
  LSourceConstant,
  LSourceInterface
} from "./logistics";
export class LogisticIndex {
  sources: {
    [roomId in string]: LSourceInterface<LSourceConstant>[];
  } = {};

  sinks: {
    [roomId in string]: LSinkInterface<LSinkConstant>[];
  } = {};

  creeps: {
    [creepId in Id<Creep> ]: CreepIndex;
  } = {};


  addSource(s: LSourceInterface<LSourceConstant>){
    const obj = Game.getObjectById(s.id);
    if(!s) return;
    if(!obj) return;
    if(!this.sources[obj.pos.roomName]) {
      this.sources[obj.pos.roomName] = []
    }
    if(this.sources[obj.pos.roomName].find(s2 => s2 && s2.id === s.id)) return
    this.sources[obj.pos.roomName].push(s)
  }
  addSink(s: LSinkInterface<LSinkConstant>){
    const obj = Game.getObjectById(s.id);
    if(!s) return;
    if(!obj) return;
    if(!this.sinks[obj.pos.roomName]) {
      this.sinks[obj.pos.roomName] = []
    }
    if(this.sinks[obj.pos.roomName].find(s2 => s2 && s2.id === s.id)) return
    this.sinks[obj.pos.roomName].push(s)
  }

  /**
   * Return right amount of sources for the amount you requested
   * @param roomId
   * @param resource
   * @param amount
   */
  getAvailableSource(roomId: string, resource: LResourceConstant, amount: number): LSourceInterface<LSourceConstant>[]{
    const roomSources = this.sources[roomId];
    if(!roomSources) return []
    let fulfilled = 0;
    let out: LSourceInterface<LSourceConstant>[] = []
    for (let i in roomSources){
      // cleanup
      if(!Game.getObjectById(roomSources[i].id)){
        // remove creep allocation relating to this sink
        Object.values(roomSources[i].allocation).forEach(a => {
          if(!a?.id) return;
          _.remove(this.creeps[a.id].sources, s => s.id === roomSources[i].id)
        })
        delete roomSources[i]
      }
      if(roomSources[i] && fulfilled < amount && roomSources[i].resource === resource){
        const sourceValue = roomSources[i].getFreeValue();
        if(sourceValue > 0){
          fulfilled += roomSources[i].getFreeValue();
          out.push(roomSources[i])
        }
      }
    }
    const getSourceAllocationValue = (a: LSourceInterface<any>) => {
      return Object.values(a.allocation).reduce((acc, alloc) => {
        if(!alloc) return acc;
        const obj = Game.getObjectById(alloc.id);
        if(!obj) return acc;

        return acc + obj.store.getUsedCapacity(a.resource)
      }, 0);
    }
    // separate storages
    const storages = _.remove(out, s => {
      const o = Game.getObjectById(s.id);
      if(!o) return false;
      return (o as StructureStorage).structureType == STRUCTURE_STORAGE
    });
    // sort by least allocated
    out.sort((a,b) => {
      return  getSourceAllocationValue(b) - getSourceAllocationValue(a);
    });
    // join
    out = out.concat(storages)
    return out;
  }
  /**
   * Return right amount of sinks for the amount you requested
   * @param roomId
   * @param resource
   * @param amount
   */
  getAvailableSink(roomId: string, resource: LResourceConstant, amount: number): LSinkInterface<LSinkConstant>[]{
    const roomSinks = this.sinks[roomId];
    if(!roomSinks) return []
    let fulfilled = 0;
    let out: LSinkInterface<LSinkConstant>[] = []
    for (let i in roomSinks){
      // cleanup
      if(!Game.getObjectById(roomSinks[i].id)){
        // remove creep allocation relating to this sink
        Object.values(roomSinks[i].allocation).forEach(a => {
          if(!a?.id) return;
          _.remove(this.creeps[a.id].sinks, s => s.id === roomSinks[i].id)
        })
        delete roomSinks[i]
      }
      // @ts-ignore
      const sinkRemaining = roomSinks[i] ? roomSinks[i].getRemainingValue() : 0;
      if(roomSinks[i] && sinkRemaining > 0 && fulfilled < amount && roomSinks[i].resource === resource){
        fulfilled += roomSinks[i].getRemainingValue();
        out.push(roomSinks[i])
      }
    }
    // separate storages
    const storages = _.remove(out, s => {
      const o = Game.getObjectById(s.id);
      if(!o) return false;
      return (o as StructureStorage).structureType == STRUCTURE_STORAGE
    });
    out.sort((a, b) => {
      return a.lastTick - b.lastTick;
    });
    out = out.concat(storages)
    return out;
  }

  allocateSource(creep: Creep, source: LSourceInterface<LSourceConstant>, amount: number): void {
    source.allocate(creep.id, amount);
    this.initializeCreep(creep.id);
    this.creeps[creep.id].sources.push(source);

  }
  allocateSink(creep: Creep, sink: LSinkInterface<LSinkConstant>, amount: number): void {
    sink.allocate(creep.id, amount);
    this.initializeCreep(creep.id);
    this.creeps[creep.id].sinks.push(sink);
  }

  deallocateSource(creep: Creep, source: LSourceInterface<LSourceConstant>): void {
    source.freeAllocation(creep.id);
    if(this.creeps[creep.id]){
      _.remove(this.creeps[creep.id].sources, s => s.id === source.id)
    }
  }

  deallocateSink(creep: Creep, sink: LSinkInterface<LSinkConstant>): void {
    sink.freeAllocation(creep.id);
    if(this.creeps[creep.id]){
      _.remove(this.creeps[creep.id].sinks, s => s.id === sink.id)
    }
  }

  getCreepAllocation(creep: Creep){
    return this.creeps[creep.id]
  }

  isCreepAllocated(creep: Creep){
    const alloc = this.getCreepAllocation(creep);
    if(!alloc) return false;
    return alloc.sources.length > 0 || alloc.sinks.length > 0
  }

  private initializeCreep(id: Id<Creep>){
    if(!this.creeps[id]){
      this.creeps[id] = {
        sources: [],
        sinks: []
      }
    }
  }

}
