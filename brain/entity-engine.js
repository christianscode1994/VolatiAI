export function extractEntities(records) {

  const entities = [];

  for (const record of records) {

    if (record.title) {
      entities.push({
        type: "topic",
        value: record.title
      });
    }

    if (record.company) {
      entities.push({
        type: "company",
        value: record.company
      });
    }

    if (record.project) {
      entities.push({
        type: "project",
        value: record.project
      });
    }
  }

  return entities;
}
