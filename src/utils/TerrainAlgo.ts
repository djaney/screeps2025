export default class TerrainAlgo {
  static ring(x: number, y: number, r: number): [number, number][] {
    const out: [number, number][] = []
    x = x - r
    y = y - r
    // right
    for(let i = 0; i < 2*r+1; i++){
      out.push([x, y])
      x += 1
    }
    y += 1
    x -= 1
    // down
    for(let i = 0; i < 2*r; i++){
      out.push([x, y])
      y += 1
    }
    x -= 1
    y -= 1
    // left
    for(let i = 0; i < 2*r; i++){
      out.push([x, y])
      x -= 1
    }
    y -= 1
    x += 1
    // up
    for(let i = 0; i < 2*r-1; i++){
      out.push([x, y])
      y -= 1
    }
    return out
  }
}
