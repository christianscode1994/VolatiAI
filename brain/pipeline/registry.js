export class Registry {

  constructor() {
    this.engines = [];
  }

  register(engine) {
    this.engines.push(
      engine
    );
  }

  getAll() {
    return [
      ...this.engines
    ];
  }
}

export const registry =
  new Registry();
