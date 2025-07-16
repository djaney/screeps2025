export type PrintBoxCoordinates = {
  x: number;
  y: number;
  w: number;
};
export type PrintBoxCallback = (coords: PrintBoxCoordinates) => PrintBoxCoordinates;

export function printBox(
  room: Room,
  title: string,
  coords: PrintBoxCoordinates,
  cb: PrintBoxCallback
): PrintBoxCoordinates {
  room.visual.text(title, coords.x, coords.y++, {
    align: "left",
    strokeWidth: 4
  });
  return cb(coords);
}
