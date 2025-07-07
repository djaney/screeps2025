export declare function getDistanceTransform(
  roomName: string,
  options: {
    innerPositions?: RoomPosition[],
    visual?: boolean
  }
): CostMatrix

export declare function getPositionsByPathCost(
  roomName: string,
  startPositions: RoomPosition[],
  options: {
    costMatrix?: CostMatrix,
    costThreshold?: number,
    visual?: boolean
  }
): CostMatrix

export declare function getMincut(
  roomName: string,
  sources: RoomPosition[],
  costMatrix?: CostMatrix
): RoomPosition[]
