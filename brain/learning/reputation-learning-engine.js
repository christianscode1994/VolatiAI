export function updateReputation(
    currentRep,
    accuracy
) {

    const learningRate = 0.1;

    return (
        currentRep +
        learningRate *
        (accuracy - currentRep)
    );
}
