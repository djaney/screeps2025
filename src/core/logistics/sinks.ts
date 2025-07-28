import { BaseNode, LResourceConstant, LSinkInterface } from "./logistics";
type TransferEntities = StructureSpawn|Creep|StructureExtension|StructureTower
export class TransferSink<T extends TransferEntities> extends BaseNode implements LSinkInterface<T>{
  lastTick: number = 0;
  constructor(readonly id: Id<T>, readonly resource: LResourceConstant, readonly emptying: boolean = false) {
    super()
  }

  getRemainingValue(): number {
    const obj = Game.getObjectById(this.id);
    if (!obj) return 0;

    for (let i in this.allocation) {
      // free allocation if creep does not exist
      if (!Game.getObjectById(i as Id<Creep>)) {
        this.freeAllocation(i as Id<Creep>);
      }
    }
    // @ts-ignore
    const storedValue = obj.store.getFreeCapacity(this.resource) || 0;
    const allocatedValue = Object.values(this.allocation).reduce((a, alloc) => {
      return a + (alloc?.value || 0);
    }, 0);
    return Math.max(0, storedValue - allocatedValue);
  }

  deliver(creep: Creep, amount: number): number {
    const other = Game.getObjectById(this.id);
    if (!other) return ERR_INVALID_TARGET;

    // @ts-ignore
    const res = creep.transfer(other, this.resource,this.emptying ? undefined : Math.min(amount, creep.store.getUsedCapacity(this.resource)));
    if(res === OK) this.lastTick = Game.time;
    return res;
  }
}
