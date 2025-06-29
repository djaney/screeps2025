import { CreepBody } from "../types";
import Bot from "../../Bot";
import ServiceInterface from "../../ServiceInterface";

export default abstract class BaseCreepService implements ServiceInterface{
  abstract prefix: string;
  abstract levelBodies: CreepBody[];

  constructor(readonly bot: Bot) {
  }

  generateCreepName(){
    let name;
    let nameIdx = 0
    while (!name){
      name = `${this.prefix}${nameIdx}`
      if(!Game.creeps[name]) return name;
    }
    throw new Error("Cannot find name")
  }

  spawn(room: Room, parts: BodyPartConstant[]){
    const name = this.generateCreepName();
    // TODO ned spawn manager to manage spawns in room

  }
}
