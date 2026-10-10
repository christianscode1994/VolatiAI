import { propagateBelief }
from "../belief/belief-propagation.js";

import { clusterGraph }
from "../clustering/cluster-engine.js";

import { synthesizeKnowledge }
from "../synthesis/synthesis-engine.js";

export async function runKnowledgePipeline(
  graph
) {

  const beliefs =
    propagateBelief(graph);

  const clusters =
    clusterGraph(graph);

  const syntheses =
    clusters.map(c =>
      synthesizeKnowledge(c, graph)
    );

  return {
    beliefs,
    clusters,
    syntheses
  };
}
