import { ErrorMapper } from "utils/ErrorMapper";
import Bot from "./Bot";
import { Traveler } from "./utils/Traveler/Traveler";

declare global {
  /*
    Example types, expand on these or remove them and add your own.
    Note: Values, properties defined here do no fully *exist* by this type definiton alone.
          You must also give them an implemention if you would like to use them. (ex. actually setting a `role` property in a Creeps memory)

    Types added in this `global` block are in an ambient, global context. This is needed because `main.ts` is a module file (uses import or export).
    Interfaces matching on name from @types/screeps will be merged. This is how you can extend the 'built-in' interfaces from @types/screeps.
  */
  // Memory extension samples
  interface Memory {
    uuid: number;
    log: any;
  }

  interface CreepMemory {
    _travel: any;
    _trav: any;
  }

  interface RoomMemory {
    avoid: any
  }

  // Syntax for adding proprties to `global` (ex "global.log")
  namespace NodeJS {
    interface Global {
      log: any;
    }
  }
}

// assigns a function to Creep.prototype: creep.travelTo(destination)
Creep.prototype.travelTo = function(destination: RoomPosition|{pos: RoomPosition}, options?: TravelToOptions) {
    return Traveler.travelTo(this, destination, options);
};


// When compiling TS to JS and bundling with rollup, the line numbers and file names in error messages change
// This utility uses source maps to get the line numbers and file names of the original, TS source code
const bot = new Bot();
console.log("START")
export const loop = ErrorMapper.wrapLoop(() => {
  bot.loop()
});
