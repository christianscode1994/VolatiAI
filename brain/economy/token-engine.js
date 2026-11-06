export function balance(events) {

  return events.reduce(
    (total, event) => {

      if (
        event.type === "reward"
      ) {
        total += event.amount;
      }

      if (
        event.type === "penalty"
      ) {
        total -= event.amount;
      }

      return total;

    },
    0
  );
}
