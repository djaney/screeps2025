import ServiceInterface from "../ServiceInterface";
import Bot from "../Bot";
import { Priority } from "../core/process-manager/types";

export default class PixelService implements ServiceInterface {
  constructor(readonly bot: Bot) {}

  initialize() {
    this.bot.enqueueProcess({
      priority: Priority.LOW,
      func: () => {
        let bucketSize = Game.cpu.bucket;
        if (Game.cpu.bucket >= 10000) {
          Game.cpu.generatePixel();
          bucketSize = 0;
          console.log("pixel generated");
        }
        const ticksToNextTry = Math.floor(((10000 - bucketSize) / Game.cpu.limit) * 0.9);
        console.log(`generate again after ${ticksToNextTry} ticks`);
        return {
          scheduleIn: { id: "pixel", t: ticksToNextTry }
        };
      }
    });
  }
}
