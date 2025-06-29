import Bot from "../../Bot";
import ServiceInterface from "../../ServiceInterface";
import { CreepBody } from "../../creeps/types";

export default class RoomSpawnService implements ServiceInterface {
  constructor(readonly bot: Bot) {}

  enqueueSpawn(roomId: string, name: string, body: BodyPartConstant[], callback: (name: string) => void){
    const room = Game.rooms[roomId];
    if(!room) throw new Error("Cannot enqueueSpawn, room does not visible")

    if(room.energyCapacityAvailable < this.getSpawnCost(body)){
      throw new Error("Cannot enqueueSpawn, exceeds room energy capacity")
    }

    // TODO
  }

  getSpawnCost(body: CreepBody){
    return body.reduce((a, b) => {
      return a + BODYPART_COST[b];
    }, 0)
  }
}
