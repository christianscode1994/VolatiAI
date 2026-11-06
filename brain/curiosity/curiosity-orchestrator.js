export function generateQuestions(graph) {

  const questions = [];

  for (const node of graph.nodes || []) {

    if ((node.confidence || 0) < 0.4) {

      questions.push({
        target: node.id,
        question: `What additional evidence exists for ${node.label}?`
      });

    }

  }

  return questions;
}
