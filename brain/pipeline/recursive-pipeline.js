export async function recursivePipeline(
  graph,
  iterations = 3
) {

  let state = graph;

  for (let i = 0; i < iterations; i++) {

    state = updateEdgeWeights(state);

    const narratives =
      detectNarratives(state);

    const world =
      buildWorldModel(state);

    const hypotheses =
      generateHypotheses(state);

    const questions =
      generateQuestions(state);

    state.meta = {
      narratives,
      world,
      hypotheses,
      questions
    };
  }

  return state;
}
