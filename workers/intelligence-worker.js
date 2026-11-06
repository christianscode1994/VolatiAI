import {
  arbitrate
}
from "../brain/truth/arbitration-engine.js";

import {
  detectNarratives
}
from "../brain/reasoning/narrative-engine.js";

export default {

  async fetch(request) {

    const graph =
      await request.json();

    const truth =
      arbitrate(graph);

    const narratives =
      detectNarratives(graph);

    return Response.json({
      truth,
      narratives
    });
  }
};
``
