export type LSourceConstant = Creep | StructureStorage
export type LSinkConstant = StructureSpawn|Creep|StructureExtension|StructureTower|StructureStorage
export type LResourceConstant = RESOURCE_ENERGY
export type NodeAllocation = {[id in Id<Creep>]?:AllocationValue}
export type AllocationValue = { id: Id<Creep>, value: number }
export type CreepIndex = {
  sources: LSourceInterface<LSourceConstant>[],
  sinks: LSinkInterface<LSinkConstant>[]
}

export interface LSourceInterface<T extends LSourceConstant> {
  id: Id<T>;
  resource: LResourceConstant;
  allocation: NodeAllocation;
  getFreeValue(): number;
  freeAllocation(id: Id<Creep>): void;
  freeAllAllocations(): void;
  allocate(creepId: Id<Creep>, amount: number): void;
  pickup(creep: Creep, amount: number): number;
  getAllocation(creep: Creep): AllocationValue|undefined;
}

export interface LSinkInterface<T extends LSinkConstant> {
  id: Id<T>;
  resource: LResourceConstant;
  allocation: NodeAllocation;
  lastTick: number
  getRemainingValue(): number;
  freeAllocation(id: Id<Creep>): void;
  freeAllAllocations(): void;
  allocate(creepId: Id<Creep>, amount: number): void;
  deliver(creep: Creep, amount: number): number;
  getAllocation(creep: Creep): AllocationValue|undefined;
}

export abstract class BaseNode{
  allocation: NodeAllocation = {};

  allocate(creepId: Id<Creep>, amount: number) {
    this.allocation[creepId] = { id: creepId, value: amount };
  }

  getAllocation(creep: Creep): AllocationValue | undefined {
    return this.allocation[creep.id]
  }

  freeAllocation(id: Id<Creep>): void {
    delete this.allocation[id];
  }
  freeAllAllocations() {
    for (let i in this.allocation) {
      this.freeAllocation(i as Id<Creep>);
    }
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

export abstract class BaseSource<T extends LSourceConstant> extends BaseNode{
  assumeFull: boolean = false;
  constructor(readonly id: Id<T>, readonly resource: LResourceConstant) {
    super()
  }

  getFreeValue(): number {
    const obj = Game.getObjectById(this.id);
    if (!obj) return 0;

    this.clean()

    // use getCapacity, always assume miner is full
    // @ts-ignore
    const storedValue = this.assumeFull ? (obj.store.getCapacity(this.resource) || 0) : (obj.store.getUsedCapacity(this.resource) || 0);

    const allocatedValue = Object.values(this.allocation).reduce((a, alloc) => {
      return a + (alloc?.value || 0);
    }, 0);

    // return 0 if already allocated, 1 creep for 1 miner
    if(this.assumeFull && allocatedValue > 0){
      return 0
    }
    return Math.max(0, storedValue - allocatedValue);
  }



}

export abstract class BaseCreepSource extends BaseSource<Creep> implements LSourceInterface<Creep> {
  pickup(creep: Creep, amount: number): number {
    const other = Game.getObjectById(this.id);
    if (!other) return ERR_INVALID_TARGET;
    return other.transfer(creep, this.resource, Math.min(amount, other.store.getUsedCapacity(this.resource)));
  }
}



