const None : null = null
type Option<T> = Some<T> | null

class Some<T> {
  internal: T;
  constructor(x: T) { this.internal = x }
  unwrap(): T {
    return this.internal;
  }
}

class Maybe<T1> {
  self: Option<T1>;
  constructor(a: Option<T1>) { this.self = a }
  then<T2>(fn: (a: T1) => Option<T2>) {
    if (isNone(this.self)) return new Maybe<T2>(None);
    else return new Maybe(fn(this.self.unwrap()));
  }
  unwrap_or(d: T1) {
    if (isSome(this.self)) return this.self.unwrap();
    else return d;
  }
}

function isNone<T>(x : Option<T>): x is null {
  return x === None;
}

function isSome<T>(x : Option<T>): x is Some<T> {
  return !isNone(x);
}

export { Option, Some, None, isNone, isSome, Maybe }
