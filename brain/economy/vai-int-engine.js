export function computeVAI(
  events
) {

  return events.reduce(
    (total, event) => {

      switch (
        event.type
      ) {

        case "validated_claim":
          return total + 10;

        case "supported_claim":
          return total + 5;

        case "useful_signal":
          return total + 3;

        case "rejected_claim":
          return total - 10;

        case "false_signal":
          return total - 20;

        default:
          return total;
      }
    },
    0
  );
}
