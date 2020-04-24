/**
 * A wrapper around a value of type `T` that can be subscribed to whenever the
 * underlying value changes.
 */
export class Observable<T> {
  private _listeners: Set<(arg: T) => void> = new Set();
  private _value: T;
  /** Returns the current value. */
  get value() {
    return this._value;
  }
  /** Every change to the value triggers all the registered callbacks. */
  set value(value: T) {
    this._value = value;
    this._listeners.forEach(fn => fn(value));
  }

  constructor(value: T) {
    this._value = value;
  }

  /**
   * Registers a listener function that's called whenever the underlying value
   * changes.
   * @returns a function that unregisters the listener when called.
   */
  public observe(fn: (arg: T) => void): () => void {
    this._listeners.add(fn);

    return () => this._listeners.delete(fn);
  }
}

/**
 * Capable of observing an `Observable<T>` type.
 *
 * Convenient when using a single observer that potentially binds multiple times
 * to different observables, where it automatically unregisters from previous
 * observables.
 */
// tslint:disable-next-line: max-classes-per-file
export class Observer<T> {
  private _observable?: Observable<T>;
  private _stopObserving?: () => void;
  /** Returns the current value of a bound observable, if there is one. */
  get value() {
    return this._observable && this._observable.value;
  }
  /**
   * Binds to an observable value, along with the provided listener that's
   * called whenever the underlying value changes.
   */
  public bind(observable: Observable<T>, handler: (arg: T) => void) {
    this.stop();

    this._observable = observable;
    this._stopObserving = observable.observe(handler);
  }
  /** Unbinds from the observable, deregistering the previously bound callback. */
  public stop() {
    if (this._stopObserving) {
      this._stopObserving();
      delete this._stopObserving;
    }
    if (this._observable) {
      delete this._observable;
    }
  }
}
