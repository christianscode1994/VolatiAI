export class PacketRouter {

  constructor() {

    this.routes = new Map();
  }

  register(
    packetType,
    engine
  ) {

    if (
      !this.routes.has(
        packetType
      )
    ) {

      this.routes.set(
        packetType,
        []
      );
    }

    this.routes
      .get(packetType)
      .push(engine);
  }

  getPipeline(
    packetType
  ) {

    return (
      this.routes.get(
        packetType
      ) || []
    );
  }
}

export const router =
  new PacketRouter();
