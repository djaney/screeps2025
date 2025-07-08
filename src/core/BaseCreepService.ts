import { CreepBody } from "../creeps/types";
import Bot from "../Bot";
import ServiceInterface from "../ServiceInterface";

export default abstract class BaseCreepService implements ServiceInterface{
  abstract prefix: string;

  constructor(readonly bot: Bot) {
  }

  initialize(){
    this.bot.creepServicePrefixIndex[this.prefix] = this;
  }

  abstract runCreep(name: string): void

  generateCreepName(moreInfo: string[] = []){
    let name;
    let nameIdx = 0
    while (true){
      name = [this.prefix, ...moreInfo, Game.time ,nameIdx].join(".");
      if(!Game.creeps[name]){
        return name;
      }
      nameIdx += 1
    }
  }

  splitCreepName(name: string): string[]{
    return name.split(".")
  }
}
