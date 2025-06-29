import ProcessManager from './process-manager/ProcessManager';
import WorkerCreepService from "./creeps/managers/WorkerCreepService";
import RoomSpawnService from "./rooms/managers/RoomSpawnService";
import ServiceInterface from "./ServiceInterface";
type ServiceMap = {
  worker: WorkerCreepService
  spawn: RoomSpawnService
}

export default class Bot {
  process: ProcessManager
  svc: ServiceMap

  constructor() {
    this.process = new ProcessManager(this);
    this.svc = {
      worker: new WorkerCreepService(this),
      spawn: new RoomSpawnService(this)
    }

  }

  loop(){
    this.process.loop();
  }
}
