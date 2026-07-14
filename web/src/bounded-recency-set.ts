export class BoundedRecencySet<Value> {
  readonly #capacity: number;
  readonly #values = new Set<Value>();

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('BoundedRecencySet capacity must be a positive integer.');
    }
    this.#capacity = capacity;
  }

  get size() {
    return this.#values.size;
  }

  add(value: Value) {
    this.#values.delete(value);
    this.#values.add(value);
    if (this.#values.size > this.#capacity) {
      const oldestValue = this.#values.values().next().value as Value;
      this.#values.delete(oldestValue);
    }
    return this;
  }

  has(value: Value) {
    return this.#values.has(value);
  }
}
