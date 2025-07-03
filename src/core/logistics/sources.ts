import { BaseCreepSource, LSourceInterface } from "./logistics";

export class LSourceMiner extends BaseCreepSource implements LSourceInterface<Creep>{
  assumeFull = true
}
