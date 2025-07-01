// events
export enum Event {
  TEST = "test"
}

// parameters
export type EventParamTest = number;

// mapping
export type EventParam<T> = T extends Event.TEST ? EventParamTest : null;
