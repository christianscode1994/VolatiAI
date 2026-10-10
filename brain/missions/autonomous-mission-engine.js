export function createMission(question) {

  return {
    id: crypto.randomUUID(),
    objective: question,
    status: "pending",
    priority: "high",
    createdAt: Date.now()
  };
}
