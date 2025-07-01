import ProcessManager from './core/process-manager/ProcessManager';
import WorkerCreepService from "./creeps/WorkerCreepService";
import SpawnManager, { QueueCallback } from "./core/spawn-manager/SpawnManager";
import BaseCreepService from "./core/BaseCreepService";
import { ProcessUnit, ScheduleId } from "./core/process-manager/types";
type ServiceMap = {
  worker: WorkerCreepService
}

type CreepServicePrefixIndex = {
  [prefix in string]?: BaseCreepService
}

export default class Bot {
  private process: ProcessManager
  private spawn: SpawnManager
  creepServices: BaseCreepService[] = []
  creepServicePrefixIndex: CreepServicePrefixIndex = {}

  constructor() {
    this.process = new ProcessManager(this);
    this.spawn = new SpawnManager(this)
    this.creepServices = [new WorkerCreepService(this)]

    // initialize services
    for(let s of Object.values(this.creepServices)){
      if(s.prefix in this.creepServicePrefixIndex){
        throw new Error(`Creep prefix exists ${s.prefix}`)
      }
      this.creepServicePrefixIndex[s.prefix] = s
      s.initialize();
    }

    // run existing creeps
    for(let creepName of _.keys(Game.creeps)){
      const prefix = creepName.split('.').shift();
      if(!prefix) continue;
      this.creepServicePrefixIndex[prefix]?.runCreep(creepName);
    }

  }

  loop(){
    this.process.loop();
  }

  enqueueSpawn(roomId: string, name: string, body: BodyPartConstant[], callback: QueueCallback){
    this.spawn.enqueueSpawn(roomId, name, body, callback);
  }

  enqueueProcess(unit: ProcessUnit){
    this.process.enqueue(unit);
  }

  enqueueProcessIn(id: ScheduleId, unit: ProcessUnit, t: number){
    this.process.enqueueIn(id, unit, t);
  }
}
