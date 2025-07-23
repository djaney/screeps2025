import { BaseCreepSource, BaseSource, LSourceInterface } from "./logistics";

export class LSourceMiner extends BaseCreepSource implements LSourceInterface<Creep>{
  assumeFull = true
}

export class StorageSource extends BaseSource<StructureStorage> implements LSourceInterface<StructureStorage> {
  pickup(creep: Creep, amount: number): number {
    const other = Game.getObjectById(this.id);
    if (!other) return ERR_INVALID_TARGET;
    return creep.withdraw(other, this.resource, Math.min(amount, other.store.getUsedCapacity(this.resource)))
  }
}
