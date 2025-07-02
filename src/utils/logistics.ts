type LSourceConstant = Creep
type LSinkConstant = StructureSpawn
type LResourceConstant = RESOURCE_ENERGY
type SourceAllocation = {[id in Id<Creep>]?:AllocationValue}
type SinkAllocation =  {[id in Id<Creep>]?:AllocationValue}
type AllocationValue = { id: Id<Creep>, value: number }
type CreepIndex = {
  sources: LSourceInterface<LSourceConstant>[],
  sinks: LSinkInterface<LSinkConstant>[]
}

interface LSourceInterface<T extends LSourceConstant> {
  id: Id<T>;
  resource: LResourceConstant;
  allocation: SourceAllocation;
  getFreeValue(): number;
  freeAllocation(id: Id<Creep>): void;
  freeAllAllocations(): void;
  allocate(creepId: Id<Creep>, amount: number): void;
  pickup(creep: Creep, amount: number): number;
  getAllocation(creep: Creep): AllocationValue|undefined;
}

interface LSinkInterface<T extends LSinkConstant> {
  id: Id<T>;
  resource: LResourceConstant;
  allocation: SinkAllocation;
  getRemainingValue(): number;
  freeAllocation(id: Id<Creep>): void;
  freeAllAllocation(): void;
  allocate(creepId: Id<Creep>, amount: number): void;
  deliver(creep: Creep, amount: number): number;
  getAllocation(creep: Creep): AllocationValue|undefined;
}

export class LSourceMiner implements LSourceInterface<Creep> {
  allocation: SourceAllocation = {};
  constructor(readonly id: Id<Creep>, readonly resource: LResourceConstant) {}

  getFreeValue(): number {
    const obj = Game.getObjectById(this.id);
    if (!obj) return 0;

    this.clean()

    // use getCapacity, always assume miner is full
    const storedValue = obj.store.getCapacity(this.resource) || 0;

    const allocatedValue = Object.values(this.allocation).reduce((a, alloc) => {
      return a + (alloc?.value || 0);
    }, 0);

    // return 0 if already allocated, 1 creep for 1 miner
    if(allocatedValue > 0){
      return 0
    }
    return Math.max(0, storedValue - allocatedValue);
  }

  freeAllocation(id: Id<Creep>): void {
    delete this.allocation[id];
  }
  freeAllAllocations() {
    for (let i in this.allocation) {
      this.freeAllocation(i as Id<Creep>);
    }
  }

  allocate(creepId: Id<Creep>, amount: number) {
    this.allocation[creepId] = { id: creepId, value: amount };
  }
  pickup(creep: Creep, amount: number): number {
    const other = Game.getObjectById(this.id);
    if (!other) return ERR_INVALID_TARGET;
    return other.transfer(creep, this.resource, Math.min(amount, other.store.getUsedCapacity(this.resource)));
  }

  getAllocation(creep: Creep): AllocationValue|undefined {
    return this.allocation[creep.id]
  }

  protected clean(){
    for (let i in this.allocation) {
      // free allocation if creep does not exist
      if (!Game.getObjectById(i as Id<Creep>)) {
        this.freeAllocation(i as Id<Creep>);
      }
    }
  }
}

export class LSinkSpawn implements LSinkInterface<StructureSpawn> {
  allocation: SinkAllocation = {};
  constructor(readonly id: Id<StructureSpawn>, readonly resource: LResourceConstant) {}

  getRemainingValue(): number {
    const obj = Game.getObjectById(this.id);
    if (!obj) return 0;

    for (let i in this.allocation) {
      // free allocation if creep does not exist
      if (!Game.getObjectById(i as Id<Creep>)) {
        this.freeAllocation(i as Id<Creep>);
      }
    }

    const storedValue = obj.store[this.resource] || 0;
    const allocatedValue = Object.values(this.allocation).reduce((a, alloc) => {
      return a + (alloc?.value || 0);
    }, 0);
    return Math.max(0, storedValue - allocatedValue);
  }

  freeAllocation(id: Id<Creep>): void {
    delete this.allocation[id];
  }
  freeAllAllocation() {
    for (let i in this.allocation) {
      this.freeAllocation(i as Id<Creep>);
    }
  }

  allocate(creepId: Id<Creep>, amount: number) {
    this.allocation[creepId] = { id: creepId, value: amount };
  }
  getAllocation(creep: Creep): AllocationValue | undefined {
    return this.allocation[creep.id]
  }

  deliver(creep: Creep, amount: number): number {
    const other = Game.getObjectById(this.id);
    if (!other) return ERR_INVALID_TARGET;
    return creep.transfer(other, this.resource, Math.min(amount, creep.store.getUsedCapacity(this.resource)));
  }
}

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
    const out: LSourceInterface<LSourceConstant>[] = []
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
    out.sort((a,b) => {
      return  b.getFreeValue() - a.getFreeValue()
    })
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
    const out: LSinkInterface<LSinkConstant>[] = []

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

      if(roomSinks[i] && fulfilled < amount && roomSinks[i].resource === resource){
        fulfilled += roomSinks[i].getRemainingValue();
        out.push(roomSinks[i])
      }
    }

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
