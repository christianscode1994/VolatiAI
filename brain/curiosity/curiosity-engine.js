/**
 * Generate research questions.
 */

export function generateQuestions(
  observations = []
) {

  const questions = [];

  for (const observation of observations) {
    questions.push(
      `Why is ${observation}?`
    );

    questions.push(
      `What causes ${observation}?`
    );

    questions.push(
      `What happens if ${observation} continues?`
    );
  }

  return questions;
}

export function detectKnowledgeGaps(
  data = []
) {
  return data.filter(
    item =>
      item === null ||
      item === undefined ||
      item === ""
  );
}

export default generateQuestions;
