import { PrintBoxCoordinates } from "./core/visual";

export default interface ServiceInterface {

  initialize(): void
  initializeRoom(roomId: string): void
  debug(coords: PrintBoxCoordinates): PrintBoxCoordinates
}
