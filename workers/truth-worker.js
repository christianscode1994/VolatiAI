import {
  arbitrate
}
from "../brain/truth/arbitration-engine.js";

export default {

  async fetch(request) {

    const graph =
      await request.json();

    const truth =
      arbitrate(graph);

    return Response.json({
      truth
    });
  }
};
