/**
 * Source or Sink
 */
class Entity<T extends any[],U> {
  index: any
  set(id: T, data: U): void {
    _.set(this.index, id, data)
  }
  remove(id: T): void{
    _.set(this.index, id, undefined)
  }

  link<V extends any[], W>(localId: T, remote: V){

  }
}

