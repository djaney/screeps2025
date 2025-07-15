import ProcessManager from './core/process-manager/ProcessManager';
import WorkerCreepService from "./creeps/WorkerCreepService";
import SpawnManager, { QueueCallback } from "./core/spawn-manager/SpawnManager";
import BaseCreepService from "./core/BaseCreepService";
import { Priority, ProcessUnit, ScheduleId } from "./core/process-manager/types";
import ServiceInterface from "./ServiceInterface";
import PixelService from "./services/PixelService";
import { BasePlanningService } from "./services/BasePlanningService";
import TowerService from "./services/TowerService";
import ExplorationCreepService from "./creeps/ExplorationCreepService";
type ServiceMap = {
  worker: WorkerCreepService
}

type CreepServicePrefixIndex = {
  [prefix in string]?: BaseCreepService
}

export default class Bot {
  private process: ProcessManager;
  private spawn: SpawnManager;
  creepServices: BaseCreepService[] = []
  services: ServiceInterface[] = []
  creepServicePrefixIndex: CreepServicePrefixIndex = {}

  constructor() {
    this.process = new ProcessManager(this);
    this.spawn = new SpawnManager(this);
    this.initialize();

    // initialize services
    for(let s of Object.values(this.creepServices)){
      if(s.prefix in this.creepServicePrefixIndex){
        throw new Error(`Creep prefix exists ${s.prefix}`)
      }
      this.creepServicePrefixIndex[s.prefix] = s
    }

    // run existing creeps
    for(let creepName of _.keys(Game.creeps)){
      const prefix = creepName.split('.').shift();
      if(!prefix) continue;
      this.creepServicePrefixIndex[prefix]?.runCreep(creepName);
    }

    for(let s of Object.values(this.creepServices)){
      s.initialize();
    }

    // initialize services
    for(let s of Object.values(this.services)){
      s.initialize();
    }

  }

  initialize(){
    this.creepServices = [new WorkerCreepService(this), new ExplorationCreepService(this)]
    this.services = [new PixelService(this), new BasePlanningService(this), new TowerService(this)]

    // clean creep memory
    this.enqueueProcessIn("cleanCreepsMemory", {
      priority: Priority.LOW,
      func: () => {
        for(let i in Memory.creeps){
          if(!Game.creeps[i]) delete Memory.creeps[i]
        }
        return {scheduleIn: {id: "cleanCreepsMemory", t: 30}}
      },
    }, 30);
  }

  loop(){
    this.process.loop();
  }

  enqueueSpawn(roomId: string, name: string, body: BodyPartConstant[], callback: QueueCallback){
    this.spawn.enqueueSpawn(roomId, name, body, callback);
  }

  clearSpawnQueue(roomId: string){
    return this.spawn.clearSpawnQueue(roomId);
  }

  countSpawnQueue(roomId: string): number{
    return this.spawn.countSpawnQueue(roomId);
  }

  enqueueProcess(unit: ProcessUnit){
    this.process.enqueue(unit);
  }

  enqueueProcessIn(id: ScheduleId, unit: ProcessUnit, t: number){
    this.process.enqueueIn(id, unit, t);
  }
}
