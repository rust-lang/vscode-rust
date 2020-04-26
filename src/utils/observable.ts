import { Disposable } from 'vscode';

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
  public observe(fn: (arg: T) => void): Disposable {
    this._listeners.add(fn);

    return { dispose: () => this._listeners.delete(fn) };
  }
}
